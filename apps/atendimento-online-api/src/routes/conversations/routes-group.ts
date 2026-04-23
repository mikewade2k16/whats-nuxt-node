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
import { resolveConversationInstanceRouting } from "../../services/whatsapp-instances.js";
import { getTenantRuntimeOrFail } from "../../services/tenant-runtime.js";

const GROUP_PARTICIPANTS_CACHE_TTL_MS = 45_000;
const groupParticipantsCache = new Map<string, { cachedAt: number; participants: GroupParticipantResponse[] }>();

export function registerConversationGroupRoutes(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/:conversationId/group-participants", async (request, reply) => {
      const accessScope = await resolveConversationAccessScope(request);
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
          enrich: z.coerce.boolean().default(false)
        })
        .safeParse(request.query);

      const enrichParticipants = query.success ? query.data.enrich : false;

      const conversation = await prisma.conversation.findFirst({
        where: mergeConversationScopeWhere(accessScope.conversationWhere, {
          id: params.data.conversationId,
        })
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (conversation.channel !== ChannelType.WHATSAPP || !conversation.externalId.endsWith("@g.us")) {
        return reply.code(400).send({ message: "Conversa nao e um grupo WhatsApp" });
      }

      const cacheKey = `${request.authUser.tenantId}:${conversation.id}`;
      if (!enrichParticipants) {
        const cached = groupParticipantsCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < GROUP_PARTICIPANTS_CACHE_TTL_MS) {
          return {
            conversationId: conversation.id,
            participants: cached.participants
          };
        }
      }

      const participantsMap = new Map<string, GroupParticipantResponse>();

      const recentMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 400,
        select: {
          senderName: true,
          senderAvatarUrl: true,
          metadataJson: true
        }
      });

      for (const messageEntry of recentMessages) {
        const metadata = asRecord(messageEntry.metadataJson);
        const participantJidRaw = metadata && typeof metadata.participantJid === "string"
          ? metadata.participantJid
          : null;

        if (participantJidRaw) {
          mergeParticipantRecord(participantsMap, {
            jid: participantJidRaw,
            name: messageEntry.senderName,
            avatarUrl: messageEntry.senderAvatarUrl
          });
        }

        const mentions = metadata ? asRecord(metadata.mentions) : null;
        const mentioned = mentions && Array.isArray(mentions.mentioned)
          ? mentions.mentioned.filter((entry): entry is string => typeof entry === "string")
          : [];
        const displayByJid = mentions ? asRecord(mentions.displayByJid) : null;

        for (const mentionedJid of mentioned) {
          mergeParticipantRecord(participantsMap, {
            jid: mentionedJid,
            name: displayByJid && typeof displayByJid[mentionedJid] === "string"
              ? String(displayByJid[mentionedJid])
              : null
          });
        }
      }

      const tenant = await getTenantRuntimeOrFail(request.authUser.tenantId, {
        accessToken: request.coreAccessToken
      });

      const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
      const routedInstance = await resolveConversationInstanceRouting({
        tenantId: tenant.id,
        conversation
      });
      const instanceName =
        routedInstance?.instanceName ||
        tenant?.whatsappInstance?.trim() ||
        env.EVOLUTION_DEFAULT_INSTANCE ||
        "default";
      let groupInfo: Record<string, unknown> | null = null;

      if (evolutionClient) {
        try {
          groupInfo = await evolutionClient.findGroupInfo(instanceName, conversation.externalId);
          const apiParticipants = parseGroupParticipantsFromPayload(groupInfo);
          for (const participant of apiParticipants) {
            mergeParticipantRecord(participantsMap, participant);
          }
        } catch {
          // best-effort: fallback to participant list inferred from message history.
        }
      }

      if (evolutionClient && enrichParticipants) {
        const candidatesForEnrichment = [...participantsMap.values()]
          .filter((participant) => {
            return shouldResolveParticipantName(participant) || !participant.avatarUrl;
          })
          .slice(0, 8);

        await Promise.allSettled(
          candidatesForEnrichment.map(async (participant) => {
            const normalizedParticipantJid = normalizeParticipantJid(participant.jid);
            if (!normalizedParticipantJid) {
              return;
            }

            const remoteJidCandidates = new Set<string>();
            if (participant.phone) {
              remoteJidCandidates.add(`${participant.phone}@s.whatsapp.net`);
            }
            remoteJidCandidates.add(normalizedParticipantJid);

            if (groupInfo) {
              for (const relatedJid of collectRelatedRemoteJidsFromGroupInfo(groupInfo, normalizedParticipantJid)) {
                remoteJidCandidates.add(relatedJid);
              }
            }

            if (remoteJidCandidates.size === 0) {
              return;
            }

            const contact = await findContactByRemoteJid(evolutionClient, instanceName, [...remoteJidCandidates]);
            if (!contact) {
              return;
            }

            mergeParticipantRecord(participantsMap, {
              jid: normalizedParticipantJid,
              phone: contact.phone || participant.phone,
              name: contact.name,
              avatarUrl: contact.avatarUrl
            });
          })
        );
      }

      const participants = [...participantsMap.values()]
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));

      if (!enrichParticipants) {
        groupParticipantsCache.set(cacheKey, {
          cachedAt: Date.now(),
          participants
        });
      }

      return {
        conversationId: conversation.id,
        participants
      };
    });

}
