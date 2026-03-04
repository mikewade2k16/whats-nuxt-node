import { ConversationStatus } from "@prisma/client";
import { prisma } from "../../../../db.js";
import { publishEvent } from "../../../../event-bus.js";
import { sanitizeMediaUrlForRealtime } from "../../media.js";

interface PublishMessageUpsertEventsParams {
  tenantId: string;
  message: {
    id: string;
    content: string;
    messageType: unknown;
    mediaUrl: string | null;
    direction: unknown;
    status: unknown;
    createdAt: Date;
  };
  messageCreated: boolean;
  messageUpdated: boolean;
  messageCorrelationId: string;
  conversation: {
    id: string;
  };
  existingConversation: {
    contactName: string | null;
    contactAvatarUrl: string | null;
    contactPhone: string | null;
  } | null;
}

export async function publishMessageUpsertEvents(params: PublishMessageUpsertEventsParams) {
  let conversationForEvent = await prisma.conversation.findUniqueOrThrow({
    where: { id: params.conversation.id }
  });

  if (params.messageCreated) {
    conversationForEvent = await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: {
        status: ConversationStatus.OPEN,
        lastMessageAt: params.message.createdAt
      }
    });

    await publishEvent({
      type: "message.created",
      tenantId: params.tenantId,
      payload: {
        ...params.message,
        mediaUrl: sanitizeMediaUrlForRealtime(params.message.mediaUrl),
        correlationId: params.messageCorrelationId
      } as unknown as Record<string, unknown>
    });
  } else if (params.messageUpdated) {
    await publishEvent({
      type: "message.updated",
      tenantId: params.tenantId,
      payload: {
        ...params.message,
        mediaUrl: sanitizeMediaUrlForRealtime(params.message.mediaUrl),
        correlationId: params.messageCorrelationId
      } as unknown as Record<string, unknown>
    });
  }

  const conversationIdentityChanged =
    !params.existingConversation ||
    params.existingConversation.contactName !== conversationForEvent.contactName ||
    params.existingConversation.contactAvatarUrl !== conversationForEvent.contactAvatarUrl ||
    params.existingConversation.contactPhone !== conversationForEvent.contactPhone;

  if (params.messageCreated || conversationIdentityChanged) {
    await publishEvent({
      type: "conversation.updated",
      tenantId: params.tenantId,
      payload: {
        id: conversationForEvent.id,
        channel: conversationForEvent.channel,
        status: conversationForEvent.status,
        externalId: conversationForEvent.externalId,
        contactId: conversationForEvent.contactId,
        contactName: conversationForEvent.contactName,
        contactAvatarUrl: conversationForEvent.contactAvatarUrl,
        contactPhone: conversationForEvent.contactPhone,
        assignedToId: conversationForEvent.assignedToId,
        createdAt: conversationForEvent.createdAt,
        updatedAt: conversationForEvent.updatedAt,
        lastMessageAt: conversationForEvent.lastMessageAt,
        lastMessage: {
          id: params.message.id,
          content: params.message.content,
          messageType: params.message.messageType,
          mediaUrl: sanitizeMediaUrlForRealtime(params.message.mediaUrl),
          direction: params.message.direction,
          status: params.message.status,
          createdAt: params.message.createdAt,
          correlationId: params.messageCorrelationId
        }
      }
    });
  }
}
