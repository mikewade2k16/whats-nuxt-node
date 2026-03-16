import { env } from "../../config.js";
import { buildWebhookUrl } from "./tenant-whatsapp-utils.js";
import { canReadSensitiveConfig, resolveConfiguredChannelCount } from "./tenant-capacity.js";

export interface TenantSummaryInput {
  id: string;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  whatsappInstances?: Array<{
    id: string;
    instanceName: string;
    displayName: string | null;
    phoneNumber: string | null;
    queueLabel?: string | null;
    userScopePolicy?: "MULTI_INSTANCE" | "SINGLE_INSTANCE";
    responsibleUserId?: string | null;
    responsibleUserName?: string | null;
    responsibleUserEmail?: string | null;
    isDefault: boolean;
    isActive: boolean;
    userIds?: string[];
  }>;
  evolutionApiKey?: string | null;
  maxChannels: number;
  maxUsers: number;
  retentionDays: number;
  maxUploadMb: number;
  canManageAtendimentoLimits?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function mapTenantResponse(
  tenant: TenantSummaryInput,
  currentUsers: number,
  role: "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER"
) {
  const currentChannels = Array.isArray(tenant.whatsappInstances)
    ? tenant.whatsappInstances.filter((entry) => entry.isActive).length
    : resolveConfiguredChannelCount(tenant.whatsappInstance);

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    whatsappInstance: tenant.whatsappInstance,
    whatsappInstances: tenant.whatsappInstances ?? [],
    maxChannels: tenant.maxChannels,
    maxUsers: tenant.maxUsers,
    retentionDays: tenant.retentionDays,
    maxUploadMb: tenant.maxUploadMb,
    canManageAtendimentoLimits: Boolean(tenant.canManageAtendimentoLimits),
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
