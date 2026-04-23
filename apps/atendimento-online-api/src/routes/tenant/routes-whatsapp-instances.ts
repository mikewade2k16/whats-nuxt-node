import type { FastifyInstance } from "fastify";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import {
  buildAutomaticWhatsAppInstanceName,
  ensureTenantWhatsAppRegistry,
  resolveAccessibleWhatsAppInstances,
  resolveTenantInstanceById
} from "../../services/whatsapp-instances.js";
import { listTenantDirectoryUsers } from "../../services/core-tenant-directory.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot
} from "./atendimento-snapshot.js";
import {
  createWhatsAppInstanceSchema,
  updateWhatsAppInstanceSchema,
  whatsappInstanceParamsSchema
} from "./schemas.js";
import { resolveTenantRuntimeContextForAuth } from "../../services/tenant-runtime.js";

async function loadEligibleTenantUsers(
  tenantId: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  return listTenantDirectoryUsers(tenantId, {
    accessToken: options.accessToken,
    clientId: options.clientId ?? null
  });
}

function mapInstancePayload(instance: Awaited<ReturnType<typeof ensureTenantWhatsAppRegistry>>[number]) {
  return {
    id: instance.id,
    tenantId: instance.tenantId,
    instanceName: instance.instanceName,
    displayName: instance.displayName,
    phoneNumber: instance.phoneNumber,
    queueLabel: instance.queueLabel ?? null,
    userScopePolicy: "MULTI_INSTANCE" as const,
    responsibleUserId: instance.responsibleUserId ?? null,
    responsibleUserName: instance.responsibleUser?.name ?? null,
    responsibleUserEmail: instance.responsibleUser?.email ?? null,
    isDefault: instance.isDefault,
    isActive: instance.isActive,
    hasEvolutionApiKey: Boolean(env.EVOLUTION_API_KEY),
    assignedUserIds: [] as string[],
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt
  };
}

function mapAccessibleInstancePayload(instance: Awaited<ReturnType<typeof ensureTenantWhatsAppRegistry>>[number]) {
  return {
    ...mapInstancePayload(instance),
    responsibleUserEmail: null,
    assignedUserIds: []
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

async function findInstanceNameConflict(params: {
  instanceName: string;
  excludeInstanceId?: string | null;
}) {
  return prisma.whatsAppInstance.findFirst({
    where: {
      instanceName: params.instanceName,
      ...(params.excludeInstanceId
        ? {
            id: {
              not: params.excludeInstanceId
            }
          }
        : {})
    },
    select: {
      id: true
    }
  });
}

async function resolveNextAutomaticInstanceName(params: {
  tenantName: string;
  tenantSlug: string;
  excludeInstanceId?: string | null;
}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildAutomaticWhatsAppInstanceName({
      tenantName: params.tenantName,
      tenantSlug: params.tenantSlug
    });

    if (!(await findInstanceNameConflict({
      instanceName: candidate,
      excludeInstanceId: params.excludeInstanceId
    }))) {
      return candidate;
    }
  }

  return buildAutomaticWhatsAppInstanceName({
    tenantName: params.tenantName,
    tenantSlug: params.tenantSlug,
    uniqueSuffix: Date.now()
  });
}

export function registerTenantWhatsAppInstancesRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/tenant/whatsapp/instances/access", async (request, reply) => {
    const access = await resolveAccessibleWhatsAppInstances({
      tenantId: request.authUser.tenantId,
      userId: request.authUser.sub,
      role: request.authUser.role
    });

    return {
      hasMultipleActiveInstances: access.hasMultipleActiveInstances,
      instances: access.accessibleInstances.map(mapAccessibleInstancePayload)
    };
  });

  protectedApp.get("/tenant/whatsapp/instances", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const tenant = await resolveTenantRuntimeContextForAuth(request.authUser, {
      accessToken: request.coreAccessToken
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const adminClient = await resolveAdminClientByCoreTenantId(tenant.coreTenantId, {
      accessToken: request.coreAccessToken
    });
    const atendimentoSnapshot = await resolveAtendimentoSnapshot({
      coreTenantId: tenant.coreTenantId,
      adminClient,
      fallbackMaxUsers: 3,
      fallbackMaxChannels: 1,
      fallbackCurrentUsers: 0,
      accessToken: request.coreAccessToken
    });

    const [instances, users] = await Promise.all([
      ensureTenantWhatsAppRegistry(tenant),
      loadEligibleTenantUsers(tenant.id, {
        accessToken: request.coreAccessToken,
        clientId: adminClient?.id ?? null
      })
    ]);

    return {
      maxChannels: atendimentoSnapshot.maxChannels,
      currentChannels: instances.filter((entry) => entry.isActive).length,
      instances: instances.map(mapInstancePayload),
      users
    };
  });

  protectedApp.post("/tenant/whatsapp/instances", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = createWhatsAppInstanceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await resolveTenantRuntimeContextForAuth(request.authUser, {
      accessToken: request.coreAccessToken
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const adminClient = await resolveAdminClientByCoreTenantId(tenant.coreTenantId, {
      accessToken: request.coreAccessToken
    });
    const atendimentoSnapshot = await resolveAtendimentoSnapshot({
      coreTenantId: tenant.coreTenantId,
      adminClient,
      fallbackMaxUsers: 3,
      fallbackMaxChannels: 1,
      fallbackCurrentUsers: 0,
      accessToken: request.coreAccessToken
    });

    const instances = await ensureTenantWhatsAppRegistry(tenant);
    const normalizedInstanceName = await resolveNextAutomaticInstanceName({
      tenantName: tenant.name,
      tenantSlug: tenant.slug
    });

    const tenantUsers = await loadEligibleTenantUsers(tenant.id, {
      accessToken: request.coreAccessToken,
      clientId: adminClient?.id ?? null
    });
    const responsibleUserId = normalizeOptionalText(parsed.data.responsibleUserId);
    if (responsibleUserId) {
      const responsibleUser = tenantUsers.find((entry) => entry.id === responsibleUserId);
      if (!responsibleUser || !responsibleUser.atendimentoAccess) {
        return reply.code(409).send({
          message: "Responsavel invalido para esta instancia. Escolha um usuario com acesso ao atendimento."
        });
      }
    }

    const nextActiveChannels = instances.filter((entry) => entry.isActive).length + (parsed.data.isActive ? 1 : 0);
    if (parsed.data.isActive && nextActiveChannels > atendimentoSnapshot.maxChannels) {
      return reply.code(409).send({
        message: "Limite de instancias WhatsApp do cliente atingido.",
        details: {
          maxChannels: atendimentoSnapshot.maxChannels,
          currentChannels: instances.filter((entry) => entry.isActive).length
        }
      });
    }

    if (parsed.data.isDefault) {
      await prisma.whatsAppInstance.updateMany({
        where: {
          tenantId: tenant.id,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    const created = await prisma.whatsAppInstance.create({
      data: {
        tenantId: tenant.id,
        instanceName: normalizedInstanceName,
        displayName: parsed.data.displayName?.trim() || null,
        phoneNumber: parsed.data.phoneNumber?.trim() || null,
        queueLabel: normalizeOptionalText(parsed.data.queueLabel),
        responsibleUserId,
        isDefault: parsed.data.isDefault || instances.length < 1,
        isActive: parsed.data.isActive,
        createdByUserId: request.authUser.sub
      }
    });

    const refreshed = await ensureTenantWhatsAppRegistry(tenant.id);
    const instance = refreshed.find((entry) => entry.id === created.id);
    return reply.code(201).send(instance ? mapInstancePayload(instance) : {
      id: created.id,
      tenantId: created.tenantId,
      instanceName: created.instanceName,
      displayName: created.displayName,
      phoneNumber: created.phoneNumber,
      queueLabel: created.queueLabel ?? null,
      userScopePolicy: "MULTI_INSTANCE" as const,
      responsibleUserId: created.responsibleUserId ?? null,
      responsibleUserName: null,
      responsibleUserEmail: null,
      isDefault: created.isDefault,
      isActive: created.isActive,
      hasEvolutionApiKey: Boolean(env.EVOLUTION_API_KEY),
      assignedUserIds: [],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    });
  });

  protectedApp.patch("/tenant/whatsapp/instances/:instanceId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = whatsappInstanceParamsSchema.safeParse(request.params);
    const body = updateWhatsAppInstanceSchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: body.success ? undefined : body.error.flatten()
      });
    }

    const tenant = await resolveTenantRuntimeContextForAuth(request.authUser, {
      accessToken: request.coreAccessToken
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const adminClient = await resolveAdminClientByCoreTenantId(tenant.coreTenantId, {
      accessToken: request.coreAccessToken
    });
    const atendimentoSnapshot = await resolveAtendimentoSnapshot({
      coreTenantId: tenant.coreTenantId,
      adminClient,
      fallbackMaxUsers: 3,
      fallbackMaxChannels: 1,
      fallbackCurrentUsers: 0,
      accessToken: request.coreAccessToken
    });

    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: params.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(404).send({ message: "Instancia WhatsApp nao encontrada" });
    }

    const tenantUsers = await loadEligibleTenantUsers(tenant.id, {
      accessToken: request.coreAccessToken,
      clientId: adminClient?.id ?? null
    });
    const responsibleUserId = body.data.responsibleUserId === undefined
      ? undefined
      : normalizeOptionalText(body.data.responsibleUserId);
    if (responsibleUserId) {
      const responsibleUser = tenantUsers.find((entry) => entry.id === responsibleUserId);
      if (!responsibleUser || !responsibleUser.atendimentoAccess) {
        return reply.code(409).send({
          message: "Responsavel invalido para esta instancia. Escolha um usuario com acesso ao atendimento."
        });
      }
    }

    const activeInstances = (await ensureTenantWhatsAppRegistry(tenant)).filter((entry) => entry.isActive);
    const willBeActive = body.data.isActive ?? instance.isActive;
    const nextActiveCount = activeInstances.filter((entry) => entry.id !== instance.id).length + (willBeActive ? 1 : 0);
    if (willBeActive && nextActiveCount > atendimentoSnapshot.maxChannels) {
      return reply.code(409).send({
        message: "Limite de instancias WhatsApp do cliente atingido.",
        details: {
          maxChannels: atendimentoSnapshot.maxChannels,
          currentChannels: activeInstances.length
        }
      });
    }

    if (body.data.isDefault === true) {
      await prisma.whatsAppInstance.updateMany({
        where: {
          tenantId: tenant.id,
          id: {
            not: instance.id
          },
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    const updated = await prisma.whatsAppInstance.update({
      where: {
        id: instance.id
      },
      data: {
        displayName: body.data.displayName === undefined ? undefined : body.data.displayName.trim() || null,
        phoneNumber: body.data.phoneNumber === undefined ? undefined : body.data.phoneNumber.trim() || null,
        queueLabel: body.data.queueLabel === undefined ? undefined : normalizeOptionalText(body.data.queueLabel),
        responsibleUserId,
        isActive: body.data.isActive,
        isDefault: body.data.isDefault
      }
    });

    const refreshed = await ensureTenantWhatsAppRegistry(tenant.id);
    const refreshedInstance = refreshed.find((entry) => entry.id === instance.id);
    return refreshedInstance ? mapInstancePayload(refreshedInstance) : {
      id: updated.id,
      tenantId: updated.tenantId,
      instanceName: updated.instanceName,
      displayName: updated.displayName,
      phoneNumber: updated.phoneNumber,
      queueLabel: updated.queueLabel ?? null,
      userScopePolicy: "MULTI_INSTANCE" as const,
      responsibleUserId: updated.responsibleUserId ?? null,
      responsibleUserName: null,
      responsibleUserEmail: null,
      isDefault: updated.isDefault,
      isActive: updated.isActive,
      hasEvolutionApiKey: Boolean(env.EVOLUTION_API_KEY),
      assignedUserIds: [],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  });

  protectedApp.put("/tenant/whatsapp/instances/:instanceId/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    return reply.code(410).send({
      message: "A elegibilidade por instancia foi removida. Quem pode acessar o atendimento agora vem do platform_core."
    });
  });
}
