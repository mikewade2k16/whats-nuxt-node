import {
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma
} from "@prisma/client";
import { prisma } from "../../../../db.js";
import { MEDIA_MESSAGE_TYPES } from "../../media.js";
import { mergeMetadataJson } from "../../message-json.js";

interface CommonParams {
  tenantId: string;
  conversationId: string;
  externalMessageId: string | null;
  senderAvatarUrl: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaFileSizeBytes: number | null;
  mediaCaption: string | null;
  mediaDurationSeconds: number | null;
  metadataJson: unknown;
}

interface ReconcilePendingOutboundEchoParams extends CommonParams {
  parsedFromMe: boolean;
  messageType: MessageType;
  content: string;
}

export async function findExistingWebhookMessage(params: {
  tenantId: string;
  conversationId: string;
  externalMessageId: string | null;
}) {
  if (!params.externalMessageId) {
    return null;
  }

  return prisma.message.findFirst({
    where: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      externalMessageId: params.externalMessageId
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function reconcilePendingOutboundEcho(params: ReconcilePendingOutboundEchoParams) {
  if (!params.parsedFromMe) {
    return null;
  }

  const normalizedContent = params.content.trim();
  const mediaPlaceholder =
    params.messageType === MessageType.IMAGE ? "[imagem]" :
    params.messageType === MessageType.AUDIO ? "[audio]" :
    params.messageType === MessageType.VIDEO ? "[video]" :
    params.messageType === MessageType.DOCUMENT ? "[documento]" :
    "";
  const shouldUseContentAsMediaFingerprint =
    !params.mediaCaption && normalizedContent.length > 0 && normalizedContent !== mediaPlaceholder;

  const mediaDedupeFilter: Prisma.MessageWhereInput = {
    messageType: {
      in: MEDIA_MESSAGE_TYPES
    },
    ...(params.mediaFileName ? { mediaFileName: params.mediaFileName } : {}),
    ...(params.mediaFileSizeBytes ? { mediaFileSizeBytes: params.mediaFileSizeBytes } : {}),
    ...(params.mediaMimeType ? { mediaMimeType: params.mediaMimeType } : {}),
    ...(params.mediaCaption
      ? {
          OR: [{ mediaCaption: params.mediaCaption }, { content: params.mediaCaption }]
        }
      : {}),
    ...(shouldUseContentAsMediaFingerprint ? { content: normalizedContent } : {})
  };

  const hasStrongMediaFingerprint = Boolean(
    params.mediaFileName ||
    params.mediaFileSizeBytes ||
    params.mediaMimeType ||
    params.mediaCaption ||
    shouldUseContentAsMediaFingerprint
  );

  const dedupeWindowMs = params.messageType === MessageType.TEXT
    ? 90_000
    : hasStrongMediaFingerprint
      ? 90_000
      : 25_000;
  const dedupeWindowStart = new Date(Date.now() - dedupeWindowMs);

  const maybePendingOutbound = await prisma.message.findFirst({
    where: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      direction: MessageDirection.OUTBOUND,
      status: {
        in: [MessageStatus.PENDING, MessageStatus.SENT, MessageStatus.FAILED]
      },
      ...(params.messageType === MessageType.TEXT
        ? {
            messageType: MessageType.TEXT,
            content: params.content
          }
        : mediaDedupeFilter),
      createdAt: {
        gte: dedupeWindowStart
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!maybePendingOutbound) {
    return null;
  }

  return prisma.message.update({
    where: { id: maybePendingOutbound.id },
    data: {
      status: MessageStatus.SENT,
      externalMessageId: params.externalMessageId ?? maybePendingOutbound.externalMessageId,
      senderAvatarUrl: params.senderAvatarUrl ?? maybePendingOutbound.senderAvatarUrl,
      mediaUrl: params.mediaUrl ?? maybePendingOutbound.mediaUrl,
      mediaMimeType: params.mediaMimeType ?? maybePendingOutbound.mediaMimeType,
      mediaFileName: params.mediaFileName ?? maybePendingOutbound.mediaFileName,
      mediaFileSizeBytes: params.mediaFileSizeBytes ?? maybePendingOutbound.mediaFileSizeBytes,
      mediaCaption: params.mediaCaption ?? maybePendingOutbound.mediaCaption,
      mediaDurationSeconds: params.mediaDurationSeconds ?? maybePendingOutbound.mediaDurationSeconds,
      metadataJson: mergeMetadataJson(maybePendingOutbound.metadataJson, params.metadataJson)
    }
  });
}

export async function syncWebhookMessage(params: CommonParams & { messageId: string; currentStatus: MessageStatus; currentExternalMessageId: string | null }) {
  const shouldSyncExternalId = Boolean(params.externalMessageId && !params.currentExternalMessageId);
  const shouldSyncStatus = params.currentStatus !== MessageStatus.SENT;

  if (!shouldSyncExternalId && !shouldSyncStatus) {
    return null;
  }

  const current = await prisma.message.findUniqueOrThrow({
    where: { id: params.messageId }
  });

  return prisma.message.update({
    where: { id: params.messageId },
    data: {
      ...(shouldSyncExternalId ? { externalMessageId: params.externalMessageId } : {}),
      ...(shouldSyncStatus ? { status: MessageStatus.SENT } : {}),
      senderAvatarUrl: params.senderAvatarUrl ?? current.senderAvatarUrl,
      mediaUrl: params.mediaUrl ?? current.mediaUrl,
      mediaMimeType: params.mediaMimeType ?? current.mediaMimeType,
      mediaFileName: params.mediaFileName ?? current.mediaFileName,
      mediaFileSizeBytes: params.mediaFileSizeBytes ?? current.mediaFileSizeBytes,
      mediaCaption: params.mediaCaption ?? current.mediaCaption,
      mediaDurationSeconds: params.mediaDurationSeconds ?? current.mediaDurationSeconds,
      metadataJson: mergeMetadataJson(current.metadataJson, params.metadataJson)
    }
  });
}
