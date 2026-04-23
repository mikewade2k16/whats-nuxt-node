import { ChannelType, ConversationStatus, type Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { requireConversationWrite } from "../../lib/guards.js";
import { EvolutionApiError } from "../../services/evolution-client.js";
import { getTenantRuntimeOrFail } from "../../services/tenant-runtime.js";
import { normalizeConnectionState } from "../tenant/helpers.js";
import { asRecord } from "./object-utils.js";
import { createEvolutionClientForTenant, extractPhone, normalizeAvatarUrl } from "./participants.js";
import { resolveConversationAccessScope } from "./access.js";
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";

const syncOpenConversationsSchema = z.object({
  instanceId: z.string().min(1).optional(),
  limitConversations: z.coerce.number().int().min(1).max(400).default(120),
  includeGroups: z.boolean().default(true)
});

interface ParsedChatCandidate {
  remoteJid: string;
  isGroup: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactAvatarUrl: string | null;
  lastMessageAt: Date | null;
}

async function buildNoopSyncOpenResponse(params: {
  tenantId: string;
  instanceName: string;
  message?: string;
  degraded?: boolean;
}) {
  const totalConversationsAfterSync = await prisma.conversation.count({
    where: {
      tenantId: params.tenantId,
      channel: ChannelType.WHATSAPP
    }
  });

  return {
    instanceName: params.instanceName,
    fetchedChatsCount: 0,
    selectedChatsCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    totalConversationsAfterSync,
    message: params.message,
    degraded: params.degraded ?? false
  };
}

function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }

  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
}

function parseFindChatsResponse(payload: unknown) {
  const root = asRecord(payload);
  const rootData = asRecord(root?.data);
  const rootChats = asRecord(root?.chats);
  const rootDataChats = asRecord(rootData?.chats);

  const candidates: unknown[] = [
    payload,
    root?.value,
    root?.records,
    root?.chats,
    rootChats?.records,
    rootData?.value,
    rootData?.records,
    rootData?.chats,
    rootDataChats?.records
  ];

  for (const candidate of candidates) {
    const records = toRecordArray(candidate);
    if (records.length > 0) {
      return records;
    }
  }

  return [] as Record<string, unknown>[];
}

function normalizeRemoteJid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }

  return trimmed
    .replace(/:\d+(?=@)/, "")
    .replace(/@c\.us$/, "@s.whatsapp.net");
}

function normalizeDirectPhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const digits = extractPhone(value);
  if (digits.length < 10 || digits.length > 20) {
    return null;
  }

  return digits;
}

function buildDirectCanonicalExternalId(phone: string | null | undefined) {
  const normalized = normalizeDirectPhone(phone);
  if (!normalized) {
    return null;
  }

  return `${normalized}@s.whatsapp.net`;
}

function buildDirectLegacyExternalId(phone: string | null | undefined) {
  const normalized = normalizeDirectPhone(phone);
  if (!normalized) {
    return null;
  }

  return `${normalized}@lid`;
}

function parseDateFromValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value > 1_000_000_000 ? value * 1_000 : 0;
    if (millis > 0) {
      const date = new Date(millis);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const millis = asNumber > 1_000_000_000_000 ? asNumber : asNumber > 1_000_000_000 ? asNumber * 1_000 : 0;
      if (millis > 0) {
        const numericDate = new Date(millis);
        if (!Number.isNaN(numericDate.getTime())) {
          return numericDate;
        }
      }
    }

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function pickFirstString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function isTechnicalName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return true;
  }

  if (
    trimmed.endsWith("@s.whatsapp.net") ||
    trimmed.endsWith("@g.us") ||
    trimmed.endsWith("@lid")
  ) {
    return true;
  }

  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && !/[a-zA-Z\u00C0-\u024F]/.test(trimmed);
}

function resolveConversationName(payload: {
  rawName: string | null;
  isGroup: boolean;
  contactPhone: string | null;
  remoteJid: string;
}) {
  const normalizedName = payload.rawName?.trim() ?? "";
  if (normalizedName && !isTechnicalName(normalizedName)) {
    return normalizedName;
  }

  if (!payload.isGroup && payload.contactPhone) {
    return payload.contactPhone;
  }

  if (payload.isGroup) {
    return `Grupo ${payload.remoteJid.replace(/@g\.us$/, "")}`;
  }

  return null;
}

function parseChatCandidate(record: Record<string, unknown>): ParsedChatCandidate | null {
  const lastMessage = asRecord(record.lastMessage);
  const lastMessageKey = asRecord(lastMessage?.key);
  const jidCandidatesRaw = [
    pickFirstString(record, ["remoteJidAlt", "remoteJid", "jid", "chatId", "id"]),
    pickFirstString(lastMessageKey, ["remoteJidAlt", "remoteJid"]),
    pickFirstString(lastMessage, ["remoteJidAlt", "remoteJid"])
  ]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => normalizeRemoteJid(entry))
    .filter((entry): entry is string => Boolean(entry));

  const groupJid = jidCandidatesRaw.find((entry) => entry.endsWith("@g.us"));
  const directPhoneJid = jidCandidatesRaw.find((entry) => entry.endsWith("@s.whatsapp.net"));
  const directLidJid = jidCandidatesRaw.find((entry) => entry.endsWith("@lid"));
  const rawRemoteJid = groupJid ?? directPhoneJid ?? directLidJid ?? jidCandidatesRaw[0] ?? null;
  if (!rawRemoteJid) {
    return null;
  }

  const isGroup = rawRemoteJid.endsWith("@g.us");
  const normalizedDirectPhone = isGroup
    ? null
    : normalizeDirectPhone(
      pickFirstString(record, ["phone", "phoneNumber", "number"]) ??
      rawRemoteJid
    );
  const contactPhone = isGroup
    ? null
    : ((normalizedDirectPhone ?? extractPhone(rawRemoteJid)) || null);
  const remoteJid = isGroup
    ? rawRemoteJid
    : buildDirectCanonicalExternalId(contactPhone) ?? rawRemoteJid;
  const rawName = pickFirstString(record, [
    "pushName",
    "name",
    "subject",
    "fullName",
    "shortName",
    "verifiedName",
    "notify",
    "profileName"
  ]);
  const contactName = resolveConversationName({
    rawName,
    isGroup,
    contactPhone,
    remoteJid
  });
  const contactAvatarUrl = normalizeAvatarUrl(
    pickFirstString(record, [
      "profilePicUrl",
      "profilePictureUrl",
      "avatarUrl",
      "pictureUrl",
      "imageUrl",
      "imgUrl",
      "photoUrl"
    ])
  );

  const lastMessageUpdatedAt = parseDateFromValue(lastMessage?.messageTimestamp);
  const updatedAt =
    parseDateFromValue(record.updatedAt) ??
    lastMessageUpdatedAt ??
    null;

  return {
    remoteJid,
    isGroup,
    contactName,
    contactPhone,
    contactAvatarUrl,
    lastMessageAt: updatedAt
  };
}

function shouldPromoteConversationName(currentName: string | null, incomingName: string | null, isGroup: boolean) {
  const normalizedIncoming = incomingName?.trim() ?? "";
  if (!normalizedIncoming) {
    return false;
  }

  const normalizedCurrent = currentName?.trim() ?? "";
  if (!normalizedCurrent) {
    return true;
  }

  if (isGroup) {
    return normalizedIncoming !== normalizedCurrent;
  }

  return isTechnicalName(normalizedCurrent) && !isTechnicalName(normalizedIncoming);
}

function normalizeAvatarSignature(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    const [path] = trimmed.split("?");
    return path?.trim().toLowerCase() || null;
  }
}

type ExistingConversationForSync = {
  id: string;
  instanceId: string | null;
  instanceScopeKey: string;
  externalId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactAvatarUrl: string | null;
  lastMessageAt: Date;
};

function pickPreferredExistingConversation(
  current: ExistingConversationForSync | undefined,
  candidate: ExistingConversationForSync
) {
  if (!current) {
    return candidate;
  }

  const currentCanonical = current.externalId.endsWith("@s.whatsapp.net") ? 1 : 0;
  const candidateCanonical = candidate.externalId.endsWith("@s.whatsapp.net") ? 1 : 0;
  if (currentCanonical !== candidateCanonical) {
    return candidateCanonical > currentCanonical ? candidate : current;
  }

  const currentTs = current.lastMessageAt.getTime();
  const candidateTs = candidate.lastMessageAt.getTime();
  if (currentTs !== candidateTs) {
    return candidateTs > currentTs ? candidate : current;
  }

  return candidate.id.localeCompare(current.id) < 0 ? candidate : current;
}

export function registerConversationSyncOpenWhatsAppRoute(protectedApp: FastifyInstance) {
  protectedApp.post("/conversations/sync-open", async (request, reply) => {
    if (!requireConversationWrite(request, reply)) {
      return;
    }
    const accessScope = await resolveConversationAccessScope(request);

    const parsed = syncOpenConversationsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantRuntimeOrFail(request.authUser.tenantId, {
      accessToken: request.coreAccessToken
    });

    const selectedInstance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: parsed.data.instanceId,
      includeInactive: true
    });
    const instanceName =
      selectedInstance?.instanceName ||
      tenant.whatsappInstance?.trim() ||
      env.EVOLUTION_DEFAULT_INSTANCE?.trim() ||
      "";
    if (!instanceName) {
      return buildNoopSyncOpenResponse({
        tenantId: tenant.id,
        instanceName: "",
        message: "Nenhuma instancia WhatsApp selecionada para sincronizar."
      });
    }

    if (
      accessScope.hasMultipleActiveInstances &&
      !accessScope.isTenantAdmin &&
      !accessScope.accessibleScopeKeys.includes(instanceName)
    ) {
      return reply.code(403).send({
        message: "Usuario sem acesso a esta instancia WhatsApp."
      });
    }

    const client = createEvolutionClientForTenant(tenant.evolutionApiKey);
    if (!client) {
      return buildNoopSyncOpenResponse({
        tenantId: tenant.id,
        instanceName,
        message: "Evolution API nao configurada para este tenant.",
        degraded: true
      });
    }

    try {
      let connectionStatePayload: Record<string, unknown>;
      try {
        connectionStatePayload = await client.getConnectionState(instanceName);
      } catch (error) {
        if (error instanceof EvolutionApiError && error.statusCode === 404) {
          return buildNoopSyncOpenResponse({
            tenantId: tenant.id,
            instanceName,
            message: "Instancia ainda nao encontrada na Evolution.",
            degraded: true
          });
        }

        throw error;
      }

      const normalizedState = normalizeConnectionState(connectionStatePayload);
      if (normalizedState !== "open" && normalizedState !== "connected") {
        return buildNoopSyncOpenResponse({
          tenantId: tenant.id,
          instanceName,
          message: "Instancia sem sessao ativa para sincronizar conversas.",
          degraded: true
        });
      }

      const chatsPayload = await client.findChats(instanceName, {
        page: 1,
        offset: parsed.data.limitConversations
      });
      const chatRecords = parseFindChatsResponse(chatsPayload);
      const parsedCandidates = chatRecords
        .map(parseChatCandidate)
        .filter((entry): entry is ParsedChatCandidate => Boolean(entry));

      const dedupedByRemoteJid = new Map<string, ParsedChatCandidate>();
      for (const candidate of parsedCandidates) {
        if (!parsed.data.includeGroups && candidate.isGroup) {
          continue;
        }

        const current = dedupedByRemoteJid.get(candidate.remoteJid);
        const currentTs = current?.lastMessageAt?.getTime() ?? 0;
        const candidateTs = candidate.lastMessageAt?.getTime() ?? 0;
        if (!current || candidateTs > currentTs) {
          dedupedByRemoteJid.set(candidate.remoteJid, candidate);
        }
      }

      const selectedCandidates = [...dedupedByRemoteJid.values()]
        .sort((left, right) => {
          const leftTs = left.lastMessageAt?.getTime() ?? 0;
          const rightTs = right.lastMessageAt?.getTime() ?? 0;
          return rightTs - leftTs;
        })
        .slice(0, parsed.data.limitConversations);

      const externalIds = selectedCandidates.map((entry) => entry.remoteJid);
      const directPhones = [...new Set(
        selectedCandidates
          .filter((entry) => !entry.isGroup)
          .map((entry) => entry.contactPhone)
          .filter((entry): entry is string => Boolean(entry))
      )];
      const legacyDirectExternalIds = directPhones
        .map((phone) => buildDirectLegacyExternalId(phone))
        .filter((entry): entry is string => Boolean(entry));

      const existingConversations =
        externalIds.length > 0 || directPhones.length > 0 || legacyDirectExternalIds.length > 0
          ? await prisma.conversation.findMany({
              where: {
                tenantId: tenant.id,
                channel: ChannelType.WHATSAPP,
                instanceScopeKey: instanceName,
                OR: [
                  ...(externalIds.length > 0
                    ? [
                        {
                          externalId: {
                            in: externalIds
                          }
                        }
                      ]
                    : []),
                  ...(legacyDirectExternalIds.length > 0
                    ? [
                        {
                          externalId: {
                            in: legacyDirectExternalIds
                          }
                        }
                      ]
                    : []),
                  ...(directPhones.length > 0
                    ? [
                        {
                          contactPhone: {
                            in: directPhones
                          }
                        }
                      ]
                    : [])
                ]
              },
              select: {
                id: true,
                instanceId: true,
                instanceScopeKey: true,
                externalId: true,
                contactName: true,
                contactPhone: true,
                contactAvatarUrl: true,
                lastMessageAt: true
              }
            })
          : [];

      const existingByExternalId = new Map<string, ExistingConversationForSync>();
      const existingByDirectPhone = new Map<string, ExistingConversationForSync>();
      for (const entry of existingConversations) {
        existingByExternalId.set(entry.externalId, entry);
        const phoneKey = normalizeDirectPhone(entry.contactPhone ?? entry.externalId);
        if (!phoneKey) {
          continue;
        }

        const current = existingByDirectPhone.get(phoneKey);
        existingByDirectPhone.set(
          phoneKey,
          pickPreferredExistingConversation(current, entry)
        );
      }

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const candidate of selectedCandidates) {
        const candidatePhoneKey = normalizeDirectPhone(candidate.contactPhone ?? candidate.remoteJid);
        const candidateLegacyExternalId = buildDirectLegacyExternalId(candidatePhoneKey);
        let existing = existingByExternalId.get(candidate.remoteJid) ??
          (
            candidatePhoneKey
              ? existingByDirectPhone.get(candidatePhoneKey)
            : undefined
          ) ??
          (
            candidateLegacyExternalId
              ? existingByExternalId.get(candidateLegacyExternalId)
              : undefined
          );

        if (
          !existing &&
          !candidate.isGroup &&
          candidate.contactName &&
          !isTechnicalName(candidate.contactName)
        ) {
          const avatarSignature = normalizeAvatarSignature(candidate.contactAvatarUrl);
          if (avatarSignature) {
            const shadowAnchorConversation = await prisma.conversation.findFirst({
              where: {
                tenantId: tenant.id,
                channel: ChannelType.WHATSAPP,
                externalId: {
                  not: candidate.remoteJid
                },
                contactName: candidate.contactName,
                contactAvatarUrl: {
                  startsWith: avatarSignature
                },
                messages: {
                  some: {}
                }
              },
              orderBy: {
                lastMessageAt: "desc"
              },
              select: {
                id: true,
                instanceId: true,
                instanceScopeKey: true,
                externalId: true,
                contactName: true,
                contactPhone: true,
                contactAvatarUrl: true,
                lastMessageAt: true
              }
            });

            if (shadowAnchorConversation) {
              existing = shadowAnchorConversation;
              existingByExternalId.set(shadowAnchorConversation.externalId, shadowAnchorConversation);
              const shadowPhoneKey = normalizeDirectPhone(
                shadowAnchorConversation.contactPhone ?? shadowAnchorConversation.externalId
              );
              if (shadowPhoneKey) {
                const current = existingByDirectPhone.get(shadowPhoneKey);
                existingByDirectPhone.set(
                  shadowPhoneKey,
                  pickPreferredExistingConversation(current, shadowAnchorConversation)
                );
              }
            }
          }
        }

        if (!existing) {
          const createdConversation = await prisma.conversation.create({
            data: {
              tenantId: tenant.id,
              instanceId: selectedInstance?.id ?? null,
              instanceScopeKey: instanceName,
              channel: ChannelType.WHATSAPP,
              status: ConversationStatus.OPEN,
              externalId: candidate.remoteJid,
              contactName: candidate.contactName,
              contactPhone: candidate.contactPhone,
              contactAvatarUrl: candidate.contactAvatarUrl,
              ...(candidate.lastMessageAt
                ? {
                    lastMessageAt: candidate.lastMessageAt
                  }
                : {})
            }
          });
          existingByExternalId.set(createdConversation.externalId, createdConversation);
          if (candidatePhoneKey) {
            const current = existingByDirectPhone.get(candidatePhoneKey);
            existingByDirectPhone.set(
              candidatePhoneKey,
              pickPreferredExistingConversation(current, createdConversation)
            );
          }
          createdCount += 1;
          continue;
        }

        const updateData: Prisma.ConversationUpdateInput = {};
        if (!existing.instanceId && selectedInstance?.id) {
          updateData.instance = {
            connect: {
              id: selectedInstance.id
            }
          };
        }
        if (existing.instanceScopeKey !== instanceName) {
          updateData.instanceScopeKey = instanceName;
        }
        const canPromoteExternalId =
          !candidate.isGroup &&
          candidate.remoteJid.endsWith("@s.whatsapp.net") &&
          existing.externalId !== candidate.remoteJid &&
          !existingByExternalId.has(candidate.remoteJid);
        if (canPromoteExternalId) {
          updateData.externalId = candidate.remoteJid;
        }

        if (candidate.lastMessageAt && candidate.lastMessageAt > existing.lastMessageAt) {
          updateData.lastMessageAt = candidate.lastMessageAt;
        }

        if (
          shouldPromoteConversationName(existing.contactName, candidate.contactName, candidate.isGroup) &&
          candidate.contactName
        ) {
          updateData.contactName = candidate.contactName;
        }

        if (
          candidate.contactPhone &&
          candidate.contactPhone !== existing.contactPhone &&
          (!existing.contactPhone || candidate.contactPhone.length >= existing.contactPhone.length)
        ) {
          updateData.contactPhone = candidate.contactPhone;
        }

        if (
          candidate.contactAvatarUrl &&
          candidate.contactAvatarUrl !== existing.contactAvatarUrl &&
          (!existing.contactAvatarUrl || candidate.isGroup)
        ) {
          updateData.contactAvatarUrl = candidate.contactAvatarUrl;
        }

        if (Object.keys(updateData).length < 1) {
          skippedCount += 1;
          continue;
        }

        await prisma.conversation.update({
          where: {
            id: existing.id
          },
          data: updateData
        });

        if (typeof updateData.externalId === "string" && updateData.externalId !== existing.externalId) {
          existingByExternalId.delete(existing.externalId);
          existingByExternalId.set(updateData.externalId, {
            ...existing,
            externalId: updateData.externalId
          });
        }

        if (candidatePhoneKey) {
          const current = existingByDirectPhone.get(candidatePhoneKey);
          existingByDirectPhone.set(
            candidatePhoneKey,
            pickPreferredExistingConversation(current, {
              ...existing,
              externalId: typeof updateData.externalId === "string" ? updateData.externalId : existing.externalId,
              contactPhone: typeof updateData.contactPhone === "string" ? updateData.contactPhone : existing.contactPhone,
              contactName: typeof updateData.contactName === "string" ? updateData.contactName : existing.contactName,
              contactAvatarUrl: typeof updateData.contactAvatarUrl === "string"
                ? updateData.contactAvatarUrl
                : existing.contactAvatarUrl,
              lastMessageAt: updateData.lastMessageAt instanceof Date ? updateData.lastMessageAt : existing.lastMessageAt
            })
          );
        }
        updatedCount += 1;
      }

      const totalConversationsAfterSync = await prisma.conversation.count({
        where: {
          tenantId: tenant.id,
          channel: ChannelType.WHATSAPP
        }
      });

      return {
        instanceName,
        fetchedChatsCount: chatRecords.length,
        selectedChatsCount: selectedCandidates.length,
        createdCount,
        updatedCount,
        skippedCount,
        totalConversationsAfterSync
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return buildNoopSyncOpenResponse({
          tenantId: tenant.id,
          instanceName,
          message: error.message,
          degraded: true
        });
      }
      throw error;
    }
  });
}
