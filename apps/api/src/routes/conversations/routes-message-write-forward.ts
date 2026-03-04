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


export function registerConversationForwardMessagesRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/forward", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = forwardMessagesSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const [sourceConversation, targetConversation] = await prisma.$transaction([
        prisma.conversation.findFirst({
          where: {
            id: params.data.conversationId,
            tenantId: request.authUser.tenantId
          }
        }),
        prisma.conversation.findFirst({
          where: {
            id: body.data.targetConversationId,
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!sourceConversation) {
        return reply.code(404).send({ message: "Conversa origem nao encontrada" });
      }

      if (!targetConversation) {
        return reply.code(404).send({ message: "Conversa destino nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(targetConversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou encaminhamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: targetConversation.externalId
          }
        });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const sourceMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: sourceConversation.id,
          id: {
            in: messageIds
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      if (sourceMessages.length === 0) {
        return reply.code(404).send({ message: "Nenhuma mensagem encontrada para encaminhar" });
      }

      const createdMessages: typeof sourceMessages = [];
      const queuedIds: string[] = [];
      const failedToQueueIds: string[] = [];

      for (const sourceMessage of sourceMessages) {
        const correlationId = deriveMessageCorrelationId(request.correlationId, sourceMessage.id);
        const created = await prisma.message.create({
          data: {
            tenant: {
              connect: {
                id: request.authUser.tenantId
              }
            },
            conversation: {
              connect: {
                id: targetConversation.id
              }
            },
            senderUser: {
              connect: {
                id: request.authUser.sub
              }
            },
            direction: MessageDirection.OUTBOUND,
            messageType: sourceMessage.messageType,
            senderName: request.authUser.name,
            senderAvatarUrl: null,
            content: sourceMessage.content,
            mediaUrl: sourceMessage.mediaUrl,
            mediaMimeType: sourceMessage.mediaMimeType,
            mediaFileName: sourceMessage.mediaFileName,
            mediaFileSizeBytes: sourceMessage.mediaFileSizeBytes,
            mediaCaption: sourceMessage.mediaCaption,
            mediaDurationSeconds: sourceMessage.mediaDurationSeconds,
            metadataJson: cloneForwardMetadata(sourceMessage.metadataJson, {
              id: sourceMessage.id,
              conversationId: sourceMessage.conversationId
            }, {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }, correlationId),
            status: MessageStatus.PENDING
          }
        });

        createdMessages.push(created);

        try {
          await outboundQueue.add(
            "forward-message",
            {
              tenantId: request.authUser.tenantId,
              conversationId: targetConversation.id,
              messageId: created.id,
              correlationId
            },
            outboundRetryJobOptions
          );
          queuedIds.push(created.id);
        } catch (queueError) {
          failedToQueueIds.push(created.id);

          const failed = await prisma.message.update({
            where: {
              id: created.id
            },
            data: {
              status: MessageStatus.FAILED
            }
          });

          const index = createdMessages.findIndex((entry) => entry.id === failed.id);
          if (index >= 0) {
            createdMessages[index] = failed;
          }

          const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
          await recordAuditEvent({
            tenantId: request.authUser.tenantId,
            actorUserId: request.authUser.sub,
            conversationId: targetConversation.id,
            messageId: failed.id,
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            payloadJson: {
              messageType: failed.messageType,
              provider: "queue",
              stage: "queue_add_forward",
              errorMessage: queueErrorMessage,
              correlationId
            } as Prisma.InputJsonValue
          });
        }

        await publishEvent({
          type: "message.created",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(
              createdMessages.find((entry) => entry.id === created.id) ?? created
            ) as unknown as Record<string, unknown>),
            correlationId
          }
        });
      }

      const lastCreatedMessage = createdMessages[createdMessages.length - 1] ?? null;
      if (lastCreatedMessage) {
        await prisma.conversation.update({
          where: {
            id: targetConversation.id
          },
          data: {
            lastMessageAt: lastCreatedMessage.createdAt,
            status: ConversationStatus.OPEN
          }
        });
      }

      return {
        sourceConversationId: sourceConversation.id,
        targetConversationId: targetConversation.id,
        createdCount: createdMessages.length,
        queuedCount: queuedIds.length,
        failedToQueueCount: failedToQueueIds.length,
        failedToQueueIds,
        messages: createdMessages
      };
    });

}
