import { listTenantDirectoryUsers } from "../../services/core-tenant-directory.js";

export type TenantUserNameCacheEntry = {
  expiresAt: number;
  names: Set<string>;
};

export const TENANT_USER_NAME_CACHE_TTL_MS = 5 * 60 * 1000;
export const tenantUserNameCache = new Map<string, TenantUserNameCacheEntry>();

export function normalizeNameForComparison(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .trim()
      .toLowerCase() ?? ""
  );
}

export async function isTenantUserDisplayName(tenantId: string, candidateName: string | null | undefined) {
  const normalizedCandidate = normalizeNameForComparison(candidateName);
  if (!normalizedCandidate) {
    return false;
  }

  const now = Date.now();
  const cached = tenantUserNameCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.names.has(normalizedCandidate);
  }

  const users = await listTenantDirectoryUsers(tenantId);
  const names = new Set<string>();
  for (const userEntry of users) {
    const normalizedName = normalizeNameForComparison(userEntry.name);
    if (normalizedName) {
      names.add(normalizedName);
    }
  }

  tenantUserNameCache.set(tenantId, {
    expiresAt: now + TENANT_USER_NAME_CACHE_TTL_MS,
    names
  });

  return names.has(normalizedCandidate);
}
