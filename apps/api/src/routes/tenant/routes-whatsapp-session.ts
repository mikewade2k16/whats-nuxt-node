import type { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { EvolutionApiError } from "../../services/evolution-client.js";
import {
  buildWebhookHeaders,
  buildWebhookUrl,
  createEvolutionClientOrThrow,
  getTenantOrFail,
  isInstanceAlreadyInUseError,
  normalizeConnectionState,
  normalizeEvolutionApiKey,
  resolveConfiguredChannelCount,
  resolveInstanceName
} from "./helpers.js";
import { bootstrapWhatsAppSchema, connectWhatsAppSchema } from "./schemas.js";
import {
  ensureTenantWhatsAppRegistry,
  resolveTenantInstanceById
} from "../../services/whatsapp-instances.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot,
  resolveCurrentCoreTenant
} from "./atendimento-snapshot.js";

const CONNECT_REQUEST_COOLDOWN_MS = 30_000;
const lastConnectRequestAtByInstance = new Map<string, number>();

function buildConnectRequestKey(tenantId: string, instanceName: string) {
  return `${tenantId}:${instanceName}`;
}

export function registerTenantWhatsAppSessionRoutes(protectedApp: FastifyInstance) {
  protectedApp.post("/tenant/whatsapp/bootstrap", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = bootstrapWhatsAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const existingInstances = await ensureTenantWhatsAppRegistry(tenant);
    const coreTenant = await resolveCurrentCoreTenant({ slug: tenant.slug, name: tenant.name });
    const atendimentoSnapshot = coreTenant
      ? await resolveAtendimentoSnapshot({
          coreTenantId: coreTenant.id,
          adminClient: await resolveAdminClientByCoreTenantId(coreTenant.id),
          fallbackMaxUsers: tenant.maxUsers,
          fallbackMaxChannels: tenant.maxChannels,
          fallbackCurrentUsers: 0
        })
      : {
          maxChannels: tenant.maxChannels
        };
    const selectedInstance = parsed.data.instanceId
      ? await resolveTenantInstanceById({
          tenantId: tenant.id,
          instanceId: parsed.data.instanceId,
          includeInactive: true
        })
      : null;
    const instanceName = resolveInstanceName(
      parsed.data.instanceName,
      selectedInstance?.instanceName ?? tenant.whatsappInstance,
      tenant.slug
    );
    const currentChannels = existingInstances.filter((entry) => entry.isActive).length;
    const isReusingCurrentInstance = Boolean(selectedInstance && selectedInstance.instanceName === instanceName);

    if (!isReusingCurrentInstance && currentChannels >= atendimentoSnapshot.maxChannels) {
      return reply.code(409).send({
        message: "Limite de canais do plano atingido para este tenant.",
        details: {
          maxChannels: atendimentoSnapshot.maxChannels,
          currentChannels
        }
      });
    }

    const tenantApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        whatsappInstance: instanceName,
        evolutionApiKey: tenantApiKey !== undefined ? tenantApiKey : undefined
      }
    });

    if (!selectedInstance) {
      await prisma.whatsAppInstance.create({
        data: {
          tenantId: tenant.id,
          instanceName,
          displayName: parsed.data.displayName?.trim() || tenant.name,
          evolutionApiKey: tenantApiKey ?? tenant.evolutionApiKey,
          isDefault: existingInstances.length < 1,
          isActive: true,
          createdByUserId: request.authUser.sub
        }
      });
    } else {
      await prisma.whatsAppInstance.update({
        where: { id: selectedInstance.id },
        data: {
          instanceName,
          displayName: parsed.data.displayName === undefined
            ? undefined
            : parsed.data.displayName.trim() || null,
          evolutionApiKey: tenantApiKey !== undefined ? tenantApiKey : undefined,
          isActive: true
        }
      });
    }

    const resolvedInstance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceName,
      includeInactive: true
    });

    if (!resolvedInstance) {
      return reply.code(500).send({ message: "Falha ao resolver a instancia WhatsApp apos o bootstrap." });
    }

    await prisma.$transaction([
      prisma.whatsAppInstance.updateMany({
        where: {
          tenantId: tenant.id,
          id: {
            not: resolvedInstance.id
          },
          isDefault: true
        },
        data: {
          isDefault: false
        }
      }),
      prisma.whatsAppInstance.update({
        where: {
          id: resolvedInstance.id
        },
        data: {
          isDefault: true
        }
      }),
      prisma.conversation.updateMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { instanceId: resolvedInstance.id },
            { instanceScopeKey: "default" }
          ]
        },
        data: {
          instanceId: resolvedInstance.id,
          instanceScopeKey: instanceName
        }
      }),
      prisma.message.updateMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { instanceId: resolvedInstance.id },
            { instanceScopeKey: "default" }
          ]
        },
        data: {
          instanceId: resolvedInstance.id,
          instanceScopeKey: instanceName
        }
      })
    ]);

      const webhookUrl = buildWebhookUrl(updatedTenant.slug);
    const webhookHeaders = buildWebhookHeaders();

    try {
      const client = createEvolutionClientOrThrow(updatedTenant.evolutionApiKey);
      let created = true;
      let createResult: Record<string, unknown> | null = null;

      try {
        createResult = await client.createInstance({
          instanceName,
          webhookUrl,
          number: parsed.data.number,
          webhookHeaders
        });
      } catch (error) {
        if (error instanceof EvolutionApiError && isInstanceAlreadyInUseError(error)) {
          created = false;
        } else {
          throw error;
        }
      }

      const webhookResult = await client.setWebhook({
        instanceName,
        webhookUrl,
        webhookHeaders
      });
      const connectResult = await client.connectInstance({
        instanceName,
        number: parsed.data.number
      });
      const connectionState = await client.getConnectionState(instanceName);

      return {
        success: true,
        instanceId: resolvedInstance.id,
        instanceName,
        webhookUrl,
        created,
        createResult,
        webhookResult,
        connectResult,
        connectionState
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });

  protectedApp.post("/tenant/whatsapp/connect", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = connectWhatsAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: parsed.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const instanceName = instance.instanceName;
      const connectionStateBefore = await client.getConnectionState(instanceName);
      const stateBefore = normalizeConnectionState(connectionStateBefore);
      const mode = parsed.data.number ? "PAIRING_CODE" : "QRCODE";
      const connectKey = buildConnectRequestKey(tenant.id, instanceName);
      const now = Date.now();
      const lastConnectAt = lastConnectRequestAtByInstance.get(connectKey) ?? 0;

      if (stateBefore === "open" || stateBefore === "connected") {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "already_connected"
        };
      }

      if (stateBefore === "connecting" && now - lastConnectAt < CONNECT_REQUEST_COOLDOWN_MS) {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "already_connecting"
        };
      }

      if (now - lastConnectAt < CONNECT_REQUEST_COOLDOWN_MS) {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "cooldown"
        };
      }

      lastConnectRequestAtByInstance.set(connectKey, now);

      const connectResult = await client.connectInstance({
        instanceName,
        number: parsed.data.number
      });
      const connectionState = await client.getConnectionState(instanceName);

      return {
        success: true,
        instanceName,
        connectResult,
        mode,
        connectionState
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });

  protectedApp.post("/tenant/whatsapp/logout", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = connectWhatsAppSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: parsed.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const logoutResult = await client.logoutInstance(instance.instanceName);
      const connectionState = await client.getConnectionState(instance.instanceName);

      return {
        success: true,
        instanceId: instance.id,
        instanceName: instance.instanceName,
        logoutResult,
        connectionState
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });
}
