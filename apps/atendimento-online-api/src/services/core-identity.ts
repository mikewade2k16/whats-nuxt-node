import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { platformCoreClient, type CoreTenantUser } from "./core-client.js";

export interface CoreTenantUserWithRole extends CoreTenantUser {
  roleCodes: string[];
  legacyRole: UserRole;
}

export interface LegacyTenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const ELEVATED_ROLE_CODES = new Set(["platform_root", "tenant_owner", "tenant_admin"]);
const SUPERVISOR_ROLE_CODES = new Set(["module_manager"]);
const AGENT_ROLE_CODES = new Set(["module_agent"]);

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptionalIdentity(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function mapCoreRoleCodesToLegacyRole(roleCodes: string[], isOwner: boolean): UserRole {
  if (isOwner) {
    return UserRole.ADMIN;
  }

  const normalizedCodes = roleCodes.map(normalizeCode);

  if (normalizedCodes.some((code) => ELEVATED_ROLE_CODES.has(code))) {
    return UserRole.ADMIN;
  }
  if (normalizedCodes.some((code) => SUPERVISOR_ROLE_CODES.has(code))) {
    return UserRole.SUPERVISOR;
  }
  if (normalizedCodes.some((code) => AGENT_ROLE_CODES.has(code))) {
    return UserRole.AGENT;
  }

  return UserRole.VIEWER;
}

export function mapLegacyRoleToCoreRoleCodes(role: UserRole): string[] {
  switch (role) {
    case UserRole.ADMIN:
      return ["tenant_admin"];
    case UserRole.SUPERVISOR:
      return ["module_manager"];
    case UserRole.AGENT:
      return ["module_agent"];
    case UserRole.VIEWER:
    default:
      return [];
  }
}

export async function listCoreTenantUsersWithLegacyRoles(
  tenantId: string,
  options: { accessToken?: string | null } = {}
) {
  const coreUsers = await platformCoreClient.listTenantUsers(tenantId, {
    accessToken: options.accessToken
  });
  if (coreUsers.length < 1) {
    return [] as CoreTenantUserWithRole[];
  }

  const roleCodeEntries = await Promise.all(
    coreUsers.map(async (entry) => {
      try {
        const roles = await platformCoreClient.listTenantUserRoles(tenantId, entry.tenantUserId, {
          accessToken: options.accessToken
        });
        return [entry.tenantUserId, roles.map((roleEntry) => roleEntry.roleCode)] as const;
      } catch {
        return [entry.tenantUserId, [] as string[]] as const;
      }
    })
  );

  const roleCodesByTenantUserId = new Map<string, string[]>(roleCodeEntries);

  return coreUsers.map<CoreTenantUserWithRole>((entry) => {
    const roleCodes = roleCodesByTenantUserId.get(entry.tenantUserId) ?? [];
    return {
      ...entry,
      roleCodes,
      legacyRole: mapCoreRoleCodesToLegacyRole(roleCodes, entry.isOwner)
    };
  });
}

export async function syncLocalUsersFromCoreTenant(
  localTenantId: string,
  coreUsers: CoreTenantUserWithRole[]
): Promise<LegacyTenantUser[]> {
  if (coreUsers.length < 1) {
    return [];
  }

  const normalizedCoreEntries = coreUsers.map((entry) => ({
    ...entry,
    email: entry.email.trim().toLowerCase(),
    name: entry.name.trim() || entry.email.trim().toLowerCase()
  }));

  const emails = normalizedCoreEntries.map((entry) => entry.email);
  const coreUserIds = normalizedCoreEntries
    .map((entry) => normalizeOptionalIdentity(entry.userId))
    .filter((entry): entry is string => Boolean(entry));
  const coreTenantUserIds = normalizedCoreEntries
    .map((entry) => normalizeOptionalIdentity(entry.tenantUserId))
    .filter((entry): entry is string => Boolean(entry));
  const existingUsers = await prisma.user.findMany({
    where: {
      tenantId: localTenantId,
      OR: [
        {
          email: {
            in: emails
          }
        },
        {
          coreUserId: {
            in: coreUserIds
          }
        },
        {
          coreTenantUserId: {
            in: coreTenantUserIds
          }
        }
      ]
    },
    select: {
      id: true,
      email: true,
      coreUserId: true,
      coreTenantUserId: true,
      name: true,
      role: true
    }
  });

  const existingByCoreTenantUserId = new Map(
    existingUsers
      .map((entry) => [normalizeOptionalIdentity(entry.coreTenantUserId), entry] as const)
      .filter((entry): entry is readonly [string, (typeof existingUsers)[number]] => Boolean(entry[0]))
  );
  const existingByCoreUserId = new Map(
    existingUsers
      .map((entry) => [normalizeOptionalIdentity(entry.coreUserId), entry] as const)
      .filter((entry): entry is readonly [string, (typeof existingUsers)[number]] => Boolean(entry[0]))
  );
  const existingByEmail = new Map(existingUsers.map((entry) => [entry.email.trim().toLowerCase(), entry]));

  for (const entry of normalizedCoreEntries) {
    const normalizedCoreUserId = normalizeOptionalIdentity(entry.userId);
    const normalizedCoreTenantUserId = normalizeOptionalIdentity(entry.tenantUserId);
    const current =
      (normalizedCoreTenantUserId ? existingByCoreTenantUserId.get(normalizedCoreTenantUserId) : null)
      ?? (normalizedCoreUserId ? existingByCoreUserId.get(normalizedCoreUserId) : null)
      ?? existingByEmail.get(entry.email);

    if (!current) {
      const passwordHash = await bcrypt.hash(`core-shadow-${randomUUID()}`, 8);
      await prisma.user.create({
        data: {
          tenantId: localTenantId,
          coreUserId: normalizedCoreUserId,
          coreTenantUserId: normalizedCoreTenantUserId,
          email: entry.email,
          name: entry.name,
          role: entry.legacyRole,
          passwordHash
        }
      });
      continue;
    }

    const currentCoreUserId = normalizeOptionalIdentity(current.coreUserId);
    const currentCoreTenantUserId = normalizeOptionalIdentity(current.coreTenantUserId);
    const shouldUpdate =
      current.email.trim().toLowerCase() !== entry.email
      || current.name !== entry.name
      || current.role !== entry.legacyRole
      || currentCoreUserId !== normalizedCoreUserId
      || currentCoreTenantUserId !== normalizedCoreTenantUserId;

    if (!shouldUpdate) {
      continue;
    }

    await prisma.user.update({
      where: {
        id: current.id
      },
      data: {
        coreUserId: normalizedCoreUserId,
        coreTenantUserId: normalizedCoreTenantUserId,
        email: entry.email,
        name: entry.name,
        role: entry.legacyRole
      }
    });
  }

  return prisma.user.findMany({
    where: {
      tenantId: localTenantId,
      email: {
        in: emails
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export function mapCoreUsersToLegacyFallback(
  coreTenantId: string,
  coreUsers: CoreTenantUserWithRole[]
): LegacyTenantUser[] {
  const now = new Date();

  return coreUsers.map((entry) => ({
    id: entry.userId,
    tenantId: coreTenantId,
    email: entry.email,
    name: entry.name,
    role: entry.legacyRole,
    createdAt: entry.joinedAt ? new Date(entry.joinedAt) : now,
    updatedAt: entry.lastSeenAt ? new Date(entry.lastSeenAt) : now
  }));
}
