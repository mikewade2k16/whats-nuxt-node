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


export function registerConversationDeleteForAllRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/delete-for-all", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = bulkMessageIdsSchema.safeParse(request.body ?? {});

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

      const instanceName = tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "";
      const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);

      if (!evolutionClient || !instanceName) {
        return reply.code(409).send({
          message: "WhatsApp nao esta configurado para apagar mensagens para todos."
        });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const messagesToDelete = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          id: {
            in: messageIds
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      const updatedMessages: typeof messagesToDelete = [];
      const updatedIds: string[] = [];
      const skippedIds = messageIds.filter((entry) => !messagesToDelete.some((message) => message.id === entry));
      const failedIds: string[] = [];

      for (const messageEntry of messagesToDelete) {
        if (!messageEntry.externalMessageId?.trim()) {
          skippedIds.push(messageEntry.id);
          continue;
        }

        const metadata = asRecord(messageEntry.metadataJson);
        const participantJid =
          metadata && typeof metadata.participantJid === "string"
            ? normalizeParticipantJid(metadata.participantJid)
            : null;

        const providerPayload: Record<string, unknown> = {
          id: messageEntry.externalMessageId,
          remoteJid: conversation.externalId,
          fromMe: true
        };

        if (participantJid && conversation.externalId.endsWith("@g.us")) {
          providerPayload.participant = participantJid;
        }

        try {
          await evolutionClient.deleteMessageForEveryone({
            instanceName,
            pathTemplate: env.EVOLUTION_DELETE_FOR_ALL_PATH,
            payload: providerPayload,
            timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
          });
        } catch (error) {
          failedIds.push(messageEntry.id);
          request.log.error(
            {
              messageId: messageEntry.id,
              conversationId: conversation.id,
              error
            },
            "Falha ao apagar mensagem para todos na Evolution"
          );
          continue;
        }

        const correlationId =
          getCorrelationIdFromMetadata(messageEntry.metadataJson) ??
          deriveMessageCorrelationId(request.correlationId, messageEntry.id);

        const updated = await prisma.message.update({
          where: {
            id: messageEntry.id
          },
          data: {
            messageType: MessageType.TEXT,
            content: "Esta mensagem foi apagada.",
            mediaUrl: null,
            mediaMimeType: null,
            mediaFileName: null,
            mediaFileSizeBytes: null,
            mediaCaption: null,
            mediaDurationSeconds: null,
            metadataJson: withCorrelationIdMetadata(
              buildDeletedForAllMetadata(messageEntry.metadataJson, {
                userId: request.authUser.sub,
                userName: request.authUser.name
              }, {
                content: messageEntry.content,
                messageType: messageEntry.messageType
              }),
              correlationId
            ) as Prisma.InputJsonValue
          }
        });

        updatedMessages.push(updated);
        updatedIds.push(updated.id);

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(updated) as unknown as Record<string, unknown>),
            correlationId
          }
        });
      }

      return {
        updatedIds,
        skippedIds: [...new Set(skippedIds)],
        failedIds,
        messages: updatedMessages
      };
    });

}
