import {
  MessageDirection,
  MessageStatus,
  MessageType
} from "@prisma/client";
import { prisma } from "../../../../db.js";
import { toPrismaJsonValue } from "../../message-json.js";

interface CreateWebhookMessageParams {
  tenantId: string;
  conversationId: string;
  direction: MessageDirection;
  messageType: MessageType;
  senderName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaFileSizeBytes: number | null;
  mediaCaption: string | null;
  mediaDurationSeconds: number | null;
  metadataJson: unknown;
  externalMessageId: string | null;
}

export async function createWebhookMessage(params: CreateWebhookMessageParams) {
  return prisma.message.create({
    data: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      direction: params.direction,
      messageType: params.messageType,
      senderName: params.senderName,
      senderAvatarUrl: params.senderAvatarUrl,
      content: params.content,
      mediaUrl: params.mediaUrl,
      mediaMimeType: params.mediaMimeType,
      mediaFileName: params.mediaFileName,
      mediaFileSizeBytes: params.mediaFileSizeBytes,
      mediaCaption: params.mediaCaption,
      mediaDurationSeconds: params.mediaDurationSeconds,
      metadataJson: toPrismaJsonValue(params.metadataJson),
      status: MessageStatus.SENT,
      externalMessageId: params.externalMessageId
    }
  });
}
