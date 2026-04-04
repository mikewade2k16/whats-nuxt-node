import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { rateLimitRequest } from "../lib/rate-limit.js";
import { resolveTrustedClientIp } from "../lib/trusted-proxy.js";
import type { JwtUser } from "../plugins/auth.js";
import { resolveCoreAtendimentoAccessByEmail } from "../services/core-atendimento-access.js";
import { CoreApiError, type CoreAuthUser, type CoreTenant, platformCoreClient } from "../services/core-client.js";
import { mapCoreRoleCodesToLegacyRole } from "../services/core-identity.js";
import { findBestCoreTenantMatch } from "../services/core-tenant-mapping.js";

const loginSchema = z.object({
  tenantSlug: z.string().min(2).optional(),
  email: z.string().email(),
  password: z.string().min(6)
});

function normalizeTenantSlug(value: string) {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function resolveRequestIp(request: FastifyRequest) {
  return resolveTrustedClientIp({
    peerIp: request.ip || request.socket?.remoteAddress,
    forwardedFor: request.headers["x-forwarded-for"],
    trustedRanges: env.TRUSTED_PROXY_RANGES
  });
}

async function resolveCoreTenantBySlug(tenantSlug: string) {
  const normalizedSlug = normalizeTenantSlug(tenantSlug);
  const directMatch = await platformCoreClient.findTenantBySlug(normalizedSlug);
  if (directMatch) {
    return directMatch;
  }

  const coreTenants = await platformCoreClient.listTenants();
  return findBestCoreTenantMatch({
    localSlug: normalizedSlug,
    coreTenants
  }) as CoreTenant | null;
}

async function resolveCoreTenantById(tenantId: string) {
  const normalizedId = tenantId.trim();
  if (!normalizedId) {
    return null;
  }

  const directMatch = await platformCoreClient.findTenantById(normalizedId);
  if (directMatch) {
    return directMatch;
  }

  const coreTenants = await platformCoreClient.listTenants();
  return coreTenants.find((entry) => entry.id === normalizedId) ?? null;
}

async function resolveLegacyRoleByCoreTenant(options: {
  coreTenantId: string;
  email: string;
  isPlatformAdmin: boolean;
}) {
  if (options.isPlatformAdmin) {
    return UserRole.ADMIN;
  }

  const coreUsers = await platformCoreClient.listTenantUsers(options.coreTenantId);
  const matchedUser = coreUsers.find((entry) => normalizeEmail(entry.email) === options.email);
  if (!matchedUser) {
    return UserRole.VIEWER;
  }

  const roleEntries = await platformCoreClient.listTenantUserRoles(options.coreTenantId, matchedUser.tenantUserId);
  const roleCodes = roleEntries.map((entry) => entry.roleCode);
  return mapCoreRoleCodesToLegacyRole(roleCodes, matchedUser.isOwner);
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const entry of source) {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function mapCoreUserToLegacyRole(coreUser: CoreAuthUser) {
  if (coreUser.isPlatformAdmin) {
    return UserRole.ADMIN;
  }

  const level = String(coreUser.level ?? "").trim().toLowerCase();
  if (level === "admin") {
    return UserRole.ADMIN;
  }
  if (level === "manager") {
    return UserRole.SUPERVISOR;
  }

  const moduleCodes = normalizeModuleCodes(coreUser.moduleCodes);
  const hasAtendimentoAccess =
    Boolean(coreUser.atendimentoAccess) ||
    moduleCodes.includes(env.CORE_ATENDIMENTO_MODULE_CODE.trim().toLowerCase());

  if (hasAtendimentoAccess) {
    return UserRole.AGENT;
  }

  return UserRole.VIEWER;
}

async function resolveLegacyRoleForCoreUser(options: {
  coreTenantId: string;
  coreUser: CoreAuthUser;
}) {
  const fallbackRole = mapCoreUserToLegacyRole(options.coreUser);
  if (options.coreUser.isPlatformAdmin) {
    return fallbackRole;
  }

  try {
    const resolvedRole = await resolveLegacyRoleByCoreTenant({
      coreTenantId: options.coreTenantId,
      email: normalizeEmail(options.coreUser.email),
      isPlatformAdmin: options.coreUser.isPlatformAdmin
    });

    if (resolvedRole !== UserRole.VIEWER || fallbackRole === UserRole.VIEWER) {
      return resolvedRole;
    }
  } catch {
    // Fallback keeps login functional even if the core RBAC lookup is temporarily inconsistent.
  }

  return fallbackRole;
}

async function ensureLocalTenant(coreTenant: CoreTenant, requestedSlug: string) {
  const normalizedRequestedSlug = normalizeTenantSlug(requestedSlug || coreTenant.slug);

  const existingBySlug = await prisma.tenant.findUnique({
    where: {
      slug: normalizedRequestedSlug
    }
  });
  if (existingBySlug) {
    if (existingBySlug.name !== coreTenant.name) {
      return prisma.tenant.update({
        where: { id: existingBySlug.id },
        data: { name: coreTenant.name }
      });
    }
    return existingBySlug;
  }

  const existingByName = await prisma.tenant.findFirst({
    where: {
      name: coreTenant.name
    }
  });
  if (existingByName) {
    return existingByName;
  }

  return prisma.tenant.create({
    data: {
      slug: normalizedRequestedSlug,
      name: coreTenant.name
    }
  });
}

async function ensureLocalUser(options: {
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
}) {
  const existing = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: options.tenantId,
        email: options.email
      }
    }
  });

  if (existing) {
    if (existing.name !== options.name || existing.role !== options.role) {
      return prisma.user.update({
        where: {
          id: existing.id
        },
        data: {
          name: options.name,
          role: options.role
        }
      });
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(`core-shadow-${randomUUID()}`, 8);
  return prisma.user.create({
    data: {
      tenantId: options.tenantId,
      email: options.email,
      name: options.name,
      role: options.role,
      passwordHash
    }
  });
}

async function resolveCoreTenantForUser(coreUser: CoreAuthUser) {
  if (coreUser.tenantId?.trim()) {
    return resolveCoreTenantById(coreUser.tenantId);
  }

  if (coreUser.isPlatformAdmin) {
    return resolveCoreTenantBySlug("root");
  }

  return null;
}

async function buildLocalSession(app: FastifyInstance, options: {
  coreTenant: CoreTenant;
  coreUser: CoreAuthUser;
  requestedTenantSlug?: string;
}) {
  const email = normalizeEmail(options.coreUser.email);
  const role = await resolveLegacyRoleForCoreUser({
    coreTenantId: options.coreTenant.id,
    coreUser: options.coreUser
  });

  const localTenant = await ensureLocalTenant(options.coreTenant, options.requestedTenantSlug || options.coreTenant.slug);
  const localUser = await ensureLocalUser({
    tenantId: localTenant.id,
    email,
    name: options.coreUser.name?.trim() || email,
    role
  });

  const payload: JwtUser = {
    sub: localUser.id,
    tenantId: localTenant.id,
    tenantSlug: localTenant.slug,
    email: localUser.email,
    name: localUser.name,
    role: localUser.role
  };

  const token = app.jwt.sign(payload, {
    expiresIn: "12h"
  });

  return {
    token,
    user: {
      id: localUser.id,
      tenantId: localTenant.id,
      tenantSlug: localTenant.slug,
      email: localUser.email,
      name: localUser.name,
      role: localUser.role
    }
  };
}

function extractCoreAccessToken(request: FastifyRequest) {
  const rawCoreToken = request.headers["x-core-token"];
  const rawAuthorization = request.headers.authorization;
  const preferred = Array.isArray(rawCoreToken)
    ? String(rawCoreToken[0] ?? "").trim()
    : String(rawCoreToken ?? "").trim();
  const fallback = Array.isArray(rawAuthorization)
    ? String(rawAuthorization[0] ?? "").trim()
    : String(rawAuthorization ?? "").trim();
  const token = preferred || fallback;

  if (!token) {
    return "";
  }

  return token.startsWith("Bearer ") ? token.slice("Bearer ".length).trim() : token;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const requestIp = resolveRequestIp(request);
    const ipRateLimit = await rateLimitRequest({
      scope: "auth.login.ip",
      key: requestIp,
      max: 12,
      windowMs: 5 * 60_000,
      blockMs: 15 * 60_000
    });

    reply.header("x-rate-limit-limit", "12");
    reply.header("x-rate-limit-remaining", String(ipRateLimit.remaining));
    reply.header("x-rate-limit-reset", String(Math.ceil(ipRateLimit.resetAt / 1_000)));

    if (!ipRateLimit.allowed) {
      reply.header("retry-after", String(ipRateLimit.retryAfterSeconds));
      return reply.code(429).send({
        message: "Muitas tentativas de login. Aguarde antes de tentar novamente."
      });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenantSlug = normalizeTenantSlug(parsed.data.tenantSlug ?? "");
    const email = normalizeEmail(parsed.data.email);
    const password = parsed.data.password;
    const credentialRateLimit = await rateLimitRequest({
      scope: "auth.login.credential",
      key: `${tenantSlug || "auto"}:${email}:${requestIp}`,
      max: 8,
      windowMs: 10 * 60_000,
      blockMs: 20 * 60_000
    });

    reply.header("x-rate-limit-limit", "8");
    reply.header("x-rate-limit-remaining", String(credentialRateLimit.remaining));
    reply.header("x-rate-limit-reset", String(Math.ceil(credentialRateLimit.resetAt / 1_000)));

    if (!credentialRateLimit.allowed) {
      reply.header("retry-after", String(credentialRateLimit.retryAfterSeconds));
      return reply.code(429).send({
        message: "Muitas tentativas de login. Aguarde antes de tentar novamente."
      });
    }

    try {
      let coreTenant = tenantSlug ? await resolveCoreTenantBySlug(tenantSlug) : null;
      if (tenantSlug && !coreTenant) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      const coreLogin = await platformCoreClient.loginUser(
        coreTenant
          ? {
              email,
              password,
              tenantId: coreTenant.id
            }
          : {
              email,
              password
            }
      );

      const coreUser = coreLogin.user;
      if (!coreUser.email || normalizeEmail(coreUser.email) !== email) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      if (!coreTenant) {
        coreTenant = await resolveCoreTenantForUser(coreUser);
      }

      if (!coreTenant) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      if (!coreUser.isPlatformAdmin && coreUser.tenantId && coreUser.tenantId !== coreTenant.id) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      const localSession = await buildLocalSession(app, {
        coreTenant,
        coreUser,
        requestedTenantSlug: tenantSlug
      });

      return {
        token: localSession.token,
        user: localSession.user,
        coreAccessToken: coreLogin.accessToken,
        coreUser
      };
    } catch (error) {
      if (error instanceof CoreApiError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          return reply.code(401).send({ message: "Credenciais invalidas" });
        }

        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        const message = statusCode >= 500 && env.NODE_ENV === "production"
          ? "Falha ao autenticar"
          : (error.message?.trim() || "Falha ao autenticar no platform-core");

        return reply.code(statusCode).send({
          message,
          details: env.NODE_ENV === "production" ? undefined : error.details ?? null
        });
      }

      request.log.error({ error, tenantSlug: tenantSlug || null, email }, "Falha no login unificado via platform-core");
      return reply.code(500).send({
        message: "Falha ao autenticar no platform-core"
      });
    }
  });

  app.post("/auth/session", async (request, reply) => {
    const coreAccessToken = extractCoreAccessToken(request);
    if (!coreAccessToken) {
      return reply.code(401).send({ message: "Sessao core ausente" });
    }

    try {
      const coreUser = await platformCoreClient.getMe(coreAccessToken);
      const coreTenant = await resolveCoreTenantForUser(coreUser);
      if (!coreTenant) {
        return reply.code(401).send({ message: "Sessao core invalida" });
      }

      const localSession = await buildLocalSession(app, {
        coreTenant,
        coreUser,
        requestedTenantSlug: coreTenant.slug
      });

      return localSession;
    } catch (error) {
      if (error instanceof CoreApiError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          return reply.code(401).send({ message: "Sessao core invalida" });
        }

        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          message: statusCode >= 500
            ? "Falha ao criar sessao do modulo"
            : (error.message?.trim() || "Falha ao criar sessao do modulo")
        });
      }

      request.log.error({ error }, "Falha ao criar sessao local a partir do core");
      return reply.code(500).send({
        message: "Falha ao criar sessao do modulo"
      });
    }
  });

  const switchTenantSchema = z.object({
    coreTenantId: z.string().min(1).optional(),
    clientId: z.number().int().positive().optional()
  }).refine(
    (data) => Boolean(data.coreTenantId || data.clientId),
    { message: "Informe coreTenantId ou clientId" }
  );

  app.post("/auth/switch-tenant", async (request, reply) => {
    try {
      const user = await request.jwtVerify<JwtUser>();
      request.authUser = user;
    } catch {
      return reply.code(401).send({ message: "Nao autorizado" });
    }

    const access = await resolveCoreAtendimentoAccessByEmail(request.authUser.email);
    const isSuperRoot = access.isPlatformAdmin
      && access.userType === "admin"
      && access.level === "admin";

    if (!isSuperRoot) {
      return reply.code(403).send({ message: "Apenas platform admins podem trocar de tenant" });
    }

    const parsed = switchTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    try {
      let coreTenant: CoreTenant | null = null;
      let clientModuleCodes: string[] = [];

      if (parsed.data.coreTenantId) {
        coreTenant = await resolveCoreTenantById(parsed.data.coreTenantId);
      } else if (parsed.data.clientId) {
        const clients = await platformCoreClient.listAdminClients({ limit: 500 });
        const matched = clients.find((entry) => entry.id === parsed.data.clientId);
        if (matched?.coreTenantId) {
          coreTenant = await resolveCoreTenantById(matched.coreTenantId);
          clientModuleCodes = (matched.modules ?? [])
            .map((m) => String(m.code ?? "").trim().toLowerCase())
            .filter(Boolean);
        }
      }

      if (!coreTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      if (clientModuleCodes.length > 0 && !clientModuleCodes.includes(env.CORE_ATENDIMENTO_MODULE_CODE.toLowerCase())) {
        return reply.code(403).send({
          message: "Cliente nao possui o modulo de atendimento ativo"
        });
      }

      const localTenant = await ensureLocalTenant(coreTenant, coreTenant.slug);
      const localUser = await ensureLocalUser({
        tenantId: localTenant.id,
        email: request.authUser.email,
        name: request.authUser.name,
        role: UserRole.ADMIN
      });

      const payload: JwtUser = {
        sub: localUser.id,
        tenantId: localTenant.id,
        tenantSlug: localTenant.slug,
        email: localUser.email,
        name: localUser.name,
        role: localUser.role
      };

      const token = app.jwt.sign(payload, {
        expiresIn: "12h"
      });

      return {
        token,
        user: {
          id: localUser.id,
          tenantId: localTenant.id,
          tenantSlug: localTenant.slug,
          email: localUser.email,
          name: localUser.name,
          role: localUser.role
        }
      };
    } catch (error) {
      request.log.error({ error }, "Falha ao trocar tenant");
      return reply.code(500).send({
        message: "Falha ao trocar de tenant"
      });
    }
  });
}
