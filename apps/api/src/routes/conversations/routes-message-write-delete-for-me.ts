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


export function registerConversationDeleteForMeRoute(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/delete-for-me", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }
      const accessScope = await resolveConversationAccessScope(request);

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
        where: mergeConversationScopeWhere(accessScope.conversationWhere, {
          id: params.data.conversationId,
        })
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const messagesToHide = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          id: {
            in: messageIds
          }
        },
        select: {
          id: true
        }
      });

      const hiddenIds = messagesToHide.map((entry) => entry.id);
      const skippedIds = messageIds.filter((entry) => !hiddenIds.includes(entry));

      if (hiddenIds.length > 0) {
        await prisma.hiddenMessageForUser.createMany({
          data: hiddenIds.map((messageId) => ({
            tenantId: request.authUser.tenantId,
            userId: request.authUser.sub,
            messageId
          })),
          skipDuplicates: true
        });
      }

      const lastVisibleMessage = await prisma.message.findFirst({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          mediaUrl: true,
          direction: true,
          status: true,
          createdAt: true
        }
      });

      return {
        deletedIds: hiddenIds,
        skippedIds,
        conversation: buildConversationPreviewPayload({
          conversation,
          lastMessage: lastVisibleMessage
        })
      };
    });

}
