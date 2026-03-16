import type { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { normalizeEvolutionApiKey } from "./helpers.js";
import {
  assignUsersToWhatsAppInstance,
  ensureTenantWhatsAppRegistry,
  normalizeWhatsAppInstanceName,
  resolveAccessibleWhatsAppInstances,
  resolveTenantInstanceById
} from "../../services/whatsapp-instances.js";
import { resolveCoreAtendimentoAccessByEmail } from "../../services/core-atendimento-access.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot,
  resolveCurrentCoreTenant
} from "./atendimento-snapshot.js";
import {
  createWhatsAppInstanceSchema,
  updateWhatsAppInstanceSchema,
  updateWhatsAppInstanceUsersSchema,
  whatsappInstanceParamsSchema
} from "./schemas.js";

async function loadEligibleTenantUsers(tenantId: string) {
  const users = await prisma.user.findMany({
    where: {
      tenantId
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    },
    orderBy: [
      { role: "asc" },
      { name: "asc" }
    ]
  });

  const accessEntries = await Promise.all(
    users.map(async (user) => {
      const coreAccess = await resolveCoreAtendimentoAccessByEmail(user.email);
      return {
        ...user,
        atendimentoAccess: coreAccess.atendimentoAccess
      };
    })
  );

  return accessEntries;
}

function mapInstancePayload(instance: Awaited<ReturnType<typeof ensureTenantWhatsAppRegistry>>[number]) {
  return {
    id: instance.id,
    tenantId: instance.tenantId,
    instanceName: instance.instanceName,
    displayName: instance.displayName,
    phoneNumber: instance.phoneNumber,
    queueLabel: instance.queueLabel ?? null,
    userScopePolicy: instance.userScopePolicy,
    responsibleUserId: instance.responsibleUserId ?? null,
    responsibleUserName: instance.responsibleUser?.name ?? null,
    responsibleUserEmail: instance.responsibleUser?.email ?? null,
    isDefault: instance.isDefault,
    isActive: instance.isActive,
    hasEvolutionApiKey: Boolean(instance.evolutionApiKey),
    assignedUserIds: instance.userAccesses.map((access) => access.userId),
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

    const tenant = await prisma.tenant.findUnique({
      where: {
        id: request.authUser.tenantId
      },
      select: {
        id: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        evolutionApiKey: true,
        maxChannels: true
      }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const coreTenant = await resolveCurrentCoreTenant({ slug: tenant.slug, name: tenant.name });
    const atendimentoSnapshot = coreTenant
      ? await resolveAtendimentoSnapshot({
          coreTenantId: coreTenant.id,
          adminClient: await resolveAdminClientByCoreTenantId(coreTenant.id),
          fallbackMaxUsers: 3,
          fallbackMaxChannels: tenant.maxChannels,
          fallbackCurrentUsers: 0
        })
      : {
          maxChannels: tenant.maxChannels
        };

    const [instances, users] = await Promise.all([
      ensureTenantWhatsAppRegistry(tenant),
      loadEligibleTenantUsers(tenant.id)
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

    const tenant = await prisma.tenant.findUnique({
      where: {
        id: request.authUser.tenantId
      },
      select: {
        id: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        evolutionApiKey: true,
        maxChannels: true
      }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const coreTenant = await resolveCurrentCoreTenant({ slug: tenant.slug, name: tenant.name });
    const atendimentoSnapshot = coreTenant
      ? await resolveAtendimentoSnapshot({
          coreTenantId: coreTenant.id,
          adminClient: await resolveAdminClientByCoreTenantId(coreTenant.id),
          fallbackMaxUsers: 3,
          fallbackMaxChannels: tenant.maxChannels,
          fallbackCurrentUsers: 0
        })
      : {
          maxChannels: tenant.maxChannels
        };

    const instances = await ensureTenantWhatsAppRegistry(tenant);
    const normalizedInstanceName = normalizeWhatsAppInstanceName(parsed.data.instanceName);
    if (instances.some((entry) => entry.instanceName === normalizedInstanceName)) {
      return reply.code(409).send({ message: "Ja existe uma instancia com este nome neste cliente." });
    }

    const tenantUsers = await loadEligibleTenantUsers(tenant.id);
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
        evolutionApiKey: normalizeEvolutionApiKey(parsed.data.evolutionApiKey) ?? null,
        queueLabel: normalizeOptionalText(parsed.data.queueLabel),
        responsibleUserId,
        userScopePolicy: parsed.data.userScopePolicy,
        isDefault: parsed.data.isDefault || instances.length < 1,
        isActive: parsed.data.isActive,
        createdByUserId: request.authUser.sub
      }
    });

    if (created.isDefault || !tenant.whatsappInstance) {
      await prisma.tenant.update({
        where: {
          id: tenant.id
        },
        data: {
          whatsappInstance: created.instanceName
        }
      });
    }

    const refreshed = await ensureTenantWhatsAppRegistry(tenant.id);
    const instance = refreshed.find((entry) => entry.id === created.id);
    return reply.code(201).send(instance ? mapInstancePayload(instance) : mapInstancePayload({
      ...created,
      queueLabel: created.queueLabel ?? null,
      responsibleUserId: created.responsibleUserId ?? null,
      responsibleUser: null,
      userAccesses: []
    }));
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

    const tenant = await prisma.tenant.findUnique({
      where: {
        id: request.authUser.tenantId
      },
      select: {
        id: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        evolutionApiKey: true,
        maxChannels: true
      }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const coreTenant = await resolveCurrentCoreTenant({ slug: tenant.slug, name: tenant.name });
    const atendimentoSnapshot = coreTenant
      ? await resolveAtendimentoSnapshot({
          coreTenantId: coreTenant.id,
          adminClient: await resolveAdminClientByCoreTenantId(coreTenant.id),
          fallbackMaxUsers: 3,
          fallbackMaxChannels: tenant.maxChannels,
          fallbackCurrentUsers: 0
        })
      : {
          maxChannels: tenant.maxChannels
        };

    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: params.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(404).send({ message: "Instancia WhatsApp nao encontrada" });
    }

    const normalizedNextName = body.data.instanceName
      ? normalizeWhatsAppInstanceName(body.data.instanceName)
      : instance.instanceName;

    if (normalizedNextName !== instance.instanceName) {
      const duplicate = await prisma.whatsAppInstance.findFirst({
        where: {
          tenantId: tenant.id,
          instanceName: normalizedNextName,
          id: {
            not: instance.id
          }
        },
        select: {
          id: true
        }
      });

      if (duplicate) {
        return reply.code(409).send({ message: "Ja existe uma instancia com este nome neste cliente." });
      }
    }

    const tenantUsers = await loadEligibleTenantUsers(tenant.id);
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
        instanceName: normalizedNextName,
        displayName: body.data.displayName === undefined ? undefined : body.data.displayName.trim() || null,
        phoneNumber: body.data.phoneNumber === undefined ? undefined : body.data.phoneNumber.trim() || null,
        evolutionApiKey: body.data.evolutionApiKey === undefined
          ? undefined
          : normalizeEvolutionApiKey(body.data.evolutionApiKey) ?? null,
        queueLabel: body.data.queueLabel === undefined ? undefined : normalizeOptionalText(body.data.queueLabel),
        responsibleUserId,
        userScopePolicy: body.data.userScopePolicy,
        isActive: body.data.isActive,
        isDefault: body.data.isDefault
      }
    });

    if (normalizedNextName !== instance.instanceName) {
      await prisma.$transaction([
        prisma.conversation.updateMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { instanceId: updated.id },
              { instanceScopeKey: instance.instanceName }
            ]
          },
          data: {
            instanceScopeKey: updated.instanceName
          }
        }),
        prisma.message.updateMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { instanceId: updated.id },
              { instanceScopeKey: instance.instanceName }
            ]
          },
          data: {
            instanceScopeKey: updated.instanceName
          }
        })
      ]);
    }

    if (updated.isDefault || tenant.whatsappInstance === instance.instanceName) {
      await prisma.tenant.update({
        where: {
          id: tenant.id
        },
        data: {
          whatsappInstance: updated.instanceName,
          evolutionApiKey: updated.evolutionApiKey ?? tenant.evolutionApiKey
        }
      });
    }

    const refreshed = await ensureTenantWhatsAppRegistry(tenant.id);
    const refreshedInstance = refreshed.find((entry) => entry.id === instance.id);
    return refreshedInstance ? mapInstancePayload(refreshedInstance) : mapInstancePayload({
      ...updated,
      queueLabel: updated.queueLabel ?? null,
      responsibleUserId: updated.responsibleUserId ?? null,
      responsibleUser: null,
      userAccesses: []
    });
  });

  protectedApp.put("/tenant/whatsapp/instances/:instanceId/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = whatsappInstanceParamsSchema.safeParse(request.params);
    const body = updateWhatsAppInstanceUsersSchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: body.success ? undefined : body.error.flatten()
      });
    }

    const instance = await resolveTenantInstanceById({
      tenantId: request.authUser.tenantId,
      instanceId: params.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(404).send({ message: "Instancia WhatsApp nao encontrada" });
    }

    const tenantUsers = await loadEligibleTenantUsers(request.authUser.tenantId);
    const allowedUsers = new Set(
      tenantUsers
        .filter((entry) => entry.atendimentoAccess)
        .map((entry) => entry.id)
    );

    const invalidUserIds = body.data.userIds.filter((entry) => !allowedUsers.has(entry));
    if (invalidUserIds.length > 0) {
      return reply.code(409).send({
        message: "Alguns usuarios selecionados ainda nao possuem acesso ao modulo atendimento.",
        details: {
          invalidUserIds
        }
      });
    }

    let updated;
    try {
      updated = await assignUsersToWhatsAppInstance({
        tenantId: request.authUser.tenantId,
        instanceId: instance.id,
        userIds: body.data.userIds
      });
    } catch (error) {
      const conflictError = error as Error & { code?: string; details?: unknown };
      if (conflictError.code === "WHATSAPP_INSTANCE_USER_SCOPE_CONFLICT") {
        return reply.code(409).send({
          message: conflictError.message,
          details: conflictError.details
        });
      }

      throw error;
    }

    if (!updated) {
      return reply.code(404).send({ message: "Instancia WhatsApp nao encontrada" });
    }

    return {
      ...mapInstancePayload(updated),
      users: tenantUsers
    };
  });
}
