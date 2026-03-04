import { ChannelType, Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import { publishEvent } from "../../../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../../lib/correlation.js";
import type { ParsedIncomingReaction } from "../shared.js";
import {
  extractPhone,
  normalizeMentionJid,
  sanitizeMediaUrlForRealtime,
  toPrismaJsonValue,
  withMessageReactionMetadata
} from "../shared.js";

interface HandleReactionWebhookParams {
  tenantId: string;
  eventName: string;
  webhookCorrelationId: string;
  parsedReaction: ParsedIncomingReaction;
}

export async function handleReactionWebhook(params: HandleReactionWebhookParams) {
  const reactionConversation = await prisma.conversation.findUnique({
    where: {
      tenantId_externalId_channel: {
        tenantId: params.tenantId,
        externalId: params.parsedReaction.remoteJid,
        channel: ChannelType.WHATSAPP
      }
    }
  });

  if (!reactionConversation) {
    return {
      statusCode: 202,
      body: {
        status: "ignored",
        event: params.eventName,
        reason: "reaction_conversation_not_found"
      }
    };
  }

  const targetMessage = await prisma.message.findFirst({
    where: {
      tenantId: params.tenantId,
      conversationId: reactionConversation.id,
      externalMessageId: params.parsedReaction.targetExternalMessageId
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
        reason: "reaction_target_not_found"
      }
    };
  }

  const actorJid = normalizeMentionJid(params.parsedReaction.actorJid ?? "");
  const actorKey = params.parsedReaction.fromMe
    ? "wa:self"
    : `wa:${actorJid ?? (extractPhone(params.parsedReaction.actorJid ?? "") || "unknown")}`;
  const nextMetadata = withMessageReactionMetadata({
    metadataJson: targetMessage.metadataJson,
    actorKey,
    actorUserId: null,
    actorName: params.parsedReaction.actorName,
    actorJid,
    emoji: params.parsedReaction.emoji,
    source: "whatsapp"
  });

  let updatedReactionMessage = await prisma.message.update({
    where: {
      id: targetMessage.id
    },
    data: {
      metadataJson: toPrismaJsonValue(nextMetadata)
    }
  });

  let reactionCorrelationId = getCorrelationIdFromMetadata(updatedReactionMessage.metadataJson);
  if (!reactionCorrelationId) {
    reactionCorrelationId = deriveMessageCorrelationId(
      params.parsedReaction.targetExternalMessageId ?? params.webhookCorrelationId,
      updatedReactionMessage.id
    );
    updatedReactionMessage = await prisma.message.update({
      where: {
        id: updatedReactionMessage.id
      },
      data: {
        metadataJson: withCorrelationIdMetadata(
          updatedReactionMessage.metadataJson,
          reactionCorrelationId
        ) as Prisma.InputJsonValue
      }
    });
  }

  await publishEvent({
    type: "message.updated",
    tenantId: params.tenantId,
    payload: {
      ...updatedReactionMessage,
      mediaUrl: sanitizeMediaUrlForRealtime(updatedReactionMessage.mediaUrl),
      correlationId: reactionCorrelationId
    } as unknown as Record<string, unknown>
  });

  return {
    statusCode: 202,
    body: {
      status: "ok",
      event: params.eventName,
      reactionUpdated: true,
      conversationId: reactionConversation.id,
      messageId: targetMessage.id
    }
  };
}
