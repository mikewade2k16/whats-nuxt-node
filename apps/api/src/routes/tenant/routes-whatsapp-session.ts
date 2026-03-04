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
  normalizeEvolutionApiKey,
  resolveConfiguredChannelCount,
  resolveInstanceName
} from "./helpers.js";
import { bootstrapWhatsAppSchema, connectWhatsAppSchema } from "./schemas.js";

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
    const instanceName = resolveInstanceName(
      parsed.data.instanceName,
      tenant.whatsappInstance,
      tenant.slug
    );
    const currentChannels = resolveConfiguredChannelCount(tenant.whatsappInstance);
    const currentInstance = tenant.whatsappInstance?.trim() || null;
    const isReusingCurrentInstance = Boolean(currentInstance && currentInstance === instanceName);

    if (!isReusingCurrentInstance && currentChannels >= tenant.maxChannels) {
      return reply.code(409).send({
        message: "Limite de canais do plano atingido para este tenant.",
        details: {
          maxChannels: tenant.maxChannels,
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
    if (!tenant.whatsappInstance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const connectResult = await client.connectInstance({
        instanceName: tenant.whatsappInstance,
        number: parsed.data.number
      });
      const connectionState = await client.getConnectionState(tenant.whatsappInstance);

      return {
        success: true,
        instanceName: tenant.whatsappInstance,
        connectResult,
        mode: parsed.data.number ? "PAIRING_CODE" : "QRCODE",
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

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    if (!tenant.whatsappInstance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const logoutResult = await client.logoutInstance(tenant.whatsappInstance);
      const connectionState = await client.getConnectionState(tenant.whatsappInstance);

      return {
        success: true,
        instanceName: tenant.whatsappInstance,
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
