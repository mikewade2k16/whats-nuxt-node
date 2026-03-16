import type { Message } from "~/types";

export interface InboxMessageContactCardModel {
  name: string;
  phone: string | null;
  displayPhone: string | null;
  tel: string | null;
  vcard: string | null;
  avatarUrl: string | null;
  contactId: string | null;
}

export interface InboxMessageContactActionPayload {
  name: string;
  phone: string;
  contactId: string | null;
  avatarUrl: string | null;
}

function asRecord(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function pickFirstNonEmptyString(values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function hasExplicitContactPayload(value: Record<string, unknown> | null) {
  if (!value) {
    return false;
  }

  const phone = pickFirstNonEmptyString([
    value.phone,
    value.phoneNumber,
    value.number,
    value.waId
  ]);
  const vcard = pickFirstNonEmptyString([value.vcard]);

  return Boolean(phone || vcard);
}

function formatContactDisplayPhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits.slice(2);
  }

  return trimmed;
}

function parseContactFromContent(content: string | null | undefined) {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^Contato:\s*(.+?)(?:\s+\(([^)]+)\))?$/i);
  if (!match) {
    return null;
  }

  const rawName = match[1]?.trim() ?? "";
  const rawPhone = match[2]?.trim() ?? "";
  if (!rawName && !rawPhone) {
    return null;
  }

  return {
    name: rawName,
    phone: rawPhone
  };
}

function resolveContactRecord(messageEntry: Message) {
  const metadata = asRecord(messageEntry.metadataJson);
  const directContact = metadata ? asRecord(metadata.contact) : null;

  if (hasExplicitContactPayload(directContact)) {
    return directContact;
  }

  const firstArrayContact = metadata ? asRecord(asArray(metadata.contacts)[0]) : null;
  if (hasExplicitContactPayload(firstArrayContact)) {
    return firstArrayContact;
  }

  const parsedFromContent = parseContactFromContent(messageEntry.content);
  if (!parsedFromContent) {
    return null;
  }

  return {
    name: parsedFromContent.name,
    phone: parsedFromContent.phone
  };
}

function getMessageContactCard(messageEntry: Message): InboxMessageContactCardModel | null {
  const contact = resolveContactRecord(messageEntry);
  if (!contact) {
    return null;
  }

  const name = pickFirstNonEmptyString([
    contact.name,
    contact.displayName,
    contact.fullName
  ]);
  const phone = pickFirstNonEmptyString([
    contact.phone,
    contact.phoneNumber,
    contact.number,
    contact.waId
  ]);
  const vcard = pickFirstNonEmptyString([contact.vcard]);
  const avatarUrl = pickFirstNonEmptyString([contact.avatarUrl]);
  const contactId = pickFirstNonEmptyString([contact.contactId]);

  if (!name && !phone && !vcard) {
    return null;
  }

  const displayPhone = formatContactDisplayPhone(phone);
  const label = name || displayPhone || "Contato";
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return {
    name: label,
    phone: phone || null,
    displayPhone: displayPhone || null,
    tel,
    vcard: vcard || null,
    avatarUrl: avatarUrl || null,
    contactId: contactId || null
  };
}

function getMessageContactActionPayload(messageEntry: Message): InboxMessageContactActionPayload | null {
  const contactCard = getMessageContactCard(messageEntry);
  if (!contactCard?.phone) {
    return null;
  }

  return {
    name: contactCard.name,
    phone: contactCard.phone,
    contactId: contactCard.contactId,
    avatarUrl: contactCard.avatarUrl
  };
}

export function useInboxChatMessageContact() {
  return {
    formatContactDisplayPhone,
    getMessageContactCard,
    getMessageContactActionPayload
  };
}
