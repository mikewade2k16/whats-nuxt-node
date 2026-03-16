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


export function registerConversationAssignRoute(protectedApp: FastifyInstance) {
    protectedApp.patch("/conversations/:conversationId/assign", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }
      const accessScope = await resolveConversationAccessScope(request);

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = assignConversationSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      if (body.data.assignedToId) {
        const user = await prisma.user.findFirst({
          where: {
            id: body.data.assignedToId,
            tenantId: request.authUser.tenantId
          }
        });
        if (!user) {
          return reply.code(404).send({ message: "Usuario nao encontrado no tenant" });
        }
      }

      const conversation = await prisma.conversation.findFirst({
        where: mergeConversationScopeWhere(accessScope.conversationWhere, {
          id: params.data.conversationId,
        }),
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedToId: body.data.assignedToId },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      if (conversation.assignedToId !== updated.assignedToId) {
        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          eventType: AuditEventType.CONVERSATION_ASSIGNED,
          payloadJson: {
            before: {
              assignedToId: conversation.assignedToId
            },
            after: {
              assignedToId: updated.assignedToId
            },
            changedBy: {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }
          } as Prisma.InputJsonValue
        });
      }

      return payload;
    });

}
