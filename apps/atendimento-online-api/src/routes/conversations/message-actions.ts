import {
  Prisma,
  MessageType
} from "@prisma/client";
import { withCorrelationIdMetadata } from "../../lib/correlation.js";
import { asRecord } from "./object-utils.js";

export function cloneForwardMetadata(
  metadataJson: unknown,
  sourceMessage: {
    id: string;
    conversationId: string;
  },
  actor: {
    userId: string;
    userName: string;
  },
  correlationId: string
) {
  const metadata = asRecord(metadataJson)
    ? { ...(asRecord(metadataJson) as Record<string, unknown>) }
    : {};

  delete metadata.reply;
  delete metadata.reactions;
  delete metadata.mentions;
  delete metadata.linkPreview;
  delete metadata.deletion;

  metadata.forwarded = {
    sourceMessageId: sourceMessage.id,
    sourceConversationId: sourceMessage.conversationId,
    forwardedAt: new Date().toISOString(),
    forwardedBy: {
      userId: actor.userId,
      userName: actor.userName
    }
  };

  return withCorrelationIdMetadata(metadata, correlationId) as Prisma.InputJsonValue;
}

export function buildDeletedForAllMetadata(
  metadataJson: unknown,
  actor: {
    userId: string;
    userName: string;
  },
  original: {
    content: string;
    messageType: MessageType;
  }
) {
  const metadata = asRecord(metadataJson)
    ? { ...(asRecord(metadataJson) as Record<string, unknown>) }
    : {};

  delete metadata.reply;
  delete metadata.reactions;
  delete metadata.linkPreview;
  delete metadata.contact;
  delete metadata.contacts;
  delete metadata.media;
  delete metadata.mediaKind;
  delete metadata.mediaPayloadKey;
  delete metadata.sticker;

  metadata.deletion = {
    scope: "EVERYONE",
    deletedAt: new Date().toISOString(),
    deletedBy: {
      userId: actor.userId,
      userName: actor.userName
    },
    originalMessageType: original.messageType,
    originalContent:
      typeof original.content === "string" && original.content.trim().length > 0
        ? original.content.slice(0, 500)
        : null
  };

  return metadata as Prisma.InputJsonValue;
}


