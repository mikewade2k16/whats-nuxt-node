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
import { mergeConversationScopeWhere, resolveConversationAccessScope } from "./access.js";


export function registerConversationReprocessRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/:messageId/reprocess", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }
      const accessScope = await resolveConversationAccessScope(request);

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: mergeConversationScopeWhere(accessScope.conversationWhere, {
          id: params.data.conversationId,
        })
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

      if (message.direction !== MessageDirection.OUTBOUND) {
        return reply.code(400).send({ message: "Somente mensagens outbound podem ser reprocessadas" });
      }

      const reprocessCorrelationId =
        getCorrelationIdFromMetadata(message.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, message.id);
      const metadataWithCorrelation = withCorrelationIdMetadata(message.metadataJson, reprocessCorrelationId);

      if (!body.data.force && message.status === MessageStatus.SENT) {
        return reply.code(409).send({
          message: "Mensagem ja enviada. Use force=true para reenviar."
        });
      }

      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.PENDING,
          externalMessageId: null,
          metadataJson: metadataWithCorrelation as Prisma.InputJsonValue
        }
      });

      try {
        await outboundQueue.add(
          "reprocess-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: updated.id,
            correlationId: reprocessCorrelationId
          },
          outboundRetryJobOptions
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
        const failed = await prisma.message.update({
          where: { id: updated.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failed.id,
            status: failed.status,
            externalMessageId: failed.externalMessageId,
            updatedAt: failed.updatedAt,
            correlationId: reprocessCorrelationId
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
            stage: "queue_add_reprocess_single",
            errorMessage: queueErrorMessage,
            correlationId: reprocessCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          id: updated.id,
          status: updated.status,
          externalMessageId: updated.externalMessageId,
          updatedAt: updated.updatedAt,
          correlationId: reprocessCorrelationId
        }
      });

      return updated;
    });

}
