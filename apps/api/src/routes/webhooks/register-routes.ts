import { MessageType } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import type { IncomingWebhookPayload } from "./shared.js";
import {
  MESSAGE_CREATE_EVENTS,
  MESSAGE_UPDATE_EVENTS,
  parseEventName,
  extractInstanceName,
  parseIncomingReaction,
  shouldValidateWebhookToken
} from "./shared.js";
import { handleQrWebhook } from "./handlers/qr.js";
import { handleMessageUpsertWebhook } from "./handlers/message-upsert.js";
import { handleReactionWebhook } from "./handlers/reaction.js";

export async function webhookRoutes(app: FastifyInstance) {
  const handleEvolutionWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({
        tenantSlug: z.string().min(2),
        eventName: z.string().min(2).optional()
      })
      .safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: "Tenant invalido" });
    }

    if (shouldValidateWebhookToken()) {
      const token = request.headers["x-webhook-token"];
      if (token !== env.EVOLUTION_WEBHOOK_TOKEN) {
        return reply.code(401).send({ message: "Token de webhook invalido" });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.data.tenantSlug }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const payload = (request.body ?? {}) as IncomingWebhookPayload;
    const eventName = parseEventName(payload, params.data.eventName);
    const instanceName = extractInstanceName(payload) || tenant.whatsappInstance || "default";
    const webhookCorrelationId = request.correlationId || request.id;
    const isMessageCreateEvent = MESSAGE_CREATE_EVENTS.has(eventName);
    const isMessageUpdateEvent = MESSAGE_UPDATE_EVENTS.has(eventName);

    if (eventName.includes("QRCODE")) {
      const qrResponse = await handleQrWebhook({
        tenantId: tenant.id,
        instanceName,
        eventName,
        payload
      });
      return reply.code(qrResponse.statusCode).send(qrResponse.body);
    }

    if (eventName && !isMessageCreateEvent && !isMessageUpdateEvent) {
      return reply.code(202).send({
        status: "ignored",
        event: eventName
      });
    }

    const parsedReaction = parseIncomingReaction(payload);
    if (parsedReaction) {
      const reactionResponse = await handleReactionWebhook({
        tenantId: tenant.id,
        eventName,
        webhookCorrelationId,
        parsedReaction
      });
      return reply.code(reactionResponse.statusCode).send(reactionResponse.body);
    }

    if (eventName && !isMessageCreateEvent) {
      return reply.code(202).send({
        status: "ignored",
        event: eventName
      });
    }

    const messageUpsertResponse = await handleMessageUpsertWebhook({
      tenant,
      instanceName,
      payload,
      webhookCorrelationId
    });

    return reply.code(messageUpsertResponse.statusCode).send(messageUpsertResponse.body);
  };

  app.post("/webhooks/evolution/:tenantSlug", handleEvolutionWebhook);
  app.post("/webhooks/evolution/:tenantSlug/:eventName", handleEvolutionWebhook);
}
