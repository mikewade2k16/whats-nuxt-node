import {
  ChannelType,
  ConversationStatus,
  MessageDirection
} from "@prisma/client";
import { prisma } from "../../../../db.js";
import type { EvolutionContactMatch } from "../../shared.js";
import { parseIncomingMessage } from "../../shared.js";
import {
  createEvolutionClient,
  extractPhone,
  extractProfilePictureFromApiResponse,
  findContactByRemoteJid,
  isTenantUserDisplayName,
  resolveDirectConversationName
} from "../../contacts.js";
import {
  collectRelatedParticipantRemoteJids,
  extractGroupAvatarFromPayload,
  extractParticipantAvatarFromGroupInfo,
  isWeakDisplayName,
  resolveGroupConversationName,
  sanitizeGroupName
} from "../../groups.js";
import {
  enrichMentionMetadata,
  hasMentionTargets,
  normalizeMentionJid
} from "../../mentions.js";

interface ConversationIdentityCandidate {
  id: string;
  tenantId: string;
  instanceId: string | null;
  instanceScopeKey: string;
  channel: ChannelType;
  externalId: string;
  contactName: string | null;
  contactId: string | null;
  contactPhone: string | null;
  contactAvatarUrl: string | null;
  assignedToId: string | null;
  status: ConversationStatus;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    messages: number;
  };
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

function buildDirectExternalId(phone: string | null | undefined) {
  const normalizedPhone = normalizeDirectPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  return `${normalizedPhone}@s.whatsapp.net`;
}

function buildDirectConversationAliases(params: {
  parsedRemoteJid: string;
  directExternalId: string | null;
  directPhone: string | null;
}) {
  const aliases = new Set<string>();
  aliases.add(params.parsedRemoteJid);

  if (params.directExternalId) {
    aliases.add(params.directExternalId);
  }

  if (params.directPhone) {
    aliases.add(`${params.directPhone}@s.whatsapp.net`);
    aliases.add(`${params.directPhone}@lid`);
  }

  return [...aliases];
}

function compareConversationCandidates(
  left: ConversationIdentityCandidate,
  right: ConversationIdentityCandidate,
  preferredExternalId: string | null
) {
  const leftPreferred = preferredExternalId && left.externalId === preferredExternalId ? 1 : 0;
  const rightPreferred = preferredExternalId && right.externalId === preferredExternalId ? 1 : 0;
  if (leftPreferred !== rightPreferred) {
    return rightPreferred - leftPreferred;
  }

  const leftHasMessages = left._count.messages > 0 ? 1 : 0;
  const rightHasMessages = right._count.messages > 0 ? 1 : 0;
  if (leftHasMessages !== rightHasMessages) {
    return rightHasMessages - leftHasMessages;
  }

  const leftIsPhoneJid = left.externalId.endsWith("@s.whatsapp.net") ? 1 : 0;
  const rightIsPhoneJid = right.externalId.endsWith("@s.whatsapp.net") ? 1 : 0;
  if (leftIsPhoneJid !== rightIsPhoneJid) {
    return rightIsPhoneJid - leftIsPhoneJid;
  }

  if (left.lastMessageAt.getTime() !== right.lastMessageAt.getTime()) {
    return right.lastMessageAt.getTime() - left.lastMessageAt.getTime();
  }

  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt.getTime() - right.createdAt.getTime();
  }

  return left.id.localeCompare(right.id);
}

interface ResolveMessageUpsertContextParams {
  tenant: {
    id: string;
    evolutionApiKey: string | null;
  };
  instanceId: string | null;
  instanceName: string;
  parsed: ReturnType<typeof parseIncomingMessage> & {
    remoteJid: string;
  };
}

export async function resolveMessageUpsertContext(params: ResolveMessageUpsertContextParams) {
  const { tenant, instanceId, instanceName, parsed } = params;
  const normalizedParsedRemoteJid = normalizeMentionJid(parsed.remoteJid) ?? parsed.remoteJid;

  const existingConversationByExactExternalId = await prisma.conversation.findUnique({
    where: {
      tenantId_externalId_channel_instanceScopeKey: {
        tenantId: tenant.id,
        externalId: normalizedParsedRemoteJid,
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: instanceName
      }
    }
  });

  const evolutionClient = createEvolutionClient(tenant.evolutionApiKey);
  let groupInfo: Record<string, unknown> | null = null;
  if (parsed.isGroup) {
    const shouldFetchGroupInfo =
      !sanitizeGroupName(parsed.groupName) ||
      !parsed.groupAvatarUrl ||
      !parsed.senderAvatarUrl ||
      hasMentionTargets(parsed.metadataJson);

    if (shouldFetchGroupInfo && evolutionClient) {
      try {
        groupInfo = await evolutionClient.findGroupInfo(instanceName, parsed.remoteJid);
      } catch {
        groupInfo = null;
      }
    }
  }

  let participantContact: EvolutionContactMatch | null = null;
  if (parsed.isGroup && parsed.participantJid && evolutionClient) {
    const remoteJidCandidates = new Set<string>();

    const normalizedParticipantJid = normalizeMentionJid(parsed.participantJid);
    if (normalizedParticipantJid) {
      remoteJidCandidates.add(normalizedParticipantJid);
    }

    const participantDigits = extractPhone(parsed.participantJid);
    if (participantDigits) {
      remoteJidCandidates.add(`${participantDigits}@s.whatsapp.net`);
    }

    if (groupInfo) {
      for (const relatedJid of collectRelatedParticipantRemoteJids(groupInfo, parsed.participantJid)) {
        remoteJidCandidates.add(relatedJid);
      }
    }

    participantContact = await findContactByRemoteJid(
      evolutionClient,
      instanceName,
      [...remoteJidCandidates]
    );
  }

  let directContact: EvolutionContactMatch | null = null;
  const shouldFetchDirectContact =
    !parsed.isGroup &&
    Boolean(evolutionClient) &&
    (
      !parsed.senderAvatarUrl ||
      !parsed.senderName ||
      isWeakDisplayName(parsed.senderName) ||
      !existingConversationByExactExternalId?.contactAvatarUrl
    );

  if (shouldFetchDirectContact && evolutionClient) {
    const remoteJidCandidates = new Set<string>();
    const normalizedRemoteJid = normalizeMentionJid(normalizedParsedRemoteJid);
    if (normalizedRemoteJid) {
      remoteJidCandidates.add(normalizedRemoteJid);
    }

    const remoteDigits = extractPhone(normalizedParsedRemoteJid);
    if (remoteDigits) {
      remoteJidCandidates.add(`${remoteDigits}@s.whatsapp.net`);
      remoteJidCandidates.add(`${remoteDigits}@lid`);
    }

    if (remoteJidCandidates.size > 0) {
      directContact = await findContactByRemoteJid(
        evolutionClient,
        instanceName,
        [...remoteJidCandidates]
      );
    }
  }

  const directPhoneFromContact = normalizeDirectPhone(
    directContact?.phone ??
    directContact?.remoteJid ??
    null
  );
  const directPhoneFromParsed = normalizeDirectPhone(normalizedParsedRemoteJid);
  let resolvedDirectPhone = parsed.isGroup
    ? null
    : normalizeDirectPhone(
      directContact?.phone ??
      directPhoneFromContact ??
      existingConversationByExactExternalId?.contactPhone ??
      directPhoneFromParsed
    );
  let directExternalId = parsed.isGroup ? null : buildDirectExternalId(resolvedDirectPhone);
  const directAliases = !parsed.isGroup
    ? buildDirectConversationAliases({
      parsedRemoteJid: normalizedParsedRemoteJid,
      directExternalId,
      directPhone: resolvedDirectPhone
    })
    : [];

  let existingConversation: (typeof existingConversationByExactExternalId) | null = existingConversationByExactExternalId;
  if (!parsed.isGroup) {
    const directConversationCandidates = await prisma.conversation.findMany({
      where: {
        tenantId: tenant.id,
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: instanceName,
        OR: [
          {
            externalId: {
              in: directAliases
            }
          },
          ...(resolvedDirectPhone
            ? [
              {
                contactPhone: resolvedDirectPhone
              }
            ]
            : [])
        ]
      },
      include: {
        _count: {
          select: {
            messages: true
          }
        }
      }
    }) as ConversationIdentityCandidate[];

    if (directConversationCandidates.length > 0) {
      existingConversation = [...directConversationCandidates].sort((left, right) =>
        compareConversationCandidates(left, right, directExternalId)
      )[0];
    }

    if (!resolvedDirectPhone) {
      resolvedDirectPhone = normalizeDirectPhone(
        existingConversation?.contactPhone ??
        existingConversation?.externalId ??
        normalizedParsedRemoteJid
      );
      directExternalId = buildDirectExternalId(resolvedDirectPhone);
    }
  }

  const conversationExternalId = parsed.isGroup
    ? normalizedParsedRemoteJid
    : directExternalId ?? normalizedParsedRemoteJid;

  let directProfilePictureUrl: string | null = null;
  if (!parsed.isGroup && !parsed.senderAvatarUrl && !existingConversation?.contactAvatarUrl && !directContact?.avatarUrl) {
    const number = resolvedDirectPhone ?? extractPhone(normalizedParsedRemoteJid);
    if (evolutionClient && number) {
      try {
        const profile = await evolutionClient.fetchProfilePictureUrl(instanceName, number);
        directProfilePictureUrl = extractProfilePictureFromApiResponse(profile);
      } catch {
        directProfilePictureUrl = null;
      }
    }
  }

  const messageMetadataJson = enrichMentionMetadata(parsed.metadataJson, {
    isGroup: parsed.isGroup,
    groupInfo
  });

  const senderName = parsed.fromMe
    ? parsed.senderName
    : parsed.isGroup
      ? (
        isWeakDisplayName(parsed.senderName)
          ? (participantContact?.name ?? extractPhone(parsed.participantJid ?? "")) ||
            extractPhone(parsed.senderName ?? "") ||
            "Participante"
          : parsed.senderName
      )
      : (
        isWeakDisplayName(parsed.senderName)
          ? directContact?.name ??
            (
              existingConversation?.contactName && !isWeakDisplayName(existingConversation.contactName)
                ? existingConversation.contactName
                : null
            ) ??
            parsed.senderName ??
            extractPhone(parsed.remoteJid) ??
            "Contato"
          : parsed.senderName
      );

  const incomingLooksLikeTenantUser = !parsed.isGroup && !parsed.fromMe
    ? await isTenantUserDisplayName(tenant.id, parsed.senderName)
    : false;

  const conversationName = parsed.isGroup
    ? await resolveGroupConversationName({
      incomingGroupName: parsed.groupName,
      existingConversationName: existingConversation?.contactName ?? null,
      remoteJid: parsed.remoteJid,
      groupInfo,
      senderName,
      participantJid: parsed.participantJid
    })
    : resolveDirectConversationName({
      fromMe: parsed.fromMe,
      senderName: parsed.senderName,
      existingConversationName: existingConversation?.contactName ?? null,
      existingConversationPhone: existingConversation?.contactPhone ?? null,
      remoteJid: parsed.remoteJid,
      incomingLooksLikeTenantUser
    });

  const existingConversationAvatarUrl = existingConversation?.contactAvatarUrl?.trim() || null;
  const directContactAvatarUrl = directContact?.avatarUrl?.trim() || null;
  const parsedSenderAvatarUrl = parsed.senderAvatarUrl?.trim() || null;
  const parsedGroupAvatarUrl = parsed.groupAvatarUrl?.trim() || null;
  const groupInfoAvatarUrl = groupInfo ? extractGroupAvatarFromPayload(groupInfo)?.trim() || null : null;

  const conversationAvatarUrl = parsed.isGroup
    ? parsedGroupAvatarUrl ??
      groupInfoAvatarUrl ??
      existingConversationAvatarUrl
    : parsed.fromMe
      ? existingConversationAvatarUrl ??
        directContactAvatarUrl ??
        directProfilePictureUrl ??
        null
      : parsedSenderAvatarUrl ??
        directContactAvatarUrl ??
        directProfilePictureUrl ??
        existingConversationAvatarUrl ??
        null;

  let senderAvatarUrl = parsedSenderAvatarUrl ??
    (parsed.isGroup
      ? extractParticipantAvatarFromGroupInfo(groupInfo, parsed.participantJid) ??
        participantContact?.avatarUrl ??
        null
      : null);

  const nextPhone = parsed.isGroup
    ? existingConversation?.contactPhone ?? null
    : (
      (resolvedDirectPhone ?? extractPhone(normalizedParsedRemoteJid)) ||
      existingConversation?.contactPhone ||
      null
    );

  const shouldPromoteConversationExternalId =
    !parsed.isGroup &&
    existingConversation !== null &&
    conversationExternalId.endsWith("@s.whatsapp.net") &&
    existingConversation.externalId !== conversationExternalId;

  let canPromoteConversationExternalId = false;
  if (shouldPromoteConversationExternalId && existingConversation) {
    const conflictingConversation = await prisma.conversation.findFirst({
      where: {
        tenantId: tenant.id,
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: instanceName,
        externalId: conversationExternalId,
        id: {
          not: existingConversation.id
        }
      },
      select: {
        id: true
      }
    });
    canPromoteConversationExternalId = !conflictingConversation;
  }

  const conversation = existingConversation
    ? await prisma.conversation.update({
      where: { id: existingConversation.id },
      data: {
        instanceId: instanceId ?? existingConversation.instanceId ?? null,
        instanceScopeKey: instanceName,
        ...(canPromoteConversationExternalId
          ? {
            externalId: conversationExternalId
          }
          : {}),
        contactName: conversationName,
        contactAvatarUrl: conversationAvatarUrl,
        contactPhone: nextPhone
      }
    })
    : await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        instanceId,
        instanceScopeKey: instanceName,
        channel: ChannelType.WHATSAPP,
        externalId: conversationExternalId,
        contactName: conversationName,
        contactAvatarUrl: conversationAvatarUrl,
        contactPhone: nextPhone,
        status: ConversationStatus.OPEN,
        lastMessageAt: new Date()
      }
    });

  if (!senderAvatarUrl && !parsed.isGroup && !parsed.fromMe) {
    senderAvatarUrl =
      conversationAvatarUrl ??
      directContactAvatarUrl ??
      existingConversationAvatarUrl ??
      directProfilePictureUrl ??
      null;
  }

  if (!senderAvatarUrl && parsed.isGroup && senderName) {
    const lastKnownSenderAvatar = await prisma.message.findFirst({
      where: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        senderName,
        senderAvatarUrl: {
          not: null
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        senderAvatarUrl: true
      }
    });

    senderAvatarUrl = lastKnownSenderAvatar?.senderAvatarUrl ?? null;
  }

  return {
    existingConversation,
    conversation,
    evolutionClient,
    groupInfo,
    participantContact,
    messageMetadataJson,
    senderName,
    senderAvatarUrl
  };
}
