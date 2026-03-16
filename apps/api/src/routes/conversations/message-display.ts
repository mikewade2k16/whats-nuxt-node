import { MessageDirection } from "@prisma/client";

type ConversationIdentity = {
  externalId: string;
  contactName: string | null;
  contactPhone: string | null;
};

type MessageIdentity = {
  direction: MessageDirection;
  senderName: string | null;
};

function extractDigits(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : null;
}

function isTechnicalWhatsAppIdentifier(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return true;
  }

  if (
    normalized.endsWith("@s.whatsapp.net") ||
    normalized.endsWith("@g.us") ||
    normalized.endsWith("@lid")
  ) {
    return true;
  }

  const compact = normalized.replace(/\s+/g, "");
  return /^\+?\d{7,20}$/.test(compact);
}

function isGroupExternalId(externalId: string | null | undefined) {
  return (externalId?.trim().toLowerCase() ?? "").endsWith("@g.us");
}

function resolveDirectConversationFallbackName(conversation: ConversationIdentity) {
  const contactName = conversation.contactName?.trim() ?? "";
  if (contactName && !isTechnicalWhatsAppIdentifier(contactName)) {
    return contactName;
  }

  const phoneDigits = extractDigits(conversation.contactPhone || conversation.externalId);
  return phoneDigits ?? null;
}

export function normalizeMessageSenderForConversationResponse<T extends MessageIdentity>(
  message: T,
  conversation: ConversationIdentity
) {
  if (message.direction !== MessageDirection.INBOUND) {
    return message;
  }

  if (isGroupExternalId(conversation.externalId)) {
    return message;
  }

  const senderName = message.senderName?.trim() ?? "";
  if (senderName && !isTechnicalWhatsAppIdentifier(senderName)) {
    return message;
  }

  const fallbackName = resolveDirectConversationFallbackName(conversation);
  if (!fallbackName) {
    return message;
  }

  return {
    ...message,
    senderName: fallbackName
  };
}
