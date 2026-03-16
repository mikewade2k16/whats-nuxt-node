import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { rateLimitRequest } from "../../lib/rate-limit.js";
import { resolveTrustedClientIp } from "../../lib/trusted-proxy.js";
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
import { parseIncomingDeletionUpdate } from "./message-update-parser.js";
import { handleMessageUpdateWebhook } from "./handlers/message-update.js";
import {
  acquireWebhookIdempotency,
  completeWebhookIdempotency,
  releaseWebhookIdempotency
} from "./idempotency.js";
import { ensureTenantWhatsAppRegistry, normalizeWhatsAppInstanceName } from "../../services/whatsapp-instances.js";

const webhookContentTypeAllowlist = [
  "application/json",
  "application/cloudevents+json",
  "application/problem+json",
  "text/plain"
];

function resolveWebhookRequestIp(request: FastifyRequest) {
  return resolveTrustedClientIp({
    peerIp: request.ip || request.socket?.remoteAddress,
    forwardedFor: request.headers["x-forwarded-for"],
    trustedRanges: env.TRUSTED_PROXY_RANGES
  });
}

function isAllowedWebhookContentType(rawContentType: unknown) {
  const normalized = String(rawContentType ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return webhookContentTypeAllowlist.some((allowedType) => normalized.startsWith(allowedType));
}

function hasValidWebhookToken(rawToken: string | string[] | undefined) {
  if (!shouldValidateWebhookToken()) {
    return true;
  }

  const configuredToken = String(env.EVOLUTION_WEBHOOK_TOKEN ?? "");
  const receivedToken = Array.isArray(rawToken) ? String(rawToken[0] ?? "") : String(rawToken ?? "");
  if (!configuredToken || !receivedToken) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredToken, "utf8");
  const receivedBuffer = Buffer.from(receivedToken, "utf8");
  if (configuredBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredBuffer, receivedBuffer);
}

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

    const requestIp = resolveWebhookRequestIp(request);
    const rateLimit = await rateLimitRequest({
      scope: "webhook.evolution",
      key: `${params.data.tenantSlug}:${requestIp}`,
      max: 600,
      windowMs: 60_000,
      blockMs: 5 * 60_000
    });

    reply.header("x-rate-limit-limit", "600");
    reply.header("x-rate-limit-remaining", String(rateLimit.remaining));
    reply.header("x-rate-limit-reset", String(Math.ceil(rateLimit.resetAt / 1_000)));

    if (!rateLimit.allowed) {
      reply.header("retry-after", String(rateLimit.retryAfterSeconds));
      return reply.code(429).send({
        message: "Muitos webhooks recebidos em pouco tempo."
      });
    }

    if (!hasValidWebhookToken(request.headers["x-webhook-token"])) {
      return reply.code(401).send({ message: "Token de webhook invalido" });
    }

    if (!isAllowedWebhookContentType(request.headers["content-type"])) {
      return reply.code(415).send({ message: "Content-Type de webhook nao suportado" });
    }

    const rawContentLength = Number.parseInt(String(request.headers["content-length"] ?? ""), 10);
    if (Number.isFinite(rawContentLength) && rawContentLength > env.WEBHOOK_BODY_LIMIT_KB * 1024) {
      return reply.code(413).send({ message: "Payload de webhook acima do limite permitido" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.data.tenantSlug }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const payload = (request.body ?? {}) as IncomingWebhookPayload;
    const eventName = parseEventName(payload, params.data.eventName);
    const extractedInstanceName = normalizeWhatsAppInstanceName(
      extractInstanceName(payload) || tenant.whatsappInstance || "default"
    );
    const knownInstances = await ensureTenantWhatsAppRegistry({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      whatsappInstance: tenant.whatsappInstance,
      evolutionApiKey: tenant.evolutionApiKey
    });
    let resolvedInstance =
      knownInstances.find((entry) => entry.instanceName === extractedInstanceName) ??
      null;

    if (!resolvedInstance && extractedInstanceName) {
      await prisma.whatsAppInstance.create({
        data: {
          tenantId: tenant.id,
          instanceName: extractedInstanceName,
          displayName: extractedInstanceName,
          evolutionApiKey: tenant.evolutionApiKey,
          isDefault: knownInstances.length < 1,
          isActive: true
        }
      });
      const refreshedInstances = await ensureTenantWhatsAppRegistry({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsappInstance: tenant.whatsappInstance,
        evolutionApiKey: tenant.evolutionApiKey
      });
      resolvedInstance =
        refreshedInstances.find((entry) => entry.instanceName === extractedInstanceName) ??
        null;

      if (!tenant.whatsappInstance || resolvedInstance?.isDefault) {
        await prisma.tenant.update({
          where: {
            id: tenant.id
          },
          data: {
            whatsappInstance: resolvedInstance?.instanceName || extractedInstanceName
          }
        });
      }
    }

    const instanceName = resolvedInstance?.instanceName || extractedInstanceName || "default";
    const webhookCorrelationId = request.correlationId || request.id;
    const isMessageCreateEvent = MESSAGE_CREATE_EVENTS.has(eventName);
    const isMessageUpdateEvent = MESSAGE_UPDATE_EVENTS.has(eventName);
    const idempotency = await acquireWebhookIdempotency({
      tenantSlug: tenant.slug,
      eventName,
      payload
    });

    if (idempotency.decision === "done") {
      return reply.code(202).send({
        status: "ignored",
        event: eventName,
        reason: "duplicate_webhook_replay",
        idempotencyKey: idempotency.key
      });
    }

    if (idempotency.decision === "processing") {
      return reply.code(202).send({
        status: "ignored",
        event: eventName,
        reason: "webhook_already_processing",
        idempotencyKey: idempotency.key
      });
    }

    try {
      if (eventName.includes("QRCODE")) {
        const qrResponse = await handleQrWebhook({
          tenantId: tenant.id,
          instanceId: resolvedInstance?.id ?? null,
          instanceName,
          eventName,
          payload
        });
        await completeWebhookIdempotency(idempotency.key, idempotency.token);
        return reply.code(qrResponse.statusCode).send(qrResponse.body);
      }

      if (eventName && !isMessageCreateEvent && !isMessageUpdateEvent) {
        await completeWebhookIdempotency(idempotency.key, idempotency.token);
        return reply.code(202).send({
          status: "ignored",
          event: eventName
        });
      }

      const parsedReaction = parseIncomingReaction(payload);
      if (parsedReaction) {
        const reactionResponse = await handleReactionWebhook({
          tenantId: tenant.id,
          instanceScopeKey: instanceName,
          eventName,
          webhookCorrelationId,
          parsedReaction
        });
        await completeWebhookIdempotency(idempotency.key, idempotency.token);
        return reply.code(reactionResponse.statusCode).send(reactionResponse.body);
      }

      if (isMessageUpdateEvent) {
        const parsedDeletionUpdate = parseIncomingDeletionUpdate(payload);
        if (parsedDeletionUpdate) {
          const messageUpdateResponse = await handleMessageUpdateWebhook({
          tenantId: tenant.id,
          instanceScopeKey: instanceName,
          eventName,
          webhookCorrelationId,
          parsedDeletionUpdate
          });
          await completeWebhookIdempotency(idempotency.key, idempotency.token);
          return reply.code(messageUpdateResponse.statusCode).send(messageUpdateResponse.body);
        }
      }

      if (eventName && !isMessageCreateEvent) {
        await completeWebhookIdempotency(idempotency.key, idempotency.token);
        return reply.code(202).send({
          status: "ignored",
          event: eventName
        });
      }

      const messageUpsertResponse = await handleMessageUpsertWebhook({
        tenant,
        instanceId: resolvedInstance?.id ?? null,
        instanceName,
        payload,
        webhookCorrelationId
      });

      await completeWebhookIdempotency(idempotency.key, idempotency.token);
      return reply.code(messageUpsertResponse.statusCode).send(messageUpsertResponse.body);
    } catch (error) {
      await releaseWebhookIdempotency(idempotency.key, idempotency.token);
      throw error;
    }
  };

  app.post("/webhooks/evolution/:tenantSlug", handleEvolutionWebhook);
  app.post("/webhooks/evolution/:tenantSlug/:eventName", handleEvolutionWebhook);
}
