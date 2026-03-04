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


export function registerConversationMessagesListRoute(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/:conversationId/messages", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const query = z
        .object({
          limit: z.coerce.number().min(1).max(200).default(100),
          beforeId: z.string().min(1).optional()
        })
        .safeParse(request.query);

      const limit = query.success ? query.data.limit : 100;
      const beforeId = query.success ? query.data.beforeId : undefined;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      let beforeMessageCreatedAt: Date | null = null;
      if (beforeId) {
        const beforeMessage = await prisma.message.findFirst({
          where: {
            id: beforeId,
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id
          },
          select: {
            createdAt: true
          }
        });
        beforeMessageCreatedAt = beforeMessage?.createdAt ?? null;
      }

      const messagesDesc = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          },
          ...(beforeMessageCreatedAt
            ? {
                createdAt: {
                  lt: beforeMessageCreatedAt
                }
              }
            : {})
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const messages = [...messagesDesc].reverse();

      let hasMore = false;
      if (messages.length > 0) {
        const oldest = messages[0];
        const older = await prisma.message.findFirst({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            createdAt: {
              lt: oldest.createdAt
            }
          },
          select: { id: true }
        });
        hasMore = Boolean(older);
      }

      return {
        conversationId: conversation.id,
        messages,
        hasMore
      };
    });

}
