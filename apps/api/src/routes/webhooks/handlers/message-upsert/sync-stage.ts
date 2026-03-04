import type { Message } from "@prisma/client";
import {
  findExistingWebhookMessage,
  reconcilePendingOutboundEcho,
  syncWebhookMessage
} from "./deduplication.js";

interface ResolveWebhookMessageSyncStageParams {
  tenantId: string;
  conversationId: string;
  parsedFromMe: boolean;
  messageType: Message["messageType"];
  content: string;
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

export async function resolveWebhookMessageSyncStage(
  params: ResolveWebhookMessageSyncStageParams
) {
  let message = await findExistingWebhookMessage({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    externalMessageId: params.externalMessageId
  });

  let messageUpdated = false;

  if (!message && params.parsedFromMe) {
    message = await reconcilePendingOutboundEcho({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      parsedFromMe: params.parsedFromMe,
      messageType: params.messageType,
      content: params.content,
      externalMessageId: params.externalMessageId,
      senderAvatarUrl: params.senderAvatarUrl,
      mediaUrl: params.mediaUrl,
      mediaMimeType: params.mediaMimeType,
      mediaFileName: params.mediaFileName,
      mediaFileSizeBytes: params.mediaFileSizeBytes,
      mediaCaption: params.mediaCaption,
      mediaDurationSeconds: params.mediaDurationSeconds,
      metadataJson: params.metadataJson
    });

    if (message) {
      messageUpdated = true;
    }
  }

  if (message) {
    const syncedMessage = await syncWebhookMessage({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      messageId: message.id,
      currentStatus: message.status,
      currentExternalMessageId: message.externalMessageId,
      externalMessageId: params.externalMessageId,
      senderAvatarUrl: params.senderAvatarUrl,
      mediaUrl: params.mediaUrl,
      mediaMimeType: params.mediaMimeType,
      mediaFileName: params.mediaFileName,
      mediaFileSizeBytes: params.mediaFileSizeBytes,
      mediaCaption: params.mediaCaption,
      mediaDurationSeconds: params.mediaDurationSeconds,
      metadataJson: params.metadataJson
    });

    if (syncedMessage) {
      message = syncedMessage;
      messageUpdated = true;
    }
  }

  return {
    message,
    messageUpdated
  };
}
