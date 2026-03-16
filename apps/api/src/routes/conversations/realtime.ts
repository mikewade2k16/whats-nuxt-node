import {
  ChannelType,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType
} from "@prisma/client";

export function mapConversation(conversation: {
  id: string;
  instanceId?: string | null;
  instanceScopeKey?: string | null;
  instance?: {
    instanceName: string;
    displayName: string | null;
  } | null;
  channel: ChannelType;
  status: ConversationStatus;
  externalId: string;
  contactId: string | null;
  contactName: string | null;
  contactAvatarUrl: string | null;
  contactPhone: string | null;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messages: Array<{
    id: string;
    content: string;
    messageType: MessageType;
    mediaUrl?: string | null;
    direction: MessageDirection;
    createdAt: Date;
    status: MessageStatus;
  }>;
}) {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    instanceId: conversation.instanceId ?? null,
    instanceScopeKey: conversation.instanceScopeKey ?? null,
    instanceName: conversation.instance?.instanceName ?? conversation.instanceScopeKey ?? null,
    instanceDisplayName: conversation.instance?.displayName ?? null,
    channel: conversation.channel,
    status: conversation.status,
    externalId: conversation.externalId,
    contactId: conversation.contactId,
    contactName: conversation.contactName,
    contactAvatarUrl: conversation.contactAvatarUrl,
    contactPhone: conversation.contactPhone,
    assignedToId: conversation.assignedToId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          messageType: lastMessage.messageType,
          mediaUrl: sanitizeMediaUrlForRealtime(lastMessage.mediaUrl ?? null),
          direction: lastMessage.direction,
          status: lastMessage.status,
          createdAt: lastMessage.createdAt
        }
      : null
  };
}

export function sanitizeMediaUrlForRealtime(mediaUrl: string | null) {
  if (!mediaUrl) {
    return null;
  }

  const normalized = mediaUrl.trim();
  if (!normalized) {
    return null;
  }

  // Do not broadcast data URLs over Redis/WebSocket to avoid freezing the UI with huge payloads.
  if (normalized.startsWith("data:")) {
    return null;
  }

  return normalized;
}

export function toRealtimeMessagePayload<
  T extends {
    mediaUrl: string | null;
  }
>(message: T) {
  return {
    ...message,
    mediaUrl: sanitizeMediaUrlForRealtime(message.mediaUrl)
  };
}


export function buildConversationPreviewPayload(params: {
  conversation: {
    id: string;
    instanceId?: string | null;
    instanceScopeKey?: string | null;
    instanceName?: string | null;
    instanceDisplayName?: string | null;
    channel: ChannelType;
    status: ConversationStatus;
    externalId: string;
    contactId: string | null;
    contactName: string | null;
    contactAvatarUrl: string | null;
    contactPhone: string | null;
    assignedToId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date;
  };
  lastMessage:
    | {
        id: string;
        content: string;
        messageType: MessageType;
        mediaUrl: string | null;
        direction: MessageDirection;
        status: MessageStatus;
        createdAt: Date;
      }
    | null;
}) {
  return {
    id: params.conversation.id,
    instanceId: params.conversation.instanceId ?? null,
    instanceScopeKey: params.conversation.instanceScopeKey ?? null,
    instanceName: params.conversation.instanceName ?? params.conversation.instanceScopeKey ?? null,
    instanceDisplayName: params.conversation.instanceDisplayName ?? null,
    channel: params.conversation.channel,
    status: params.conversation.status,
    externalId: params.conversation.externalId,
    contactId: params.conversation.contactId,
    contactName: params.conversation.contactName,
    contactAvatarUrl: params.conversation.contactAvatarUrl,
    contactPhone: params.conversation.contactPhone,
    assignedToId: params.conversation.assignedToId,
    createdAt: params.conversation.createdAt,
    updatedAt: params.conversation.updatedAt,
    lastMessageAt: params.lastMessage?.createdAt ?? params.conversation.lastMessageAt,
    lastMessage: params.lastMessage
      ? {
          id: params.lastMessage.id,
          content: params.lastMessage.content,
          messageType: params.lastMessage.messageType,
          mediaUrl: sanitizeMediaUrlForRealtime(params.lastMessage.mediaUrl),
          direction: params.lastMessage.direction,
          status: params.lastMessage.status,
          createdAt: params.lastMessage.createdAt
        }
      : null
  };
}


