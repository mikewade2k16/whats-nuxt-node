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
import { invalidateCoreAtendimentoAccessCacheByEmail } from "../services/core-atendimento-access.js";
import { CoreApiError, type CoreTenant, platformCoreClient } from "../services/core-client.js";
import { mapCoreRoleCodesToLegacyRole, mapLegacyRoleToCoreRoleCodes } from "../services/core-identity.js";
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

async function resolveBootstrapTenantSlugByEmail(email: string) {
  const localUsers = await prisma.user.findMany({
    where: {
      email
    },
    include: {
      tenant: true
    },
    take: 5
  });

  const uniqueSlugs = new Set(
    localUsers
      .map((entry: (typeof localUsers)[number]) => entry.tenant?.slug?.trim().toLowerCase())
      .filter((value: string | undefined): value is string => Boolean(value))
  );

  if (uniqueSlugs.size !== 1) {
    return "";
  }

  return Array.from(uniqueSlugs)[0] ?? "";
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

function isCoreInviteAlreadyHandled(error: CoreApiError) {
  if (error.statusCode === 409) {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("already") ||
    message.includes("exists") ||
    message.includes("ja existe") ||
    message.includes("duplic")
  );
}

async function bootstrapCoreUserFromLegacyCredentials(options: {
  coreTenantId: string;
  tenantSlug: string;
  email: string;
  password: string;
  logger: FastifyInstance["log"];
}) {
  const localTenant = await prisma.tenant.findUnique({
    where: {
      slug: options.tenantSlug
    }
  });

  if (!localTenant) {
    return false;
  }

  const localUser = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: localTenant.id,
        email: options.email
      }
    }
  });

  if (!localUser) {
    return false;
  }

  const passwordMatches = await bcrypt.compare(options.password, localUser.passwordHash);
  if (!passwordMatches) {
    return false;
  }

  try {
    const invited = await platformCoreClient.inviteTenantUser(options.coreTenantId, {
      email: localUser.email,
      name: localUser.name,
      password: options.password,
      isOwner: localUser.role === UserRole.ADMIN,
      roleCodes: mapLegacyRoleToCoreRoleCodes(localUser.role)
    });

    if (localUser.role === UserRole.ADMIN) {
      try {
        await platformCoreClient.assignTenantUserToModule(
          options.coreTenantId,
          env.CORE_ATENDIMENTO_MODULE_CODE,
          invited.tenantUserId
        );
        await invalidateCoreAtendimentoAccessCacheByEmail(localUser.email);
      } catch (assignmentError) {
        options.logger.warn(
          { error: assignmentError, coreTenantId: options.coreTenantId, tenantUserId: invited.tenantUserId },
          "Falha ao vincular usuario bootstrap admin ao modulo atendimento"
        );
      }
    }

    return true;
  } catch (error) {
    if (error instanceof CoreApiError && isCoreInviteAlreadyHandled(error)) {
      return true;
    }
    throw error;
  }
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

      let coreLogin;
      try {
        coreLogin = await platformCoreClient.loginUser(
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
      } catch (error) {
        if (!(error instanceof CoreApiError) || (error.statusCode !== 401 && error.statusCode !== 403)) {
          throw error;
        }

        const bootstrapTenantSlug: string = tenantSlug || await resolveBootstrapTenantSlugByEmail(email);
        const bootstrapTenant = bootstrapTenantSlug
          ? await resolveCoreTenantBySlug(String(bootstrapTenantSlug))
          : null;
        const bootstrapApplied = bootstrapTenant && bootstrapTenantSlug
          ? await bootstrapCoreUserFromLegacyCredentials({
              coreTenantId: bootstrapTenant.id,
              tenantSlug: bootstrapTenantSlug,
              email,
              password,
              logger: request.log
            })
          : false;

        if (bootstrapApplied && bootstrapTenant) {
          coreTenant = bootstrapTenant;
          coreLogin = await platformCoreClient.loginUser({
            email,
            password,
            tenantId: bootstrapTenant.id
          });
        } else {
          throw error;
        }
      }

      const coreUser = coreLogin.user;
      if (!coreUser.email || normalizeEmail(coreUser.email) !== email) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      if (!coreTenant && coreUser.tenantId) {
        coreTenant = await resolveCoreTenantById(coreUser.tenantId);
      }

      if (!coreTenant) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      if (!coreUser.isPlatformAdmin && coreUser.tenantId && coreUser.tenantId !== coreTenant.id) {
        return reply.code(401).send({ message: "Credenciais invalidas" });
      }

      let role: UserRole = coreUser.isPlatformAdmin ? UserRole.ADMIN : UserRole.VIEWER;
      try {
        role = await resolveLegacyRoleByCoreTenant({
          coreTenantId: coreTenant.id,
          email,
          isPlatformAdmin: coreUser.isPlatformAdmin
        });
      } catch (roleError) {
        request.log.warn({ error: roleError, email, coreTenantId: coreTenant.id }, "Falha ao resolver role no core");
      }

      const localTenant = await ensureLocalTenant(coreTenant, tenantSlug);
      const localUser = await ensureLocalUser({
        tenantId: localTenant.id,
        email,
        name: coreUser.name?.trim() || email,
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
        },
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
}
