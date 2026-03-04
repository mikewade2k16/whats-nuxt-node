import type { FastifyInstance } from "fastify";
import { EvolutionApiError } from "../../services/evolution-client.js";
import {
  buildWebhookUrl,
  createEvolutionClientOrThrow,
  getTenantOrFail
} from "./helpers.js";

export function registerTenantWhatsAppStatusRoute(protectedApp: FastifyInstance) {
  protectedApp.get("/tenant/whatsapp/status", async (request, reply) => {
    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instanceName = tenant.whatsappInstance;

    if (!instanceName) {
      return {
        configured: false,
        message: "Tenant ainda nao possui instancia WhatsApp configurada"
      };
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const [connectionState, webhook] = await Promise.all([
        client.getConnectionState(instanceName),
        client.findWebhook(instanceName)
      ]);

      return {
        configured: true,
        instanceName,
        webhookUrl: buildWebhookUrl(tenant.slug),
        connectionState,
        webhook
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
