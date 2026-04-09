import { asRecord } from "./object-utils.js";
import {
  extractAvatarFromPayload,
  pickFirstAvatar
} from "./media.js";

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

function normalizeBase64Thumbnail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\s+/g, "");
  if (normalized.length < 96 || normalized.length > 5_000_000) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    return null;
  }

  return `data:image/jpeg;base64,${normalized}`;
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

  const explicitName =
    pickFirstNonEmptyString([
      params.contactMessage.displayName,
      params.contactMessage.fullName,
      params.contactsArrayMessage.displayName,
      firstArrayContact?.displayName,
      firstArrayContact?.fullName
    ]) ??
    null;

  const phone =
    normalizeContactPhone(params.contactMessage.phoneNumber) ??
    normalizeContactPhone(params.contactMessage.waId) ??
    normalizeContactPhone(firstArrayContact?.phoneNumber) ??
    normalizeContactPhone(firstArrayContact?.waId) ??
    parsePhoneFromVcard(vcard) ??
    parsePhoneFromVcard(firstArrayVcard);

  const resolvedVcard = vcard ?? firstArrayVcard;
  const avatarUrl =
    pickFirstAvatar([
      params.contactMessage.profilePicUrl,
      params.contactMessage.profilePictureUrl,
      params.contactMessage.pictureUrl,
      params.contactMessage.avatarUrl,
      params.contactMessage.thumb,
      params.contactMessage.jpegThumbnail,
      firstArrayContact?.profilePicUrl,
      firstArrayContact?.profilePictureUrl,
      firstArrayContact?.pictureUrl,
      firstArrayContact?.avatarUrl,
      firstArrayContact?.thumb,
      firstArrayContact?.jpegThumbnail
    ]) ??
    normalizeBase64Thumbnail(params.contactMessage.jpegThumbnail) ??
    normalizeBase64Thumbnail(firstArrayContact?.jpegThumbnail) ??
    extractAvatarFromPayload(params.contactMessage, [
      "profilePicUrl",
      "profilePictureUrl",
      "pictureUrl",
      "avatarUrl",
      "thumb",
      "jpegThumbnail",
      "thumbnail"
    ]) ??
    extractAvatarFromPayload(firstArrayContact, [
      "profilePicUrl",
      "profilePictureUrl",
      "pictureUrl",
      "avatarUrl",
      "thumb",
      "jpegThumbnail",
      "thumbnail"
    ]);

  if (!phone && !resolvedVcard) {
    return null;
  }

  const metadata: Record<string, unknown> = {
    name: explicitName || params.senderName || "Contato"
  };

  if (phone) {
    metadata.phone = phone;
  }

  if (resolvedVcard) {
    metadata.vcard = resolvedVcard;
  }

  if (avatarUrl) {
    metadata.avatarUrl = avatarUrl;
  }

  return metadata;
}
