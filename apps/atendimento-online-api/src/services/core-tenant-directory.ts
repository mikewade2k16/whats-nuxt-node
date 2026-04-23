import { UserRole } from "../domain/access.js";
import { resolveCoreAtendimentoAccessByEmail } from "./core-atendimento-access.js";
import { listCoreTenantUsersWithLegacyRoles } from "./core-identity.js";

export interface TenantDirectoryUser {
  id: string;
  tenantId: string;
  coreTenantUserId: string | null;
  email: string;
  name: string;
  role: UserRole;
  atendimentoAccess: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeDate(value: string | null | undefined) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeName(name: string, email: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : email.trim().toLowerCase();
}

export async function listTenantDirectoryUsers(
  tenantId: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  const coreUsers = await listCoreTenantUsersWithLegacyRoles(tenantId, {
    accessToken: options.accessToken
  });
  if (coreUsers.length < 1) {
    return [] as TenantDirectoryUser[];
  }

  const accessEntries = await Promise.all(
    coreUsers.map(async (entry) => {
      const access = await resolveCoreAtendimentoAccessByEmail(entry.email, {
        accessToken: options.accessToken,
        clientId: options.clientId ?? null
      });

      const createdAt = normalizeDate(entry.joinedAt) ?? new Date();
      const updatedAt = normalizeDate(entry.lastSeenAt) ?? createdAt;

      return {
        id: entry.userId,
        tenantId,
        coreTenantUserId: entry.tenantUserId || null,
        email: entry.email.trim().toLowerCase(),
        name: normalizeName(entry.name, entry.email),
        role: entry.legacyRole,
        atendimentoAccess: access.atendimentoAccess,
        createdAt,
        updatedAt
      } satisfies TenantDirectoryUser;
    })
  );

  return accessEntries.sort((left, right) => {
    if (left.role !== right.role) {
      return left.role.localeCompare(right.role);
    }

    return left.name.localeCompare(right.name);
  });
}

export async function findTenantDirectoryUserById(
  tenantId: string,
  userId: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  const users = await listTenantDirectoryUsers(tenantId, options);
  return users.find((entry) => entry.id === userId) ?? null;
}

export async function mapTenantDirectoryUsersById(
  tenantId: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  const users = await listTenantDirectoryUsers(tenantId, options);
  return new Map(users.map((entry) => [entry.id, entry] as const));
}
