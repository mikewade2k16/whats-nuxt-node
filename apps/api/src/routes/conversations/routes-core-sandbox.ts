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
import { resolveConversationAccessScope } from "./access.js";


export function registerConversationSandboxRoute(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/sandbox/test", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }
      const accessScope = await resolveConversationAccessScope(request);

      if (!env.SANDBOX_ENABLED) {
        return reply.code(400).send({
          message: "Sandbox desativado. Defina SANDBOX_ENABLED=true para usar conversa de teste."
        });
      }
      if (accessScope.activeInstances.length > 0 && accessScope.accessibleInstances.length < 1) {
        return reply.code(403).send({
          message: "Usuario sem instancia WhatsApp atribuida para usar a sandbox."
        });
      }

      const externalId = resolveSandboxTestExternalId();
      const contactPhone = extractPhone(externalId) || null;
      const defaultAccessibleInstance = accessScope.accessibleInstances[0] ?? null;
      const instanceScopeKey = defaultAccessibleInstance?.instanceName ?? accessScope.accessibleScopeKeys[0] ?? "default";

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel_instanceScopeKey: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel: ChannelType.WHATSAPP,
            instanceScopeKey
          }
        },
        update: {
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          instanceId: defaultAccessibleInstance?.id ?? null,
          instanceScopeKey,
          channel: ChannelType.WHATSAPP,
          externalId,
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN
        },
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

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

}
