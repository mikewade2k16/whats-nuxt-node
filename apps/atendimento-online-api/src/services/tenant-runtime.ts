import { env } from "../config.js";
import { prisma } from "../db.js";
import type { JwtUser } from "../plugins/auth.js";
import { type CoreTenant } from "./core-client.js";
import { resolveCoreTenantById, resolveCoreTenantBySlug } from "./auth-context.js";

export const DEFAULT_RETENTION_DAYS = 15;
export const DEFAULT_MAX_UPLOAD_MB = 500;

export interface TenantRuntimeContext {
  id: string;
  coreTenantId: string;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  evolutionApiKey: string | null;
  retentionDays: number;
  maxUploadMb: number;
  createdAt: Date;
  updatedAt: Date;
}

type RuntimeConfigRecord = Awaited<ReturnType<typeof prisma.atendimentoTenantConfig.findUnique>>;

async function resolveDefaultInstanceName(tenantId: string) {
  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      tenantId
    },
    orderBy: [
      { isDefault: "desc" },
      { isActive: "desc" },
      { createdAt: "asc" }
    ],
    select: {
      instanceName: true
    }
  });

  return instance?.instanceName ?? null;
}

async function ensureRuntimeConfig(tenantId: string) {
  return prisma.atendimentoTenantConfig.upsert({
    where: {
      tenantId
    },
    update: {},
    create: {
      tenantId,
      retentionDays: DEFAULT_RETENTION_DAYS,
      maxUploadMb: DEFAULT_MAX_UPLOAD_MB
    }
  });
}

function mapRuntimeContext(coreTenant: CoreTenant, config: NonNullable<RuntimeConfigRecord>, whatsappInstance: string | null) {
  return {
    id: coreTenant.id,
    coreTenantId: coreTenant.id,
    slug: coreTenant.slug,
    name: coreTenant.name,
    whatsappInstance,
    evolutionApiKey: env.EVOLUTION_API_KEY?.trim() || null,
    retentionDays: config.retentionDays,
    maxUploadMb: config.maxUploadMb,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  } satisfies TenantRuntimeContext;
}

export async function resolveTenantRuntimeContextFromCoreTenant(
  coreTenant: CoreTenant,
  options: { ensureConfig?: boolean } = {}
) {
  const config = options.ensureConfig === false
    ? await prisma.atendimentoTenantConfig.findUnique({
        where: {
          tenantId: coreTenant.id
        }
      })
    : await ensureRuntimeConfig(coreTenant.id);

  if (!config) {
    return null;
  }

  const whatsappInstance = await resolveDefaultInstanceName(coreTenant.id);
  return mapRuntimeContext(coreTenant, config, whatsappInstance);
}

export async function resolveTenantRuntimeContextById(
  tenantId: string,
  options: { accessToken?: string | null; ensureConfig?: boolean } = {}
) {
  const coreTenant = await resolveCoreTenantById(tenantId, {
    accessToken: options.accessToken
  });
  if (!coreTenant) {
    return null;
  }

  return resolveTenantRuntimeContextFromCoreTenant(coreTenant, {
    ensureConfig: options.ensureConfig
  });
}

export async function resolveTenantRuntimeContextBySlug(
  tenantSlug: string,
  options: { accessToken?: string | null; ensureConfig?: boolean } = {}
) {
  const coreTenant = await resolveCoreTenantBySlug(tenantSlug, {
    accessToken: options.accessToken
  });
  if (!coreTenant) {
    return null;
  }

  return resolveTenantRuntimeContextFromCoreTenant(coreTenant, {
    ensureConfig: options.ensureConfig
  });
}

export async function resolveTenantRuntimeContextForAuth(
  authUser: Pick<JwtUser, "tenantId" | "tenantSlug">,
  options: { accessToken?: string | null; ensureConfig?: boolean } = {}
) {
  return resolveTenantRuntimeContextById(authUser.tenantId, {
    accessToken: options.accessToken,
    ensureConfig: options.ensureConfig
  }) ?? resolveTenantRuntimeContextBySlug(authUser.tenantSlug, {
    accessToken: options.accessToken,
    ensureConfig: options.ensureConfig
  });
}

export async function getTenantRuntimeOrFail(
  tenantId: string,
  options: { accessToken?: string | null; ensureConfig?: boolean } = {}
) {
  const tenant = await resolveTenantRuntimeContextById(tenantId, options);
  if (!tenant) {
    throw new Error("Tenant nao encontrado");
  }
  return tenant;
}

export async function updateTenantRuntimeConfig(
  tenantId: string,
  input: {
    evolutionApiKey?: string | null;
    retentionDays?: number;
    maxUploadMb?: number;
  }
) {
  const existing = await ensureRuntimeConfig(tenantId);
  return prisma.atendimentoTenantConfig.update({
    where: {
      tenantId
    },
    data: {
      retentionDays: input.retentionDays ?? existing.retentionDays,
      maxUploadMb: input.maxUploadMb ?? existing.maxUploadMb
    }
  });
}

export async function listTenantRuntimeConfigs() {
  return prisma.atendimentoTenantConfig.findMany({
    orderBy: {
      createdAt: "asc"
    }
  });
}
