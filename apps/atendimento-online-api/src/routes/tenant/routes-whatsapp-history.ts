import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/guards.js";
import { clearWhatsAppConversationHistory } from "../../services/whatsapp-conversation-history.js";
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";
import { getTenantOrFail } from "./helpers.js";
import { clearWhatsAppConversationHistorySchema } from "./schemas.js";

export function registerTenantWhatsAppHistoryRoutes(protectedApp: FastifyInstance) {
  protectedApp.post("/tenant/whatsapp/conversations/clear", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = clearWhatsAppConversationHistorySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = parsed.data.instanceId
      ? await resolveTenantInstanceById({
          tenantId: tenant.id,
          instanceId: parsed.data.instanceId,
          includeInactive: true
        })
      : null;

    if (parsed.data.instanceId && !instance) {
      return reply.code(404).send({
        message: "Instancia WhatsApp nao encontrada para este tenant"
      });
    }

    const result = await clearWhatsAppConversationHistory({
      tenantId: tenant.id,
      instance: instance
        ? {
            id: instance.id,
            instanceName: instance.instanceName
          }
        : null
    });

    request.log.info(
      {
        tenantId: tenant.id,
        actorUserId: request.authUser.sub,
        scope: result.scope,
        instanceId: result.instanceId,
        instanceName: result.instanceName,
        deletedAuditEvents: result.deletedAuditEvents,
        deletedMessages: result.deletedMessages,
        deletedConversations: result.deletedConversations
      },
      "Historico de conversas WhatsApp limpo manualmente"
    );

    return reply.send({
      ...result,
      message: result.deletedConversations > 0 || result.deletedMessages > 0
        ? "Historico limpo com sucesso"
        : "Nenhuma conversa encontrada para limpar"
    });
  });
}