import { UserRole } from "../domain/access.js";
import { platformCoreClient, type CoreTenantUser } from "./core-client.js";

export interface CoreTenantUserWithRole extends CoreTenantUser {
  roleCodes: string[];
  legacyRole: UserRole;
}

const ELEVATED_ROLE_CODES = new Set(["platform_root", "tenant_owner", "tenant_admin"]);
const SUPERVISOR_ROLE_CODES = new Set(["module_manager"]);
const AGENT_ROLE_CODES = new Set(["module_agent"]);

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
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
