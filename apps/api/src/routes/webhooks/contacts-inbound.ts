import { asRecord } from "./object-utils.js";

function pickFirstNonEmptyString(values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

export function parsePhoneFromVcard(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const lines = value.split(/\r?\n/);
  for (const line of lines) {
    if (!/^TEL/i.test(line.trim())) {
      continue;
    }

    const chunks = line.split(":");
    if (chunks.length < 2) {
      continue;
    }

    const rawValue = chunks.slice(1).join(":").trim();
    if (!rawValue) {
      continue;
    }

    const normalized = rawValue.replace(/[^\d+]/g, "");
    if (normalized.length >= 7) {
      return normalized;
    }
  }

  return null;
}

export function normalizeContactPhone(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? normalized : null;
}

export function extractInboundContactMetadata(params: {
  contactMessage: Record<string, unknown>;
  contactsArrayMessage: Record<string, unknown>;
  senderName: string | null;
}) {
  const vcard =
    pickFirstNonEmptyString([
      params.contactMessage.vcard
    ]) ??
    null;

  const contacts = Array.isArray(params.contactsArrayMessage.contacts)
    ? params.contactsArrayMessage.contacts.filter((entry): entry is Record<string, unknown> => Boolean(asRecord(entry)))
    : [];
  const firstArrayContact = contacts.length > 0 ? asRecord(contacts[0]) : null;
  const firstArrayVcard = firstArrayContact
    ? pickFirstNonEmptyString([firstArrayContact.vcard])
    : null;

  const name =
    pickFirstNonEmptyString([
      params.contactMessage.displayName,
      params.contactMessage.fullName,
      params.contactsArrayMessage.displayName,
      firstArrayContact?.displayName,
      firstArrayContact?.fullName,
      params.senderName
    ]) ??
    "Contato";

  const phone =
    normalizeContactPhone(params.contactMessage.phoneNumber) ??
    normalizeContactPhone(params.contactMessage.waId) ??
    normalizeContactPhone(firstArrayContact?.phoneNumber) ??
    normalizeContactPhone(firstArrayContact?.waId) ??
    parsePhoneFromVcard(vcard) ??
    parsePhoneFromVcard(firstArrayVcard);

  const resolvedVcard = vcard ?? firstArrayVcard;

  if (!name && !phone && !resolvedVcard) {
    return null;
  }

  const metadata: Record<string, unknown> = {
    name: name || "Contato"
  };

  if (phone) {
    metadata.phone = phone;
  }

  if (resolvedVcard) {
    metadata.vcard = resolvedVcard;
  }

  return metadata;
}
