import {
  AuditEventType,
  ChannelType,
  ConversationStatus,
  MessageDirection,
  Prisma,
  MessageStatus,
  MessageType
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { publishEvent } from "../../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../lib/correlation.js";
import { requireConversationWrite } from "../../lib/guards.js";
import { outboundQueue, outboundRetryJobOptions } from "../../queue.js";
import { recordAuditEvent } from "../../services/audit-log.js";
import type { EvolutionClient } from "../../services/evolution-client.js";
import { validateOutboundUpload } from "../../services/upload-policy.js";
import { asRecord } from "./object-utils.js";
import {
  normalizeReactionEmoji,
  withMessageReactionMetadata
} from "./reactions.js";
import {
  collectRelatedRemoteJidsFromGroupInfo,
  createEvolutionClientForTenant,
  extractPhone,
  findContactByRemoteJid,
  mergeParticipantRecord,
  normalizeParticipantJid,
  parseGroupParticipantsFromPayload,
  shouldResolveParticipantName
} from "./participants.js";
import {
  buildConversationPreviewPayload,
  mapConversation,
  toRealtimeMessagePayload
} from "./realtime.js";
import {
  buildContentDispositionHeader,
  decodeDataUrl,
  extractEvolutionRehydratedMediaPayload,
  isLikelyEncryptedOrEphemeralMediaUrl,
  mediaTypeLabel,
  resolveMediaDownloadFileName,
  resolveOutboundMessageContent,
  sanitizeEncryptedMediaFileName
} from "./media.js";
import {
  isBlockedMediaProxyHost,
  isSandboxDestinationAllowed,
  resolveSandboxTestExternalId
} from "./sandbox.js";
import {
  buildDeletedForAllMetadata,
  cloneForwardMetadata
} from "./message-actions.js";
import {
  assignConversationSchema,
  bulkMessageIdsSchema,
  createConversationSchema,
  forwardMessagesSchema,
  messageMediaQuerySchema,
  reactToMessageSchema,
  reprocessBatchSchema,
  reprocessMessageSchema,
  sendMessageSchema,
  updateStatusSchema
} from "./schemas.js";
import type { GroupParticipantResponse } from "./types.js";


export function registerConversationReactionRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/:messageId/reaction", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reactToMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      const normalizedEmoji = normalizeReactionEmoji(body.data.emoji);
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      if (env.EVOLUTION_BASE_URL) {
        if (!message.externalMessageId) {
          return reply.code(409).send({
            message: "Mensagem ainda sem identificador externo para enviar reacao."
          });
        }

        const instanceName = tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "";
        const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
        if (evolutionClient && instanceName) {
          try {
            await evolutionClient.sendReaction({
              instanceName,
              pathTemplate: env.EVOLUTION_SEND_REACTION_PATH,
              payload: {
                key: {
                  remoteJid: conversation.externalId,
                  fromMe: message.direction === MessageDirection.OUTBOUND,
                  id: message.externalMessageId
                },
                reaction: normalizedEmoji ?? ""
              },
              timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
            });
          } catch (error) {
            request.log.error(
              {
                messageId: message.id,
                conversationId: conversation.id,
                error
              },
              "Falha ao enviar reacao na Evolution"
            );
            return reply.code(502).send({
              message: "Nao foi possivel enviar a reacao para o WhatsApp."
            });
          }
        }
      }

      const nextMetadata = withMessageReactionMetadata({
        metadataJson: message.metadataJson,
        actorKey: `user:${request.authUser.sub}`,
        actorUserId: request.authUser.sub,
        actorName: request.authUser.name,
        actorJid: null,
        emoji: normalizedEmoji,
        source: "agent"
      });

      let updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          metadataJson: nextMetadata as Prisma.InputJsonValue
        }
      });

      const correlationId =
        getCorrelationIdFromMetadata(updated.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, updated.id);

      if (!getCorrelationIdFromMetadata(updated.metadataJson)) {
        updated = await prisma.message.update({
          where: { id: updated.id },
          data: {
            metadataJson: withCorrelationIdMetadata(updated.metadataJson, correlationId) as Prisma.InputJsonValue
          }
        });
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(updated) as unknown as Record<string, unknown>),
          correlationId
        }
      });

      return updated;
    });

}
