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
import { extractGroupAvatarFromPayload } from "../webhooks/groups-payload.js";
import { mergeConversationScopeWhere, resolveConversationAccessScope } from "./access.js";

const DIRECT_AVATAR_LOOKUP_COOLDOWN_MS = 60_000;
const GROUP_AVATAR_LOOKUP_COOLDOWN_MS = 90_000;
const GROUP_AVATAR_VALIDATION_COOLDOWN_MS = 15 * 60_000;
const listConversationsQuerySchema = z.object({
  instanceId: z.string().min(1).optional()
});
const directAvatarLookupAttemptAtByConversation = new Map<string, number>();
const groupAvatarLookupAttemptAtByConversation = new Map<string, number>();
const groupAvatarValidationAttemptAtByConversation = new Map<string, number>();

export function registerConversationListRoute(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations", async (request, reply) => {
      const parsedQuery = listConversationsQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return reply.code(400).send({
          message: "Query invalida",
          errors: parsedQuery.error.flatten()
        });
      }

      const accessScope = await resolveConversationAccessScope(request);
      const selectedInstance = parsedQuery.data.instanceId
        ? accessScope.accessibleInstances.find((entry) => entry.id === parsedQuery.data.instanceId) ?? null
        : null;

      if (parsedQuery.data.instanceId && !selectedInstance) {
        return reply.code(403).send({ message: "Instancia WhatsApp fora do escopo deste usuario." });
      }

      const conversationWhere = selectedInstance
        ? mergeConversationScopeWhere(accessScope.conversationWhere, {
            instanceId: selectedInstance.id,
            instanceScopeKey: selectedInstance.instanceName
          })
        : accessScope.conversationWhere;
      const conversations = await prisma.conversation.findMany({
        where: conversationWhere,
        orderBy: { lastMessageAt: "desc" },
        include: {
          instance: {
            select: {
              instanceName: true,
              displayName: true
            }
          },
          messages: {
            where: {
              hiddenForUsers: {
                none: {
                  userId: request.authUser.sub
                }
              }
            },
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const conversationsWithoutAvatar = conversations.filter((conversationEntry) => {
        return !conversationEntry.contactAvatarUrl || conversationEntry.contactAvatarUrl.trim().length === 0;
      });

      const missingDirectAvatarConversationIds = conversationsWithoutAvatar
        .filter((conversationEntry) => !conversationEntry.externalId.endsWith("@g.us"))
        .map((conversationEntry) => conversationEntry.id);
      const missingGroupAvatarConversations = conversationsWithoutAvatar
        .filter((conversationEntry) => conversationEntry.externalId.endsWith("@g.us"));

      const resolvedAvatarByConversationId = new Map<string, string>();
      const forcePersistAvatarByConversationId = new Set<string>();

      if (missingDirectAvatarConversationIds.length > 0) {
        const latestMessageAvatars = await prisma.message.findMany({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: {
              in: missingDirectAvatarConversationIds
            },
            direction: MessageDirection.INBOUND,
            senderAvatarUrl: {
              not: null
            }
          },
          orderBy: [
            { conversationId: "asc" },
            { createdAt: "desc" }
          ],
          distinct: ["conversationId"],
          select: {
            conversationId: true,
            senderAvatarUrl: true
          }
        });

        for (const entry of latestMessageAvatars) {
          const avatarUrl = entry.senderAvatarUrl?.trim();
          if (!avatarUrl) {
            continue;
          }

          resolvedAvatarByConversationId.set(entry.conversationId, avatarUrl);
        }
      }

      const unresolvedDirectConversations = conversations
        .filter((conversationEntry) => {
          const hasConversationAvatar = Boolean(conversationEntry.contactAvatarUrl?.trim());
          const hasFallbackAvatar = resolvedAvatarByConversationId.has(conversationEntry.id);
          if (hasConversationAvatar || hasFallbackAvatar) {
            return false;
          }

          return (
            conversationEntry.externalId.endsWith("@s.whatsapp.net") ||
            conversationEntry.externalId.endsWith("@lid")
          );
        })
        .slice(0, 3);
      const unresolvedGroupConversations = missingGroupAvatarConversations
        .filter((conversationEntry) => !resolvedAvatarByConversationId.has(conversationEntry.id))
        .slice(0, 3);
      const groupConversationsWithAvatar = conversations
        .filter((conversationEntry) => {
          if (!conversationEntry.externalId.endsWith("@g.us")) {
            return false;
          }

          const currentAvatar = conversationEntry.contactAvatarUrl?.trim() ?? "";
          if (!currentAvatar) {
            return false;
          }

          return !resolvedAvatarByConversationId.has(conversationEntry.id);
        });
      const latestInboundSenderAvatarByGroupConversationId = new Map<string, string>();
      if (groupConversationsWithAvatar.length > 0) {
        const latestGroupSenderAvatars = await prisma.message.findMany({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: {
              in: groupConversationsWithAvatar.map((conversationEntry) => conversationEntry.id)
            },
            direction: MessageDirection.INBOUND,
            senderAvatarUrl: {
              not: null
            }
          },
          orderBy: [
            { conversationId: "asc" },
            { createdAt: "desc" }
          ],
          distinct: ["conversationId"],
          select: {
            conversationId: true,
            senderAvatarUrl: true
          }
        });

        for (const entry of latestGroupSenderAvatars) {
          const avatarUrl = entry.senderAvatarUrl?.trim() ?? "";
          if (!avatarUrl) {
            continue;
          }

          latestInboundSenderAvatarByGroupConversationId.set(entry.conversationId, avatarUrl);
        }
      }

      const suspiciousGroupAvatarConversationIds = new Set(
        groupConversationsWithAvatar
          .filter((conversationEntry) => {
            const currentAvatar = conversationEntry.contactAvatarUrl?.trim() ?? "";
            if (!currentAvatar) {
              return false;
            }

            const latestInboundSenderAvatar =
              latestInboundSenderAvatarByGroupConversationId.get(conversationEntry.id) ?? "";
            if (!latestInboundSenderAvatar) {
              return false;
            }

            return latestInboundSenderAvatar === currentAvatar;
          })
          .map((conversationEntry) => conversationEntry.id)
      );

      const groupConversationsForAvatarValidation = [
        ...groupConversationsWithAvatar.filter((conversationEntry) =>
          suspiciousGroupAvatarConversationIds.has(conversationEntry.id)
        ),
        ...groupConversationsWithAvatar.filter((conversationEntry) =>
          !suspiciousGroupAvatarConversationIds.has(conversationEntry.id)
        )
      ].slice(0, 4);

      if (
        unresolvedDirectConversations.length > 0 ||
        unresolvedGroupConversations.length > 0 ||
        groupConversationsForAvatarValidation.length > 0
      ) {
        const tenant = await getTenantRuntimeOrFail(request.authUser.tenantId, {
          accessToken: request.coreAccessToken
        });

        const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
        const now = Date.now();

        if (evolutionClient) {
          const candidatesForLookup = unresolvedDirectConversations.filter((conversationEntry) => {
            const lastAttemptAt = directAvatarLookupAttemptAtByConversation.get(conversationEntry.id) ?? 0;
            return now - lastAttemptAt >= DIRECT_AVATAR_LOOKUP_COOLDOWN_MS;
          });

          const directContactLookups = await Promise.allSettled(
            candidatesForLookup.map(async (conversationEntry) => {
              directAvatarLookupAttemptAtByConversation.set(conversationEntry.id, now);

              const remoteJidCandidates = new Set<string>();
              const normalizedRemoteJid = normalizeParticipantJid(conversationEntry.externalId);
              if (normalizedRemoteJid) {
                remoteJidCandidates.add(normalizedRemoteJid);
              }

              const digits = extractPhone(conversationEntry.externalId);
              if (digits) {
                remoteJidCandidates.add(`${digits}@s.whatsapp.net`);
                remoteJidCandidates.add(`${digits}@lid`);
              }

              if (remoteJidCandidates.size < 1) {
                return;
              }

              const instanceName =
                conversationEntry.instance?.instanceName?.trim() ||
                tenant?.whatsappInstance?.trim() ||
                env.EVOLUTION_DEFAULT_INSTANCE ||
                "default";
              const contact = await findContactByRemoteJid(
                evolutionClient,
                instanceName,
                [...remoteJidCandidates]
              );

              const avatarUrl = contact?.avatarUrl?.trim() ?? "";
              if (!avatarUrl) {
                return;
              }

              resolvedAvatarByConversationId.set(conversationEntry.id, avatarUrl);
            })
          );

          for (const result of directContactLookups) {
            if (result.status === "fulfilled") {
              continue;
            }

            // best-effort lookup; ignore per-conversation failures.
          }

          const candidatesForGroupLookup = unresolvedGroupConversations.filter((conversationEntry) => {
            const lastAttemptAt = groupAvatarLookupAttemptAtByConversation.get(conversationEntry.id) ?? 0;
            return now - lastAttemptAt >= GROUP_AVATAR_LOOKUP_COOLDOWN_MS;
          });

          const groupAvatarLookups = await Promise.allSettled(
            candidatesForGroupLookup.map(async (conversationEntry) => {
              groupAvatarLookupAttemptAtByConversation.set(conversationEntry.id, now);
              const instanceName =
                conversationEntry.instance?.instanceName?.trim() ||
                tenant?.whatsappInstance?.trim() ||
                env.EVOLUTION_DEFAULT_INSTANCE ||
                "default";
              const groupInfo = await evolutionClient.findGroupInfo(instanceName, conversationEntry.externalId);
              const avatarUrl = extractGroupAvatarFromPayload(groupInfo)?.trim() ?? "";
              if (!avatarUrl) {
                return;
              }

              resolvedAvatarByConversationId.set(conversationEntry.id, avatarUrl);
            })
          );

          for (const result of groupAvatarLookups) {
            if (result.status === "fulfilled") {
              continue;
            }

            // best-effort lookup; ignore per-conversation failures.
          }

          const candidatesForGroupValidation = groupConversationsForAvatarValidation.filter((conversationEntry) => {
            const lastAttemptAt = groupAvatarValidationAttemptAtByConversation.get(conversationEntry.id) ?? 0;
            return now - lastAttemptAt >= GROUP_AVATAR_VALIDATION_COOLDOWN_MS;
          });

          const groupValidationLookups = await Promise.allSettled(
            candidatesForGroupValidation.map(async (conversationEntry) => {
              groupAvatarValidationAttemptAtByConversation.set(conversationEntry.id, now);
              const instanceName =
                conversationEntry.instance?.instanceName?.trim() ||
                tenant?.whatsappInstance?.trim() ||
                env.EVOLUTION_DEFAULT_INSTANCE ||
                "default";
              const groupInfo = await evolutionClient.findGroupInfo(instanceName, conversationEntry.externalId);
              const avatarUrl = extractGroupAvatarFromPayload(groupInfo)?.trim() ?? "";
              if (!avatarUrl) {
                return;
              }

              const currentAvatar = conversationEntry.contactAvatarUrl?.trim() ?? "";
              if (!currentAvatar || currentAvatar === avatarUrl) {
                return;
              }

              resolvedAvatarByConversationId.set(conversationEntry.id, avatarUrl);
              forcePersistAvatarByConversationId.add(conversationEntry.id);
            })
          );

          for (const result of groupValidationLookups) {
            if (result.status === "fulfilled") {
              continue;
            }

            // best-effort lookup; ignore per-conversation failures.
          }
        }
      }

      if (resolvedAvatarByConversationId.size > 0) {
        void Promise.allSettled(
          [...resolvedAvatarByConversationId.entries()].map(([conversationId, avatarUrl]) => {
            if (forcePersistAvatarByConversationId.has(conversationId)) {
              return prisma.conversation.updateMany({
                where: {
                  id: conversationId,
                  tenantId: request.authUser.tenantId,
                  NOT: {
                    contactAvatarUrl: avatarUrl
                  }
                },
                data: {
                  contactAvatarUrl: avatarUrl
                }
              });
            }

            return prisma.conversation.updateMany({
              where: {
                id: conversationId,
                tenantId: request.authUser.tenantId,
                OR: [
                  { contactAvatarUrl: null },
                  { contactAvatarUrl: "" }
                ]
              },
              data: {
                contactAvatarUrl: avatarUrl
              }
            });
          })
        );
      }

      return conversations.map((conversationEntry) => {
        const mappedConversation = mapConversation(conversationEntry);
        const hasMappedAvatar = Boolean(mappedConversation.contactAvatarUrl?.trim());
        const shouldHideSuspiciousGroupAvatar =
          suspiciousGroupAvatarConversationIds.has(conversationEntry.id) &&
          !resolvedAvatarByConversationId.has(conversationEntry.id);
        if (hasMappedAvatar && !shouldHideSuspiciousGroupAvatar) {
          return mappedConversation;
        }

        const resolvedAvatar = resolvedAvatarByConversationId.get(conversationEntry.id) ?? null;
        if (resolvedAvatar) {
          return {
            ...mappedConversation,
            contactAvatarUrl: resolvedAvatar
          };
        }

        if (shouldHideSuspiciousGroupAvatar) {
          return {
            ...mappedConversation,
            contactAvatarUrl: null
          };
        }

        return mappedConversation;
      });
    });

}
