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

interface ResolveMessageUpsertContextParams {
  tenant: {
    id: string;
    evolutionApiKey: string | null;
  };
  instanceName: string;
  parsed: ReturnType<typeof parseIncomingMessage> & {
    remoteJid: string;
  };
}

export async function resolveMessageUpsertContext(params: ResolveMessageUpsertContextParams) {
  const { tenant, instanceName, parsed } = params;

  const existingConversation = await prisma.conversation.findUnique({
    where: {
      tenantId_externalId_channel: {
        tenantId: tenant.id,
        externalId: parsed.remoteJid,
        channel: ChannelType.WHATSAPP
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

  let directProfilePictureUrl: string | null = null;
  if (!parsed.isGroup && !parsed.senderAvatarUrl && !existingConversation?.contactAvatarUrl) {
    const number = extractPhone(parsed.remoteJid);
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
      ? (isWeakDisplayName(parsed.senderName) ? participantContact?.name ?? parsed.senderName : parsed.senderName)
      : parsed.senderName;

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

  const conversationAvatarUrl = parsed.isGroup
    ? parsed.groupAvatarUrl ??
      existingConversation?.contactAvatarUrl ??
      (groupInfo ? extractGroupAvatarFromPayload(groupInfo) : null)
    : parsed.fromMe
      ? existingConversation?.contactAvatarUrl ?? directProfilePictureUrl ?? null
      : parsed.senderAvatarUrl ??
        directProfilePictureUrl ??
        existingConversation?.contactAvatarUrl ??
        null;

  let senderAvatarUrl = parsed.senderAvatarUrl ??
    (parsed.isGroup ? extractParticipantAvatarFromGroupInfo(groupInfo, parsed.participantJid) : null) ??
    (parsed.isGroup ? participantContact?.avatarUrl ?? null : null);

  const nextPhone = parsed.isGroup
    ? existingConversation?.contactPhone ?? null
    : extractPhone(parsed.remoteJid);

  const conversation = existingConversation
    ? await prisma.conversation.update({
      where: { id: existingConversation.id },
      data: {
        contactName: conversationName,
        contactAvatarUrl: conversationAvatarUrl,
        contactPhone: nextPhone
      }
    })
    : await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        channel: ChannelType.WHATSAPP,
        externalId: parsed.remoteJid,
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
      existingConversation?.contactAvatarUrl ??
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
