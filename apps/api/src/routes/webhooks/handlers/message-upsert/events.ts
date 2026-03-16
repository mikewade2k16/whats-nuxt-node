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
  const shouldAdvanceLastMessageAt = params.message.createdAt >= conversationForEvent.lastMessageAt;

  if (params.messageCreated) {
    conversationForEvent = await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: {
        status: ConversationStatus.OPEN,
        ...(shouldAdvanceLastMessageAt
          ? {
              lastMessageAt: params.message.createdAt
            }
          : {})
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

  const shouldPublishConversationUpdated =
    conversationIdentityChanged ||
    (params.messageCreated && shouldAdvanceLastMessageAt);

  if (shouldPublishConversationUpdated) {
    const latestMessageForConversation = await prisma.message.findFirst({
      where: {
        tenantId: params.tenantId,
        conversationId: params.conversation.id
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ],
      select: {
        id: true,
        content: true,
        messageType: true,
        mediaUrl: true,
        direction: true,
        status: true,
        createdAt: true
      }
    });

    if (
      latestMessageForConversation &&
      latestMessageForConversation.createdAt > conversationForEvent.lastMessageAt
    ) {
      conversationForEvent = await prisma.conversation.update({
        where: {
          id: params.conversation.id
        },
        data: {
          lastMessageAt: latestMessageForConversation.createdAt
        }
      });
    }

    const previewMessage = latestMessageForConversation ?? {
      id: params.message.id,
      content: params.message.content,
      messageType: params.message.messageType,
      mediaUrl: params.message.mediaUrl,
      direction: params.message.direction,
      status: params.message.status,
      createdAt: params.message.createdAt
    };

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
          id: previewMessage.id,
          content: previewMessage.content,
          messageType: previewMessage.messageType,
          mediaUrl: sanitizeMediaUrlForRealtime(previewMessage.mediaUrl),
          direction: previewMessage.direction,
          status: previewMessage.status,
          createdAt: previewMessage.createdAt,
          correlationId: previewMessage.id === params.message.id
            ? params.messageCorrelationId
            : undefined
        }
      }
    });
  }
}
