import { ChannelType, MessageType, Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import { publishEvent } from "../../../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../../lib/correlation.js";
import type { ParsedIncomingDeletionUpdate } from "../message-update-parser.js";
import {
  asRecord,
  sanitizeMediaUrlForRealtime,
  toPrismaJsonValue
} from "../shared.js";

interface HandleMessageUpdateWebhookParams {
  tenantId: string;
  instanceScopeKey: string;
  eventName: string;
  webhookCorrelationId: string;
  parsedDeletionUpdate: ParsedIncomingDeletionUpdate;
}

const DELETED_FOR_ALL_TEXT = "Esta mensagem foi apagada.";
const DELETED_FOR_ME_TEXT = "Mensagem removida no WhatsApp (apenas para esta sessao).";

function normalizeConversationExternalIds(remoteJid: string) {
  const normalized = remoteJid
    .trim()
    .replace(/:\d+(?=@)/, "")
    .replace(/@c\.us$/i, "@s.whatsapp.net");

  const candidates = new Set<string>([normalized]);
  if (normalized.endsWith("@s.whatsapp.net")) {
    candidates.add(normalized.replace(/@s\.whatsapp\.net$/i, "@c.us"));
  } else if (normalized.endsWith("@c.us")) {
    candidates.add(normalized.replace(/@c\.us$/i, "@s.whatsapp.net"));
  }

  return [...candidates];
}

function buildDeletionMetadata(params: {
  previousMetadata: unknown;
  parsedDeletionUpdate: ParsedIncomingDeletionUpdate;
  targetMessage: {
    messageType: MessageType;
    content: string;
  };
}) {
  const metadata = asRecord(params.previousMetadata)
    ? { ...(asRecord(params.previousMetadata) as Record<string, unknown>) }
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
    scope: params.parsedDeletionUpdate.scope,
    source: "whatsapp",
    deletedAt: (params.parsedDeletionUpdate.deletedAt ?? new Date()).toISOString(),
    deletedBy: {
      actorJid: params.parsedDeletionUpdate.actorJid,
      actorName: params.parsedDeletionUpdate.actorName,
      actorScope: params.parsedDeletionUpdate.fromMe ? "self" : "peer"
    },
    originalMessageType: params.targetMessage.messageType,
    originalContent:
      typeof params.targetMessage.content === "string" &&
      params.targetMessage.content.trim().length > 0
        ? params.targetMessage.content.slice(0, 500)
        : null
  };

  return metadata;
}

export async function handleMessageUpdateWebhook(params: HandleMessageUpdateWebhookParams) {
  const conversationExternalIds = normalizeConversationExternalIds(
    params.parsedDeletionUpdate.remoteJid
  );

  const conversation = await prisma.conversation.findFirst({
    where: {
      tenantId: params.tenantId,
      instanceScopeKey: params.instanceScopeKey,
      channel: ChannelType.WHATSAPP,
      externalId: {
        in: conversationExternalIds
      }
    },
    select: {
      id: true
    }
  });

  if (!conversation) {
    return {
      statusCode: 202,
      body: {
        status: "ignored",
        event: params.eventName,
        reason: "message_update_conversation_not_found"
      }
    };
  }

  const targetMessage = await prisma.message.findFirst({
    where: {
      tenantId: params.tenantId,
      conversationId: conversation.id,
      externalMessageId: params.parsedDeletionUpdate.targetExternalMessageId
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!targetMessage) {
    return {
      statusCode: 202,
      body: {
        status: "ignored",
        event: params.eventName,
        reason: "message_update_target_not_found"
      }
    };
  }

  const nextMetadata = buildDeletionMetadata({
    previousMetadata: targetMessage.metadataJson,
    parsedDeletionUpdate: params.parsedDeletionUpdate,
    targetMessage: {
      messageType: targetMessage.messageType,
      content: targetMessage.content
    }
  });

  let updatedMessage = await prisma.message.update({
    where: {
      id: targetMessage.id
    },
    data: {
      messageType: MessageType.TEXT,
      content:
        params.parsedDeletionUpdate.scope === "EVERYONE"
          ? DELETED_FOR_ALL_TEXT
          : DELETED_FOR_ME_TEXT,
      mediaUrl: null,
      mediaMimeType: null,
      mediaFileName: null,
      mediaFileSizeBytes: null,
      mediaCaption: null,
      mediaDurationSeconds: null,
      metadataJson: toPrismaJsonValue(nextMetadata)
    }
  });

  let messageCorrelationId = getCorrelationIdFromMetadata(updatedMessage.metadataJson);
  if (!messageCorrelationId) {
    messageCorrelationId = deriveMessageCorrelationId(
      params.parsedDeletionUpdate.targetExternalMessageId,
      updatedMessage.id
    );
    updatedMessage = await prisma.message.update({
      where: {
        id: updatedMessage.id
      },
      data: {
        metadataJson: withCorrelationIdMetadata(
          updatedMessage.metadataJson,
          messageCorrelationId
        ) as Prisma.InputJsonValue
      }
    });
  }

  await publishEvent({
    type: "message.updated",
    tenantId: params.tenantId,
    payload: {
      ...updatedMessage,
      mediaUrl: sanitizeMediaUrlForRealtime(updatedMessage.mediaUrl),
      correlationId: messageCorrelationId
    } as unknown as Record<string, unknown>
  });

  return {
    statusCode: 202,
    body: {
      status: "ok",
      event: params.eventName,
      deletionUpdated: true,
      conversationId: conversation.id,
      messageId: targetMessage.id,
      scope: params.parsedDeletionUpdate.scope
    }
  };
}
