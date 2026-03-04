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


export function registerConversationReprocessFailedRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/reprocess-failed", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessBatchSchema.safeParse(request.body ?? {});

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

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou reprocessamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const failedMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED
        },
        orderBy: {
          createdAt: "asc"
        },
        take: body.data.limit
      });

      if (failedMessages.length === 0) {
        return {
          queued: 0,
          totalFailed: 0,
          messageIds: []
        };
      }

      const failedIds = failedMessages.map((entry) => entry.id);
      const queuedIds: string[] = [];
      const failedToQueueIds: string[] = [];
      const now = new Date().toISOString();
      for (const failedMessage of failedMessages) {
        const correlationId =
          getCorrelationIdFromMetadata(failedMessage.metadataJson) ??
          deriveMessageCorrelationId(request.correlationId, failedMessage.id);

        const nextMetadata = withCorrelationIdMetadata(failedMessage.metadataJson, correlationId);

        await prisma.message.update({
          where: { id: failedMessage.id },
          data: {
            status: MessageStatus.PENDING,
            externalMessageId: null,
            metadataJson: nextMetadata as Prisma.InputJsonValue
          }
        });

        try {
          await outboundQueue.add(
            "reprocess-failed-message",
            {
              tenantId: request.authUser.tenantId,
              conversationId: conversation.id,
              messageId: failedMessage.id,
              correlationId
            },
            outboundRetryJobOptions
          );
          queuedIds.push(failedMessage.id);
        } catch (queueError) {
          const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
          failedToQueueIds.push(failedMessage.id);

          await prisma.message.update({
            where: { id: failedMessage.id },
            data: {
              status: MessageStatus.FAILED
            }
          });

          await publishEvent({
            type: "message.updated",
            tenantId: request.authUser.tenantId,
            payload: {
              id: failedMessage.id,
              status: MessageStatus.FAILED,
              updatedAt: new Date().toISOString(),
              correlationId
            }
          });

          await recordAuditEvent({
            tenantId: request.authUser.tenantId,
            actorUserId: request.authUser.sub,
            conversationId: conversation.id,
            messageId: failedMessage.id,
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            payloadJson: {
              messageType: failedMessage.messageType,
              provider: "queue",
              stage: "queue_add_reprocess_batch",
              errorMessage: queueErrorMessage,
              correlationId
            } as Prisma.InputJsonValue
          });

          continue;
        }

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failedMessage.id,
            status: MessageStatus.PENDING,
            updatedAt: now,
            correlationId
          }
        });
      }

      return {
        queued: queuedIds.length,
        totalFailed: failedIds.length,
        messageIds: queuedIds,
        failedToQueueCount: failedToQueueIds.length,
        failedToQueueMessageIds: failedToQueueIds
      };
    });

}
