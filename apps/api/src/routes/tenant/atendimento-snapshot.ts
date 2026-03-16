import { type CoreAdminClient, type CoreTenant, platformCoreClient } from "../../services/core-client.js";
import { findBestCoreTenantMatch } from "../../services/core-tenant-mapping.js";

export async function resolveCurrentCoreTenant(localTenant: { slug: string; name: string }) {
  const coreBySlug = await platformCoreClient.findTenantBySlug(localTenant.slug);
  if (coreBySlug) {
    return coreBySlug;
  }

  const coreTenants = await platformCoreClient.listTenants();
  return findBestCoreTenantMatch({
    localSlug: localTenant.slug,
    localName: localTenant.name,
    coreTenants
  }) as CoreTenant | null;
}

export async function resolveAdminClientByCoreTenantId(coreTenantId: string) {
  const clients = await platformCoreClient.listAdminClients({
    page: 1,
    limit: 300
  });

  return clients.find((entry) => entry.coreTenantId === coreTenantId) ?? null;
}

export async function resolveAtendimentoSnapshot(params: {
  coreTenantId: string;
  adminClient: CoreAdminClient | null;
  fallbackMaxUsers: number;
  fallbackMaxChannels: number;
  fallbackCurrentUsers: number;
}) {
  const [usersLimit, channelsLimit, atendimentoUsers] = await Promise.all([
    platformCoreClient.resolveModuleLimit(params.coreTenantId, "atendimento", "users").catch(() => null),
    platformCoreClient.resolveModuleLimit(params.coreTenantId, "atendimento", "instances").catch(() => null),
    params.adminClient
      ? platformCoreClient.listAdminUsers({
          page: 1,
          limit: 300,
          clientId: params.adminClient.id
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
