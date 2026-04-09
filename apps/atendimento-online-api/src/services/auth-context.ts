import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../config.js";
import { prisma } from "../db.js";
import type { JwtUser } from "../plugins/auth.js";
import {
  CoreApiError,
  type CoreAdminClient,
  type CoreAuthUser,
  type CoreTenant,
  platformCoreClient
} from "./core-client.js";
import { mapCoreRoleCodesToLegacyRole } from "./core-identity.js";
import { findBestCoreTenantMatch } from "./core-tenant-mapping.js";

export type AuthTokenSource = "core-token";

export interface AuthContextResolution {
  authUser: JwtUser;
  source: AuthTokenSource;
  coreAccessToken: string | null;
  coreUser: CoreAuthUser | null;
  coreAccess: CoreAuthAccessSnapshot;
  tenantModuleCodes: string[];
}

export interface CoreAuthAccessSnapshot {
  email: string;
  isPlatformAdmin: boolean;
  level: string;
  userType: string;
  moduleCodes: string[];
  atendimentoAccess: boolean;
}

export class AuthContextError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode = 401, details: unknown = null) {
    super(message);
    this.name = "AuthContextError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface ResolvedLegacyRole {
  role: UserRole;
  coreTenantUserId: string | null;
}

export function normalizeTenantSlug(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptionalIdentity(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function throwIdentityProjectionConflict(
  entity: "tenant" | "user",
  details: Record<string, unknown>
): never {
  throw new AuthContextError(`Conflito na projecao local de ${entity}`, 409, details);
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

export function resolveCoreAuthAccessSnapshot(coreUser: CoreAuthUser | null | undefined): CoreAuthAccessSnapshot {
  const moduleCodes = normalizeModuleCodes(coreUser?.moduleCodes);
  const atendimentoAccess =
    Boolean(coreUser?.atendimentoAccess) ||
    moduleCodes.includes(env.CORE_ATENDIMENTO_MODULE_CODE.trim().toLowerCase());

  return {
    email: normalizeEmail(String(coreUser?.email ?? "")),
    isPlatformAdmin: Boolean(coreUser?.isPlatformAdmin),
    level: String(coreUser?.level ?? "").trim().toLowerCase() || "marketing",
    userType: String(coreUser?.userType ?? "").trim().toLowerCase() || "client",
    moduleCodes,
    atendimentoAccess
  };
}

export function isPlatformSuperRoot(access: CoreAuthAccessSnapshot | null | undefined) {
  return Boolean(
    access?.isPlatformAdmin &&
    access.userType === "admin" &&
    access.level === "admin"
  );
}

export function canAccessAtendimentoModule(access: CoreAuthAccessSnapshot | null | undefined) {
  return isPlatformSuperRoot(access) || Boolean(access?.atendimentoAccess);
}

export function normalizeAccessToken(value: unknown) {
  const rawValue = Array.isArray(value)
    ? String(value[0] ?? "").trim()
    : String(value ?? "").trim();

  if (!rawValue) {
    return "";
  }

  return rawValue.startsWith("Bearer ")
    ? rawValue.slice("Bearer ".length).trim()
    : rawValue;
}

export function extractRequestAccessToken(request: FastifyRequest) {
  return normalizeAccessToken(request.headers["x-core-token"])
    || normalizeAccessToken(request.headers.authorization);
}

export function extractRequestedTenantSlug(request: FastifyRequest) {
  const rawValue = Array.isArray(request.headers["x-selected-tenant-slug"])
    ? request.headers["x-selected-tenant-slug"][0]
    : request.headers["x-selected-tenant-slug"];

  return normalizeTenantSlug(String(rawValue ?? ""));
}

export function normalizePositiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

export function extractRequestedClientId(request: FastifyRequest) {
  const rawValue = Array.isArray(request.headers["x-client-id"])
    ? request.headers["x-client-id"][0]
    : request.headers["x-client-id"];

  return normalizePositiveInteger(rawValue);
}

export async function resolveCoreTenantBySlug(
  tenantSlug: string,
  options: { accessToken?: string | null } = {}
) {
  const normalizedSlug = normalizeTenantSlug(tenantSlug);
  const directMatch = await platformCoreClient.findTenantBySlug(normalizedSlug, {
    accessToken: options.accessToken
  });
  if (directMatch) {
    return directMatch;
  }

  const coreTenants = await platformCoreClient.listTenants({
    accessToken: options.accessToken
  });
  return findBestCoreTenantMatch({
    localSlug: normalizedSlug,
    coreTenants
  }) as CoreTenant | null;
}

export async function resolveCoreTenantById(
  tenantId: string,
  options: { accessToken?: string | null } = {}
) {
  const normalizedId = tenantId.trim();
  if (!normalizedId) {
    return null;
  }

  const directMatch = await platformCoreClient.findTenantById(normalizedId, {
    accessToken: options.accessToken
  });
  if (directMatch) {
    return directMatch;
  }

  const coreTenants = await platformCoreClient.listTenants({
    accessToken: options.accessToken
  });
  return coreTenants.find((entry) => entry.id === normalizedId) ?? null;
}

async function resolveCoreAdminClientById(
  clientId: number,
  options: { accessToken?: string | null } = {}
): Promise<CoreAdminClient | null> {
  const normalizedClientId = normalizePositiveInteger(clientId);
  if (normalizedClientId <= 0) {
    return null;
  }

  const clients = await platformCoreClient.listAdminClients({
    limit: 500,
    accessToken: options.accessToken
  });
  return clients.find((entry) => Number(entry.id) === normalizedClientId) ?? null;
}

async function resolveCoreTenantContextByClientId(
  clientId: number,
  options: { accessToken?: string | null } = {}
) {
  const matchedClient = await resolveCoreAdminClientById(clientId, options);
  if (!matchedClient?.coreTenantId?.trim()) {
    return {
      coreTenant: null,
      tenantModuleCodes: [] as string[]
    };
  }

  return {
    coreTenant: await resolveCoreTenantById(matchedClient.coreTenantId, options),
    tenantModuleCodes: normalizeModuleCodes(
      (matchedClient.modules ?? []).map((entry) => entry.code)
    )
  };
}

export async function resolveCoreTenantByClientId(
  clientId: number,
  options: { accessToken?: string | null } = {}
) {
  const resolved = await resolveCoreTenantContextByClientId(clientId, options);
  return resolved.coreTenant;
}

function resolveTenantModuleCodesFromCoreUser(coreUser: CoreAuthUser) {
  const access = resolveCoreAuthAccessSnapshot(coreUser);
  if (isPlatformSuperRoot(access)) {
    return [] as string[];
  }

  return access.moduleCodes;
}

async function resolveLegacyRoleByCoreTenant(options: {
  coreTenantId: string;
  coreUserId: string;
  email: string;
  isPlatformAdmin: boolean;
  accessToken?: string | null;
}): Promise<ResolvedLegacyRole> {
  if (options.isPlatformAdmin) {
    return {
      role: UserRole.ADMIN,
      coreTenantUserId: null
    };
  }

  const coreUsers = await platformCoreClient.listTenantUsers(options.coreTenantId, {
    accessToken: options.accessToken
  });
  const matchedUser =
    coreUsers.find((entry) => entry.userId === options.coreUserId)
    ?? coreUsers.find((entry) => normalizeEmail(entry.email) === options.email);

  if (!matchedUser) {
    return {
      role: UserRole.VIEWER,
      coreTenantUserId: null
    };
  }

  const roleEntries = await platformCoreClient.listTenantUserRoles(
    options.coreTenantId,
    matchedUser.tenantUserId,
    {
      accessToken: options.accessToken
    }
  );
  const roleCodes = roleEntries.map((entry) => entry.roleCode);
  return {
    role: mapCoreRoleCodesToLegacyRole(roleCodes, matchedUser.isOwner),
    coreTenantUserId: matchedUser.tenantUserId
  };
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

export async function resolveLegacyRoleForCoreUser(options: {
  coreTenantId: string;
  coreUser: CoreAuthUser;
  accessToken?: string | null;
}): Promise<ResolvedLegacyRole> {
  const fallbackRole = mapCoreUserToLegacyRole(options.coreUser);
  if (options.coreUser.isPlatformAdmin) {
    return {
      role: fallbackRole,
      coreTenantUserId: null
    };
  }

  try {
    const resolvedRole = await resolveLegacyRoleByCoreTenant({
      coreTenantId: options.coreTenantId,
      coreUserId: options.coreUser.id,
      email: normalizeEmail(options.coreUser.email),
      isPlatformAdmin: options.coreUser.isPlatformAdmin,
      accessToken: options.accessToken
    });

    if (resolvedRole.role !== UserRole.VIEWER || fallbackRole === UserRole.VIEWER) {
      return resolvedRole;
    }

    return {
      role: fallbackRole,
      coreTenantUserId: resolvedRole.coreTenantUserId
    };
  } catch {
    // Fallback keeps login functional even if the core RBAC lookup is temporarily inconsistent.
  }

  return {
    role: fallbackRole,
    coreTenantUserId: null
  };
}

export async function ensureLocalTenant(coreTenant: CoreTenant, requestedSlug: string) {
  const normalizedRequestedSlug = normalizeTenantSlug(requestedSlug || coreTenant.slug);
  const normalizedCoreTenantId = coreTenant.id.trim();

  const existingByCoreId = await prisma.tenant.findUnique({
    where: {
      coreTenantId: normalizedCoreTenantId
    }
  });
  if (existingByCoreId) {
    const shouldUpdate =
      existingByCoreId.slug !== normalizedRequestedSlug
      || existingByCoreId.name !== coreTenant.name;

    if (!shouldUpdate) {
      return existingByCoreId;
    }

    return prisma.tenant.update({
      where: { id: existingByCoreId.id },
      data: {
        slug: normalizedRequestedSlug,
        name: coreTenant.name
      }
    });
  }

  const existingBySlug = await prisma.tenant.findUnique({
    where: {
      slug: normalizedRequestedSlug
    }
  });
  if (existingBySlug) {
    const currentCoreTenantId = normalizeOptionalIdentity(existingBySlug.coreTenantId);
    if (currentCoreTenantId && currentCoreTenantId !== normalizedCoreTenantId) {
      throwIdentityProjectionConflict("tenant", {
        localTenantId: existingBySlug.id,
        localCoreTenantId: currentCoreTenantId,
        requestedCoreTenantId: normalizedCoreTenantId,
        slug: normalizedRequestedSlug
      });
    }

    if (existingBySlug.name !== coreTenant.name || currentCoreTenantId !== normalizedCoreTenantId) {
      return prisma.tenant.update({
        where: { id: existingBySlug.id },
        data: {
          coreTenantId: normalizedCoreTenantId,
          name: coreTenant.name
        }
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
    const currentCoreTenantId = normalizeOptionalIdentity(existingByName.coreTenantId);
    if (currentCoreTenantId && currentCoreTenantId !== normalizedCoreTenantId) {
      throwIdentityProjectionConflict("tenant", {
        localTenantId: existingByName.id,
        localCoreTenantId: currentCoreTenantId,
        requestedCoreTenantId: normalizedCoreTenantId,
        name: coreTenant.name
      });
    }

    if (existingByName.slug !== normalizedRequestedSlug || currentCoreTenantId !== normalizedCoreTenantId) {
      return prisma.tenant.update({
        where: { id: existingByName.id },
        data: {
          coreTenantId: normalizedCoreTenantId,
          slug: normalizedRequestedSlug
        }
      });
    }

    return existingByName;
  }

  return prisma.tenant.create({
    data: {
      coreTenantId: normalizedCoreTenantId,
      slug: normalizedRequestedSlug,
      name: coreTenant.name
    }
  });
}

export async function ensureLocalUser(options: {
  tenantId: string;
  coreUserId: string;
  coreTenantUserId?: string | null;
  email: string;
  name: string;
  role: UserRole;
}) {
  const normalizedCoreUserId = options.coreUserId.trim();
  const normalizedCoreTenantUserId = normalizeOptionalIdentity(options.coreTenantUserId);

  const existing =
    (normalizedCoreTenantUserId
      ? await prisma.user.findUnique({
          where: {
            coreTenantUserId: normalizedCoreTenantUserId
          }
        })
      : null)
    ?? await prisma.user.findFirst({
      where: {
        tenantId: options.tenantId,
        coreUserId: normalizedCoreUserId
      }
    })
    ?? await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: options.tenantId,
          email: options.email
        }
      }
    });

  if (existing) {
    const currentCoreUserId = normalizeOptionalIdentity(existing.coreUserId);
    const currentCoreTenantUserId = normalizeOptionalIdentity(existing.coreTenantUserId);

    if (existing.tenantId !== options.tenantId) {
      throwIdentityProjectionConflict("user", {
        localUserId: existing.id,
        localTenantId: existing.tenantId,
        requestedTenantId: options.tenantId,
        coreUserId: normalizedCoreUserId,
        coreTenantUserId: normalizedCoreTenantUserId
      });
    }

    if (currentCoreUserId && currentCoreUserId !== normalizedCoreUserId) {
      throwIdentityProjectionConflict("user", {
        localUserId: existing.id,
        localCoreUserId: currentCoreUserId,
        requestedCoreUserId: normalizedCoreUserId,
        email: options.email
      });
    }

    if (
      normalizedCoreTenantUserId
      && currentCoreTenantUserId
      && currentCoreTenantUserId !== normalizedCoreTenantUserId
    ) {
      throwIdentityProjectionConflict("user", {
        localUserId: existing.id,
        localCoreTenantUserId: currentCoreTenantUserId,
        requestedCoreTenantUserId: normalizedCoreTenantUserId,
        email: options.email
      });
    }

    if (
      existing.email !== options.email
      || existing.name !== options.name
      || existing.role !== options.role
      || currentCoreUserId !== normalizedCoreUserId
      || currentCoreTenantUserId !== normalizedCoreTenantUserId
    ) {
      return prisma.user.update({
        where: {
          id: existing.id
        },
        data: {
          coreUserId: normalizedCoreUserId,
          coreTenantUserId: normalizedCoreTenantUserId,
          email: options.email,
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
      coreUserId: normalizedCoreUserId,
      coreTenantUserId: normalizedCoreTenantUserId,
      email: options.email,
      name: options.name,
      role: options.role,
      passwordHash
    }
  });
}

export async function resolveCoreTenantForUser(
  coreUser: CoreAuthUser,
  options: { accessToken?: string | null } = {}
) {
  if (coreUser.tenantId?.trim()) {
    return resolveCoreTenantById(coreUser.tenantId, options);
  }

  if (coreUser.isPlatformAdmin) {
    return resolveCoreTenantBySlug("root", options);
  }

  return null;
}

async function resolveCoreTenantForAuthContext(options: {
  coreUser: CoreAuthUser;
  requestedTenantSlug?: string;
  requestedClientId?: number;
  accessToken?: string | null;
}) {
  const requestedClientId = normalizePositiveInteger(options.requestedClientId);
  if (requestedClientId > 0 && options.coreUser.isPlatformAdmin) {
    return resolveCoreTenantContextByClientId(requestedClientId, {
      accessToken: options.accessToken
    });
  }

  const requestedTenantSlug = normalizeTenantSlug(options.requestedTenantSlug ?? "");
  if (requestedTenantSlug) {
    const requestedTenant = await resolveCoreTenantBySlug(requestedTenantSlug, {
      accessToken: options.accessToken
    });
    if (!requestedTenant) {
      return {
        coreTenant: null,
        tenantModuleCodes: [] as string[]
      };
    }

    if (!options.coreUser.isPlatformAdmin && options.coreUser.tenantId?.trim() && options.coreUser.tenantId !== requestedTenant.id) {
      return {
        coreTenant: null,
        tenantModuleCodes: [] as string[]
      };
    }

    return {
      coreTenant: requestedTenant,
      tenantModuleCodes: resolveTenantModuleCodesFromCoreUser(options.coreUser)
    };
  }

  return {
    coreTenant: await resolveCoreTenantForUser(options.coreUser, {
      accessToken: options.accessToken
    }),
    tenantModuleCodes: resolveTenantModuleCodesFromCoreUser(options.coreUser)
  };
}

export async function resolveAuthUserFromCoreContext(options: {
  coreTenant: CoreTenant;
  coreUser: CoreAuthUser;
  requestedTenantSlug?: string;
  accessToken?: string | null;
}) {
  const email = normalizeEmail(options.coreUser.email);
  const resolvedLegacyRole = await resolveLegacyRoleForCoreUser({
    coreTenantId: options.coreTenant.id,
    coreUser: options.coreUser,
    accessToken: options.accessToken
  });

  const localTenant = await ensureLocalTenant(options.coreTenant, options.requestedTenantSlug || options.coreTenant.slug);
  const localUser = await ensureLocalUser({
    tenantId: localTenant.id,
    coreUserId: options.coreUser.id,
    coreTenantUserId: resolvedLegacyRole.coreTenantUserId,
    email,
    name: options.coreUser.name?.trim() || email,
    role: resolvedLegacyRole.role
  });

  return {
    sub: localUser.id,
    tenantId: localTenant.id,
    coreUserId: options.coreUser.id,
    coreTenantId: localTenant.coreTenantId?.trim() || options.coreTenant.id,
    coreTenantUserId: normalizeOptionalIdentity(localUser.coreTenantUserId),
    tenantSlug: localTenant.slug,
    email: localUser.email,
    name: localUser.name,
    role: localUser.role
  } satisfies JwtUser;
}

function toAuthContextError(error: unknown) {
  if (error instanceof AuthContextError) {
    return error;
  }

  if (error instanceof CoreApiError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new AuthContextError("Nao autorizado", 401, error.details);
    }

    const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
    const message = statusCode >= 500
      ? "Falha ao validar sessao no plataforma-api"
      : (error.message?.trim() || "Falha ao validar sessao no plataforma-api");

    return new AuthContextError(message, statusCode, error.details);
  }

  return new AuthContextError("Falha ao validar sessao no plataforma-api", 502, null);
}

export async function resolveAuthContextFromCoreToken(
  accessToken: string,
  options: { requestedTenantSlug?: string; requestedClientId?: number } = {}
): Promise<AuthContextResolution> {
  const normalizedAccessToken = normalizeAccessToken(accessToken);
  if (!normalizedAccessToken) {
    throw new AuthContextError("Nao autorizado", 401, null);
  }

  let coreUser: CoreAuthUser;
  try {
    coreUser = await platformCoreClient.getMe(normalizedAccessToken);
  } catch (error) {
    throw toAuthContextError(error);
  }

  const coreTenant = await resolveCoreTenantForAuthContext({
    coreUser,
    requestedTenantSlug: options.requestedTenantSlug,
    requestedClientId: options.requestedClientId,
    accessToken: normalizedAccessToken
  });
  if (!coreTenant.coreTenant) {
    throw new AuthContextError("Sessao core invalida", 401, null);
  }

  const authUser = await resolveAuthUserFromCoreContext({
    coreTenant: coreTenant.coreTenant,
    coreUser,
    requestedTenantSlug: options.requestedTenantSlug || coreTenant.coreTenant.slug,
    accessToken: normalizedAccessToken
  });
  const coreAccess = resolveCoreAuthAccessSnapshot(coreUser);

  return {
    authUser,
    source: "core-token",
    coreAccessToken: normalizedAccessToken,
    coreUser,
    coreAccess,
    tenantModuleCodes: coreTenant.tenantModuleCodes
  };
}

export async function resolveAuthContextFromAccessToken(
  accessToken: string,
  options: { requestedTenantSlug?: string; requestedClientId?: number } = {}
): Promise<AuthContextResolution> {
  const normalizedAccessToken = normalizeAccessToken(accessToken);
  if (!normalizedAccessToken) {
    throw new AuthContextError("Nao autorizado", 401, null);
  }

  return resolveAuthContextFromCoreToken(normalizedAccessToken, options);
}
