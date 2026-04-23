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
import { getTenantRuntimeOrFail } from "../../services/tenant-runtime.js";
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
import { mergeConversationScopeWhere, resolveConversationAccessScope } from "./access.js";


export function registerConversationSendMessageRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }
      const accessScope = await resolveConversationAccessScope(request);

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const body = sendMessageSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: body.error.flatten()
        });
      }

      const conversation = await prisma.conversation.findFirst({
        where: mergeConversationScopeWhere(accessScope.conversationWhere, {
          id: params.data.conversationId,
        })
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }
      const messageCorrelationId = deriveMessageCorrelationId(request.correlationId);

      if (body.data.type !== MessageType.TEXT) {
        const tenantLimits = await getTenantRuntimeOrFail(request.authUser.tenantId, {
          accessToken: request.coreAccessToken
        });

        const uploadValidation = validateOutboundUpload(tenantLimits, {
          messageType: body.data.type,
          mediaUrl: body.data.mediaUrl,
          mediaMimeType: body.data.mediaMimeType,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes
        });

        if (!uploadValidation.ok) {
          return reply.code(uploadValidation.error.statusCode).send({
            message: uploadValidation.error.message,
            code: uploadValidation.error.code,
            details: uploadValidation.error.details
          });
        }
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou envio para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const content = resolveOutboundMessageContent(body.data);
      const outboundMetadataWithCorrelation = withCorrelationIdMetadata(
        body.data.metadataJson,
        messageCorrelationId
      );

      const message = await prisma.message.create({
        data: {
          tenantId: request.authUser.tenantId,
          ...(conversation.instanceId
            ? {
                instanceId: conversation.instanceId
              }
            : {}),
          conversationId: conversation.id,
          senderUserId: request.authUser.sub,
          direction: MessageDirection.OUTBOUND,
          messageType: body.data.type,
          instanceScopeKey: conversation.instanceScopeKey,
          senderName: request.authUser.name,
          senderAvatarUrl: null,
          content,
          mediaUrl: body.data.mediaUrl?.trim() || null,
          mediaMimeType: body.data.mediaMimeType?.trim() || null,
          mediaFileName: body.data.mediaFileName?.trim() || null,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes,
          mediaCaption: body.data.mediaCaption?.trim() || null,
          mediaDurationSeconds: body.data.mediaDurationSeconds,
          metadataJson: outboundMetadataWithCorrelation as Prisma.InputJsonValue,
          status: MessageStatus.PENDING
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          status: ConversationStatus.OPEN
        }
      });

      try {
        await outboundQueue.add(
          "send-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: message.id,
            correlationId: messageCorrelationId
          },
          outboundRetryJobOptions
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);

        const failed = await prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.created",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(failed) as unknown as Record<string, unknown>),
            correlationId: messageCorrelationId
          }
        });

        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          messageId: failed.id,
          eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
          payloadJson: {
            messageType: failed.messageType,
            provider: "queue",
            stage: "queue_add",
            errorMessage: queueErrorMessage,
            correlationId: messageCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.created",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(message) as unknown as Record<string, unknown>),
          correlationId: messageCorrelationId
        }
      });

      await recordAuditEvent({
        tenantId: request.authUser.tenantId,
        actorUserId: request.authUser.sub,
        conversationId: conversation.id,
        messageId: message.id,
        eventType: AuditEventType.MESSAGE_OUTBOUND_QUEUED,
        payloadJson: {
          messageType: message.messageType,
          status: message.status,
          queuedBy: {
            userId: request.authUser.sub,
            userName: request.authUser.name
          },
          correlationId: messageCorrelationId,
          queue: {
            name: "send-message",
            attempts: 3,
            backoffType: "exponential",
            backoffDelayMs: 2000
          }
        } as Prisma.InputJsonValue
      });

      return message;
    });

}
