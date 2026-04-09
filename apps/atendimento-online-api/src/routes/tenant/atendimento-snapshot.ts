import { type CoreAdminClient, type CoreTenant, platformCoreClient } from "../../services/core-client.js";
import { findBestCoreTenantMatch } from "../../services/core-tenant-mapping.js";

export async function resolveCurrentCoreTenant(localTenant: {
  coreTenantId?: string | null;
  slug: string;
  name: string;
}, options: { accessToken?: string | null } = {}) {
  const normalizedCoreTenantId = String(localTenant.coreTenantId ?? "").trim();
  if (normalizedCoreTenantId) {
    const coreById = await platformCoreClient.findTenantById(normalizedCoreTenantId, {
      accessToken: options.accessToken
    });
    if (coreById) {
      return coreById;
    }
  }

  const coreBySlug = await platformCoreClient.findTenantBySlug(localTenant.slug, {
    accessToken: options.accessToken
  });
  if (coreBySlug) {
    return coreBySlug;
  }

  const coreTenants = await platformCoreClient.listTenants({
    accessToken: options.accessToken
  });
  return findBestCoreTenantMatch({
    localSlug: localTenant.slug,
    localName: localTenant.name,
    coreTenants
  }) as CoreTenant | null;
}

export async function resolveAdminClientByCoreTenantId(
  coreTenantId: string,
  options: { accessToken?: string | null } = {}
) {
  const clients = await platformCoreClient.listAdminClients({
    page: 1,
    limit: 300,
    accessToken: options.accessToken
  });

  return clients.find((entry) => entry.coreTenantId === coreTenantId) ?? null;
}

export async function resolveAtendimentoSnapshot(params: {
  coreTenantId: string;
  adminClient: CoreAdminClient | null;
  fallbackMaxUsers: number;
  fallbackMaxChannels: number;
  fallbackCurrentUsers: number;
  accessToken?: string | null;
}) {
  const [usersLimit, channelsLimit, atendimentoUsers] = await Promise.all([
    platformCoreClient.resolveModuleLimit(
      params.coreTenantId,
      "atendimento",
      "users",
      { accessToken: params.accessToken }
    ).catch(() => null),
    platformCoreClient.resolveModuleLimit(
      params.coreTenantId,
      "atendimento",
      "instances",
      { accessToken: params.accessToken }
    ).catch(() => null),
    params.adminClient
      ? platformCoreClient.listAdminUsers({
          page: 1,
          limit: 300,
          clientId: params.adminClient.id,
          accessToken: params.accessToken
        }).catch(() => [])
      : Promise.resolve([])
  ]);

  const currentUsers = Array.isArray(atendimentoUsers)
    ? atendimentoUsers.filter((entry) => Boolean(entry.atendimentoAccess)).length
    : params.fallbackCurrentUsers;

  return {
    maxUsers: usersLimit?.isUnlimited
      ? params.fallbackMaxUsers
      : (typeof usersLimit?.value === "number" && usersLimit.value > 0 ? usersLimit.value : params.fallbackMaxUsers),
    maxChannels: channelsLimit?.isUnlimited
      ? params.fallbackMaxChannels
      : (typeof channelsLimit?.value === "number" && channelsLimit.value > 0 ? channelsLimit.value : params.fallbackMaxChannels),
    currentUsers
  };
}
