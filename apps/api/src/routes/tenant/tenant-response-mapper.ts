import { env } from "../../config.js";
import { buildWebhookUrl } from "./tenant-whatsapp-utils.js";
import { canReadSensitiveConfig, resolveConfiguredChannelCount } from "./tenant-capacity.js";

export interface TenantSummaryInput {
  id: string;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  evolutionApiKey?: string | null;
  maxChannels: number;
  maxUsers: number;
  retentionDays: number;
  maxUploadMb: number;
  createdAt: Date;
  updatedAt: Date;
}

export function mapTenantResponse(
  tenant: TenantSummaryInput,
  currentUsers: number,
  role: "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER"
) {
  const currentChannels = resolveConfiguredChannelCount(tenant.whatsappInstance);

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    whatsappInstance: tenant.whatsappInstance,
    maxChannels: tenant.maxChannels,
    maxUsers: tenant.maxUsers,
    retentionDays: tenant.retentionDays,
    maxUploadMb: tenant.maxUploadMb,
    currentChannels,
    currentUsers,
    hasEvolutionApiKey: Boolean(tenant.evolutionApiKey || env.EVOLUTION_API_KEY),
    webhookUrl: buildWebhookUrl(tenant.slug),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    canViewSensitive: canReadSensitiveConfig(role),
    evolutionApiKey:
      canReadSensitiveConfig(role) && tenant.evolutionApiKey ? tenant.evolutionApiKey : null
  };
}
