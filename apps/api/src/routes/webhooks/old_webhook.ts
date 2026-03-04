import {
  ChannelType,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma
} from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { publishEvent } from "../../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../lib/correlation.js";
import { EvolutionClient } from "../../services/evolution-client.js";
import { setLatestQrCode } from "../../services/whatsapp-qr-cache.js";

interface IncomingWebhookPayload {
  [key: string]: unknown;
}

interface EvolutionContactMatch {
  remoteJid: string;
  phone: string;
  name: string | null;
  avatarUrl: string | null;
}

const MESSAGE_CREATE_EVENTS = new Set(["MESSAGES_UPSERT"]);
const MESSAGE_UPDATE_EVENTS = new Set(["MESSAGES_UPDATE"]);
const MEDIA_MESSAGE_TYPES: MessageType[] = [
  MessageType.IMAGE,
  MessageType.AUDIO,
  MessageType.VIDEO,
  MessageType.DOCUMENT
];
const MESSAGE_WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "editedMessage"
];
const SUPPORTED_MESSAGE_PAYLOAD_KEYS = new Set([
  "conversation",
  "extendedTextMessage",
  "reactionMessage",
  "contactMessage",
  "contactsArrayMessage",
  "stickerMessage",
  "imageMessage",
  "audioMessage",
  "videoMessage",
  "documentMessage",
  ...MESSAGE_WRAPPER_KEYS
]);
const IGNORED_UNSUPPORTED_MESSAGE_KEYS = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo"
]);
const UNSUPPORTED_MESSAGE_LABELS: Record<string, string> = {
  stickerMessage: "figurinha",
  reactionMessage: "reacao",
  pollCreationMessage: "enquete",
  pollUpdateMessage: "voto de enquete",
  contactMessage: "contato",
  contactsArrayMessage: "contatos",
  locationMessage: "localizacao",
  liveLocationMessage: "localizacao ao vivo",
  listMessage: "lista interativa",
  buttonsMessage: "botoes interativos",
  templateMessage: "template",
  orderMessage: "pedido",
  productMessage: "produto",
  eventMessage: "evento",
  call: "chamada",
  unknown: "tipo desconhecido"
};

function normalizeEventName(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function parseEventName(payload: IncomingWebhookPayload, pathEventName?: string) {
  const rawEvent =
    (payload.event as string | undefined) ??
    (payload.type as string | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.event as string | undefined) ??
    pathEventName;

  return rawEvent ? normalizeEventName(rawEvent) : "";
}

function extractInstanceName(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return (
    (payload.instance as string | undefined) ??
    (payload.instanceName as string | undefined) ??
    (data.instance as string | undefined) ??
    (data.instanceName as string | undefined) ??
    ""
  );
}

function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

function extractQrCode(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const qrcode = (data.qrcode ?? {}) as Record<string, unknown>;

  const candidates = [
    payload.base64,
    payload.qrcode,
    data.base64,
    data.qrcode,
    qrcode.base64,
    qrcode.code,
    (data.pairingCode as string | undefined) ?? (payload.pairingCode as string | undefined)
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeQrDataUrl(candidate);
    }
  }

  return null;
}

function normalizeAvatarUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

function normalizeMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file://")
  ) {
    return trimmed;
  }

  return null;
}

type MediaSourceKind = "none" | "base64" | "url" | "url_encrypted";

interface ExtractMediaSourceResult {
  mediaUrl: string | null;
  sourceKind: MediaSourceKind;
  encryptedUrlCandidate: string | null;
}

function isLikelyEncryptedMediaUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes(".enc") || normalized.includes(".enc?")) {
    return true;
  }

  if (normalized.includes("mmg.whatsapp.net") && normalized.includes("mms3=true")) {
    return true;
  }

  if (normalized.includes("/o1/v/t24/")) {
    return true;
  }

  return false;
}

function sanitizeMediaUrlForRealtime(mediaUrl: string | null) {
  if (!mediaUrl) {
    return null;
  }

  const normalized = mediaUrl.trim();
  if (!normalized) {
    return null;
  }

  // Avoid broadcasting large base64 payloads through realtime channels.
  if (normalized.startsWith("data:")) {
    return null;
  }

  return normalized;
}

function normalizeMediaBase64(value: string, mimeType: string | null) {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length < 32) {
    return null;
  }

  if (cleaned.length > 40_000_000) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
    return null;
  }

  const resolvedMimeType = mimeType?.trim() || "application/octet-stream";
  return `data:${resolvedMimeType};base64,${cleaned}`;
}

function extractMediaSourceFromPayload(
  payload: unknown,
  mimeType: string | null,
  fallbackCandidates: unknown[] = [],
  options?: {
    preferBase64?: boolean;
  }
): ExtractMediaSourceResult {
  const queue: unknown[] = [payload, ...fallbackCandidates];
  let depth = 0;
  const priorityKeys = options?.preferBase64
    ? ["base64", "data", "media", "url", "mediaUrl", "fileUrl", "downloadUrl", "directPath"]
    : ["url", "mediaUrl", "fileUrl", "downloadUrl", "directPath", "base64", "data", "media"];
  let preferredUrl: string | null = null;
  let encryptedUrlCandidate: string | null = null;

  const captureUrlCandidate = (candidate: string) => {
    if (isLikelyEncryptedMediaUrl(candidate)) {
      if (!encryptedUrlCandidate) {
        encryptedUrlCandidate = candidate;
      }
      return;
    }

    if (!preferredUrl) {
      preferredUrl = candidate;
    }
  };

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      if (typeof current === "string") {
        const normalizedBase64 = normalizeMediaBase64(current, mimeType);
        if (normalizedBase64) {
          return {
            mediaUrl: normalizedBase64,
            sourceKind: "base64",
            encryptedUrlCandidate
          };
        }

        const normalizedUrl = normalizeMediaUrl(current);
        if (normalizedUrl) {
          captureUrlCandidate(normalizedUrl);
          if (!options?.preferBase64 && preferredUrl) {
            return {
              mediaUrl: preferredUrl,
              sourceKind: "url",
              encryptedUrlCandidate
            };
          }
        }
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    for (const key of priorityKeys) {
      const value = obj[key];
      if (typeof value !== "string") {
        continue;
      }

      const normalizedBase64 = normalizeMediaBase64(value, mimeType);
      if (normalizedBase64) {
        return {
          mediaUrl: normalizedBase64,
          sourceKind: "base64",
          encryptedUrlCandidate
        };
      }

      const normalizedUrl = normalizeMediaUrl(value);
      if (normalizedUrl) {
        captureUrlCandidate(normalizedUrl);
        if (!options?.preferBase64 && preferredUrl) {
          return {
            mediaUrl: preferredUrl,
            sourceKind: "url",
            encryptedUrlCandidate
          };
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  if (preferredUrl) {
    return {
      mediaUrl: preferredUrl,
      sourceKind: "url",
      encryptedUrlCandidate
    };
  }

  if (encryptedUrlCandidate) {
    return {
      mediaUrl: encryptedUrlCandidate,
      sourceKind: "url_encrypted",
      encryptedUrlCandidate
    };
  }

  return {
    mediaUrl: null,
    sourceKind: "none",
    encryptedUrlCandidate: null
  };
}

function parseOptionalInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const normalized = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(normalized)) {
      return Math.trunc(normalized);
    }
  }

  return null;
}

function normalizePositiveInt(value: unknown) {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeNonNegativeInt(value: unknown) {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function mediaTypeLabel(type: MessageType) {
  switch (type) {
    case MessageType.IMAGE:
      return "[imagem]";
    case MessageType.AUDIO:
      return "[audio]";
    case MessageType.VIDEO:
      return "[video]";
    case MessageType.DOCUMENT:
      return "[documento]";
    case MessageType.TEXT:
    default:
      return "";
  }
}

function resolveMediaExtensionByMime(mimeType: string | null, messageType: MessageType) {
  const normalizedMime = mimeType?.trim().toLowerCase() ?? "";
  const mimeExtensionMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/x-rar-compressed": ".rar",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    "text/plain": ".txt",
    "text/csv": ".csv"
  };

  if (normalizedMime && mimeExtensionMap[normalizedMime]) {
    return mimeExtensionMap[normalizedMime];
  }

  if (messageType === MessageType.IMAGE) {
    return ".jpg";
  }
  if (messageType === MessageType.VIDEO) {
    return ".mp4";
  }
  if (messageType === MessageType.AUDIO) {
    return ".ogg";
  }

  return ".bin";
}

function sanitizeInboundMediaFileName(
  fileName: string | null,
  mimeType: string | null,
  messageType: MessageType
) {
  const trimmed = fileName?.trim();
  if (!trimmed) {
    return null;
  }

  if (!/\.enc(?:[?#].*)?$/i.test(trimmed)) {
    return trimmed;
  }

  const withoutEnc = trimmed
    .replace(/[?#].*$/, "")
    .replace(/\.enc$/i, "")
    .trim()
    .replace(/[.\-_ ]+$/g, "");

  if (!withoutEnc) {
    return `arquivo${resolveMediaExtensionByMime(mimeType, messageType)}`;
  }

  if (/\.[a-z0-9]{2,6}$/i.test(withoutEnc)) {
    return withoutEnc;
  }

  return `${withoutEnc}${resolveMediaExtensionByMime(mimeType, messageType)}`;
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function hasMentionTargets(metadataValue: unknown) {
  const metadata = asRecord(metadataValue);
  if (!metadata) {
    return false;
  }

  const mentions = asRecord(metadata.mentions);
  if (!mentions) {
    return false;
  }

  if (mentions.everyOne === true) {
    return true;
  }

  return Array.isArray(mentions.mentioned) && mentions.mentioned.length > 0;
}

interface MessageReactionEntry {
  actorKey: string;
  actorUserId: string | null;
  actorName: string | null;
  actorJid: string | null;
  emoji: string;
  updatedAt: string;
  source: "agent" | "whatsapp";
}

interface ParsedIncomingReaction {
  remoteJid: string;
  targetExternalMessageId: string;
  emoji: string | null;
  fromMe: boolean;
  actorJid: string | null;
  actorName: string | null;
}

function normalizeReactionEmoji(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = [...trimmed].slice(0, 8).join("");
  return normalized || null;
}

function extractReactionEntries(metadataJson: unknown) {
  const metadata = asRecord(metadataJson);
  const reactions = metadata ? asRecord(metadata.reactions) : null;
  const items = Array.isArray(reactions?.items) ? reactions.items : [];
  const entries: MessageReactionEntry[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const actorKey = typeof record.actorKey === "string" ? record.actorKey.trim() : "";
    const emoji = normalizeReactionEmoji(record.emoji);
    if (!actorKey || !emoji) {
      continue;
    }

    entries.push({
      actorKey,
      actorUserId: typeof record.actorUserId === "string" ? record.actorUserId : null,
      actorName: typeof record.actorName === "string" ? record.actorName : null,
      actorJid: typeof record.actorJid === "string" ? record.actorJid : null,
      emoji,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      source: record.source === "agent" ? "agent" : "whatsapp"
    });
  }

  return entries;
}

function summarizeReactionEntries(entries: MessageReactionEntry[]) {
  const summary: Record<string, number> = {};
  for (const entry of entries) {
    summary[entry.emoji] = (summary[entry.emoji] ?? 0) + 1;
  }
  return summary;
}

function withMessageReactionMetadata(params: {
  metadataJson: unknown;
  actorKey: string;
  actorUserId: string | null;
  actorName: string | null;
  actorJid: string | null;
  emoji: string | null;
  source: MessageReactionEntry["source"];
}) {
  const nowIso = new Date().toISOString();
  const metadata = asRecord(params.metadataJson)
    ? { ...(asRecord(params.metadataJson) as Record<string, unknown>) }
    : {};
  const withoutActor = extractReactionEntries(params.metadataJson).filter(
    (entry) => entry.actorKey !== params.actorKey
  );

  if (params.emoji) {
    withoutActor.push({
      actorKey: params.actorKey,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorJid: params.actorJid,
      emoji: params.emoji,
      updatedAt: nowIso,
      source: params.source
    });
  }

  metadata.reactions = {
    items: withoutActor,
    summary: summarizeReactionEntries(withoutActor),
    updatedAt: nowIso
  };

  return metadata;
}

function parseIncomingReaction(raw: IncomingWebhookPayload): ParsedIncomingReaction | null {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = asRecord(data.key) ?? asRecord(raw.key) ?? {};
  const rawMessage = asRecord(data.message) ?? {};
  const message = unwrapMessagePayload(rawMessage);
  const reactionMessage = asRecord(message.reactionMessage);

  if (!reactionMessage || Object.keys(reactionMessage).length === 0) {
    return null;
  }

  const reactionKey = asRecord(reactionMessage.key) ?? {};
  const remoteJid =
    (key.remoteJid as string | undefined) ??
    (data.remoteJid as string | undefined) ??
    (reactionKey.remoteJid as string | undefined) ??
    null;

  const targetExternalMessageId =
    (reactionKey.id as string | undefined) ??
    (data.stanzaId as string | undefined) ??
    null;

  const emoji = normalizeReactionEmoji(
    reactionMessage.text ??
    reactionMessage.reactionText ??
    reactionMessage.emoji ??
    data.reaction
  );

  const actorJid =
    (key.participant as string | undefined) ??
    (data.participant as string | undefined) ??
    (reactionMessage.participant as string | undefined) ??
    null;
  const fromMe = Boolean(
    (key.fromMe as boolean | undefined) ??
    (data.fromMe as boolean | undefined) ??
    (reactionMessage.fromMe as boolean | undefined)
  );

  const actorNameRaw =
    (data.pushName as string | undefined) ??
    (data.participantName as string | undefined) ??
    (raw.pushName as string | undefined) ??
    null;
  const actorName = actorNameRaw?.trim() || (actorJid ? extractPhone(actorJid) : null);

  if (!remoteJid || !targetExternalMessageId) {
    return null;
  }

  return {
    remoteJid,
    targetExternalMessageId,
    emoji,
    fromMe,
    actorJid,
    actorName
  };
}

function parseFindContactsResponse(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.value)) {
    return record.value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  const nestedData = asRecord(record.data);
  if (nestedData && Array.isArray(nestedData.value)) {
    return nestedData.value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  return [];
}

function selectBestContactMatch(value: unknown, remoteJidCandidates: string[]) {
  const contacts = parseFindContactsResponse(value);
  if (!contacts.length) {
    return null;
  }

  const normalizedCandidates = new Set(
    remoteJidCandidates
      .map((entry) => normalizeJidForCompare(entry))
      .filter((entry): entry is string => Boolean(entry))
  );

  const exactMatch = contacts.find((entry) => {
    const remoteJid = typeof entry.remoteJid === "string" ? entry.remoteJid : "";
    const normalizedRemoteJid = normalizeJidForCompare(remoteJid);
    return Boolean(normalizedRemoteJid && normalizedCandidates.has(normalizedRemoteJid));
  });

  const match = exactMatch ?? contacts[0];
  if (!match) {
    return null;
  }

  const remoteJid = typeof match.remoteJid === "string" ? match.remoteJid.trim() : "";
  if (!remoteJid) {
    return null;
  }

  const phone = extractPhone(remoteJid);
  const name = typeof match.pushName === "string" && match.pushName.trim().length > 0
    ? match.pushName.trim()
    : null;
  const avatarUrl = typeof match.profilePicUrl === "string"
    ? normalizeAvatarUrl(match.profilePicUrl)
    : null;

  return {
    remoteJid,
    phone,
    name,
    avatarUrl
  } satisfies EvolutionContactMatch;
}

async function findContactByRemoteJid(
  client: EvolutionClient,
  instanceName: string,
  remoteJidCandidates: string[]
) {
  const uniqueCandidates = [...new Set(remoteJidCandidates.map((entry) => entry.trim()).filter(Boolean))];
  for (const remoteJid of uniqueCandidates) {
    try {
      const payload = await client.findContacts(instanceName, {
        where: {
          remoteJid
        }
      });

      const contact = selectBestContactMatch(payload, uniqueCandidates);
      if (contact) {
        return contact;
      }
    } catch {
      // best-effort: try next candidate
    }
  }

  return null;
}

function normalizeUnsupportedTypeKey(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "unknown";
  }

  return normalized;
}

function unsupportedTypeLabel(typeKey: string) {
  return UNSUPPORTED_MESSAGE_LABELS[typeKey] ?? typeKey.replace(/Message$/i, "").toLowerCase();
}

function unsupportedTypePlaceholder(typeKey: string) {
  return `[conteudo nao suportado: ${unsupportedTypeLabel(typeKey)}]`;
}

function shouldIgnoreUnsupportedType(typeKey: string) {
  return IGNORED_UNSUPPORTED_MESSAGE_KEYS.has(typeKey);
}

function unwrapMessagePayload(payload: Record<string, unknown>) {
  let current = payload;
  let depth = 0;

  while (depth < 8) {
    depth += 1;
    let advanced = false;

    for (const key of MESSAGE_WRAPPER_KEYS) {
      const wrapper = asRecord(current[key]);
      const nested = wrapper ? asRecord(wrapper.message) : null;
      if (nested && Object.keys(nested).length > 0) {
        current = nested;
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      break;
    }
  }

  return current;
}

function detectUnsupportedMessageType(messagePayload: Record<string, unknown>) {
  const entries = Object.entries(messagePayload);
  for (const [key, value] of entries) {
    if (SUPPORTED_MESSAGE_PAYLOAD_KEYS.has(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }

    return normalizeUnsupportedTypeKey(key);
  }

  return null;
}

function extractQuotedTextAndType(quotedMessage: Record<string, unknown>) {
  const quotedExtended = asRecord(quotedMessage.extendedTextMessage) ?? {};
  const quotedSticker = asRecord(quotedMessage.stickerMessage) ?? {};
  const quotedImage = asRecord(quotedMessage.imageMessage) ?? {};
  const quotedVideo = asRecord(quotedMessage.videoMessage) ?? {};
  const quotedDocument = asRecord(quotedMessage.documentMessage) ?? {};
  const quotedAudio = asRecord(quotedMessage.audioMessage) ?? {};

  let messageType: MessageType = MessageType.TEXT;

  if (Object.keys(quotedSticker).length > 0) {
    messageType = MessageType.IMAGE;
  } else if (Object.keys(quotedImage).length > 0) {
    messageType = MessageType.IMAGE;
  } else if (Object.keys(quotedVideo).length > 0) {
    messageType = MessageType.VIDEO;
  } else if (Object.keys(quotedDocument).length > 0) {
    messageType = MessageType.DOCUMENT;
  } else if (Object.keys(quotedAudio).length > 0) {
    messageType = MessageType.AUDIO;
  }

  const content =
    (quotedMessage.conversation as string | undefined) ??
    (quotedExtended.text as string | undefined) ??
    (quotedImage.caption as string | undefined) ??
    (quotedVideo.caption as string | undefined) ??
    (quotedDocument.caption as string | undefined) ??
    (Object.keys(quotedSticker).length > 0 ? "[figurinha]" : undefined) ??
    mediaTypeLabel(messageType);

  let mediaUrl: string | null = null;
  const mediaPayload =
    messageType === MessageType.IMAGE
      ? (Object.keys(quotedImage).length > 0 ? quotedImage : quotedSticker)
      : messageType === MessageType.VIDEO
        ? quotedVideo
        : messageType === MessageType.DOCUMENT
          ? quotedDocument
          : messageType === MessageType.AUDIO
            ? quotedAudio
            : null;

  if (mediaPayload) {
    const candidates = [
      mediaPayload.url,
      mediaPayload.mediaUrl,
      mediaPayload.fileUrl,
      mediaPayload.downloadUrl,
      mediaPayload.directPath
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const normalized = normalizeMediaUrl(candidate);
      if (normalized) {
        mediaUrl = normalized;
        break;
      }
    }
  }

  return {
    messageType,
    content: content.trim(),
    mediaUrl
  };
}

function extractStickerMetadata(payload: Record<string, unknown>) {
  const pickString = (values: unknown[]) => {
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
  };

  const pickBoolean = (value: unknown) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value === 1;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") {
        return true;
      }
      if (normalized === "false" || normalized === "0") {
        return false;
      }
    }
    return null;
  };

  const stickerName = pickString([
    payload.stickerName,
    payload.name
  ]);
  const packName = pickString([
    payload.packName,
    payload.packname
  ]);
  const author = pickString([
    payload.stickerAuthor,
    payload.author,
    payload.publisher
  ]);
  const isAnimated = pickBoolean(
    payload.isAnimated ?? payload.isAnimatedSticker ?? payload.animated
  );

  const metadata: Record<string, unknown> = {};
  if (stickerName) {
    metadata.name = stickerName;
  }
  if (packName) {
    metadata.packName = packName;
  }
  if (author) {
    metadata.author = author;
  }
  if (isAnimated !== null) {
    metadata.isAnimated = isAnimated;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

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

function normalizeLinkPreviewUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractFirstUrlFromText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
  if (!match) {
    return null;
  }

  const rawCandidate = match[0].replace(/[),.!?;:]+$/g, "");
  return normalizeLinkPreviewUrl(rawCandidate);
}

function normalizeLinkPreviewThumbnail(value: unknown) {
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

  const asBase64 = normalizeMediaBase64(trimmed, "image/jpeg");
  if (asBase64) {
    return asBase64;
  }

  return normalizeMediaUrl(trimmed);
}

function extractLinkPreviewMetadata(params: {
  text: string | null | undefined;
  extended: Record<string, unknown>;
  data: Record<string, unknown>;
  raw: IncomingWebhookPayload;
}) {
  const rawLinkPreview = asRecord(params.data.linkPreview) ?? asRecord(params.raw.linkPreview);

  const url =
    normalizeLinkPreviewUrl(params.extended.canonicalUrl) ??
    normalizeLinkPreviewUrl(params.extended.matchedText) ??
    normalizeLinkPreviewUrl(params.extended.url) ??
    normalizeLinkPreviewUrl(rawLinkPreview?.url) ??
    extractFirstUrlFromText(params.text);
  const title = pickFirstNonEmptyString([
    params.extended.title,
    rawLinkPreview?.title,
    params.data.title,
    params.raw.title
  ]);
  const description = pickFirstNonEmptyString([
    params.extended.description,
    rawLinkPreview?.description,
    params.data.description,
    params.raw.description
  ]);
  const thumbnailUrl =
    normalizeLinkPreviewThumbnail(params.extended.jpegThumbnail) ??
    normalizeLinkPreviewThumbnail(params.extended.thumbnail) ??
    normalizeLinkPreviewThumbnail(params.extended.thumbnailUrl) ??
    normalizeLinkPreviewThumbnail(params.extended.thumbnailDirectPath) ??
    normalizeLinkPreviewThumbnail(rawLinkPreview?.thumbnailDataUrl) ??
    normalizeLinkPreviewThumbnail(rawLinkPreview?.thumbnailUrl);
  const matchedText = pickFirstNonEmptyString([
    params.extended.matchedText,
    rawLinkPreview?.matchedText
  ]);

  if (!url && !title && !description && !thumbnailUrl) {
    return null;
  }

  const metadata: Record<string, unknown> = {
    enabled: true
  };

  if (url) {
    metadata.url = url;
  }
  if (title) {
    metadata.title = title;
  }
  if (description) {
    metadata.description = description;
  }
  if (thumbnailUrl) {
    metadata.thumbnailUrl = thumbnailUrl;
  }
  if (matchedText) {
    metadata.matchedText = matchedText;
  }

  return metadata;
}

function parsePhoneFromVcard(value: string | null | undefined) {
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

function normalizeContactPhone(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? normalized : null;
}

function extractInboundContactMetadata(params: {
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

function extractQuotedReplyMetadata(params: {
  contextInfo: Record<string, unknown>;
  senderName: string | null;
}) {
  const quotedMessage = asRecord(params.contextInfo.quotedMessage);
  if (!quotedMessage) {
    return null;
  }

  const stanzaId = typeof params.contextInfo.stanzaId === "string" ? params.contextInfo.stanzaId : null;
  const participantJid =
    (params.contextInfo.participant as string | undefined) ??
    (params.contextInfo.remoteJid as string | undefined) ??
    null;
  const participantName =
    (params.contextInfo.participantName as string | undefined) ??
    params.senderName ??
    (participantJid ? extractPhone(participantJid) : null) ??
    "Contato";

  const quoted = extractQuotedTextAndType(quotedMessage);

  return {
    messageId: stanzaId,
    author: participantName,
    authorJid: participantJid,
    content: quoted.content || mediaTypeLabel(quoted.messageType),
    messageType: quoted.messageType,
    mediaUrl: quoted.mediaUrl
  };
}

function mergeMetadataJson(
  existingValue: unknown,
  incomingValue: unknown
): Prisma.InputJsonValue | undefined {
  const existingRecord = asRecord(existingValue);
  const incomingRecord = asRecord(incomingValue);

  if (existingRecord && incomingRecord) {
    const merged = {
      ...existingRecord,
      ...incomingRecord,
      reply: incomingRecord.reply ?? existingRecord.reply
    };

    return toPrismaJsonValue(merged);
  }

  return toPrismaJsonValue(incomingValue) ?? toPrismaJsonValue(existingValue);
}

function pickFirstAvatar(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const avatar = normalizeAvatarUrl(candidate);
    if (avatar) {
      return avatar;
    }
  }
  return null;
}

function extractAvatarFromPayload(payload: unknown, priorityKeys: string[] = []) {
  const queue: unknown[] = [payload];
  let depth = 0;
  const defaultKeys = [
    "profilePicUrl",
    "profilePictureUrl",
    "pictureUrl",
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "imgUrl",
    "thumb"
  ];
  const keys = [...priorityKeys, ...defaultKeys];

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string") {
        const avatar = normalizeAvatarUrl(value);
        if (avatar) {
          return avatar;
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function parseIncomingMessage(raw: IncomingWebhookPayload) {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const rawMessage = (data.message ?? {}) as Record<string, unknown>;
  const message = unwrapMessagePayload(rawMessage);
  const extended = (message.extendedTextMessage ?? {}) as Record<string, unknown>;
  const contactMessage = (message.contactMessage ?? {}) as Record<string, unknown>;
  const contactsArrayMessage = (message.contactsArrayMessage ?? {}) as Record<string, unknown>;
  const stickerMessage = (message.stickerMessage ?? {}) as Record<string, unknown>;
  const imageMessage = (message.imageMessage ?? {}) as Record<string, unknown>;
  const audioMessage = (message.audioMessage ?? {}) as Record<string, unknown>;
  const videoMessage = (message.videoMessage ?? {}) as Record<string, unknown>;
  const documentMessage = (message.documentMessage ?? {}) as Record<string, unknown>;
  const stickerContextInfo = (stickerMessage.contextInfo ?? {}) as Record<string, unknown>;
  const imageContextInfo = (imageMessage.contextInfo ?? {}) as Record<string, unknown>;
  const audioContextInfo = (audioMessage.contextInfo ?? {}) as Record<string, unknown>;
  const videoContextInfo = (videoMessage.contextInfo ?? {}) as Record<string, unknown>;
  const documentContextInfo = (documentMessage.contextInfo ?? {}) as Record<string, unknown>;
  const conversationContextInfo =
    (message.messageContextInfo as Record<string, unknown> | undefined) ??
    (rawMessage.messageContextInfo as Record<string, unknown> | undefined) ??
    (data.contextInfo as Record<string, unknown> | undefined) ??
    (raw.contextInfo as Record<string, unknown> | undefined) ??
    {};
  const contextInfo =
    (extended.contextInfo as Record<string, unknown> | undefined) ??
    (Object.keys(conversationContextInfo).length > 0 ? conversationContextInfo : undefined) ??
    (Object.keys(stickerContextInfo).length > 0 ? stickerContextInfo : undefined) ??
    (Object.keys(imageContextInfo).length > 0 ? imageContextInfo : undefined) ??
    (Object.keys(videoContextInfo).length > 0 ? videoContextInfo : undefined) ??
    (Object.keys(documentContextInfo).length > 0 ? documentContextInfo : undefined) ??
    (Object.keys(audioContextInfo).length > 0 ? audioContextInfo : undefined) ??
    {};
  const chat = (data.chat ?? {}) as Record<string, unknown>;
  const rawKey = (raw.key ?? {}) as Record<string, unknown>;

  const jidCandidates = [
    key.remoteJid,
    data.remoteJid,
    data.chatId,
    data.chatJid,
    chat.id,
    contextInfo.remoteJid,
    rawKey.remoteJid,
    raw.groupJid,
    raw.chatId,
    data.from,
    raw.from
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const remoteJid =
    jidCandidates.find((value) => value.endsWith("@g.us")) ??
    jidCandidates[0] ??
    null;

  const participantJid =
    (key.participant as string | undefined) ??
    (data.participant as string | undefined) ??
    (contextInfo.participant as string | undefined) ??
    (raw.participant as string | undefined);

  let messageType: MessageType = MessageType.TEXT;
  let mediaPayload: Record<string, unknown> | null = null;
  let mediaPayloadKey: string | null = null;

  if (Object.keys(stickerMessage).length > 0) {
    messageType = MessageType.IMAGE;
    mediaPayload = stickerMessage;
    mediaPayloadKey = "stickerMessage";
  } else if (Object.keys(imageMessage).length > 0) {
    messageType = MessageType.IMAGE;
    mediaPayload = imageMessage;
    mediaPayloadKey = "imageMessage";
  } else if (Object.keys(videoMessage).length > 0) {
    messageType = MessageType.VIDEO;
    mediaPayload = videoMessage;
    mediaPayloadKey = "videoMessage";
  } else if (Object.keys(documentMessage).length > 0) {
    messageType = MessageType.DOCUMENT;
    mediaPayload = documentMessage;
    mediaPayloadKey = "documentMessage";
  } else if (Object.keys(audioMessage).length > 0) {
    messageType = MessageType.AUDIO;
    mediaPayload = audioMessage;
    mediaPayloadKey = "audioMessage";
  }

  const unsupportedType = detectUnsupportedMessageType(message);
  const unsupportedPlaceholder = unsupportedType && !shouldIgnoreUnsupportedType(unsupportedType)
    ? unsupportedTypePlaceholder(unsupportedType)
    : null;

  const mediaCaption =
    (imageMessage.caption as string | undefined) ??
    (videoMessage.caption as string | undefined) ??
    (documentMessage.caption as string | undefined) ??
    (data.caption as string | undefined) ??
    (raw.caption as string | undefined) ??
    null;

  const text =
    (message.conversation as string | undefined) ??
    (extended.text as string | undefined) ??
    (imageMessage.caption as string | undefined) ??
    (videoMessage.caption as string | undefined) ??
    (documentMessage.caption as string | undefined) ??
    (data.text as string | undefined) ??
    (raw.text as string | undefined) ??
    (mediaPayloadKey === "stickerMessage" ? "[figurinha]" : undefined);

  const mediaMimeType =
    (mediaPayload?.mimetype as string | undefined) ??
    (mediaPayload?.mimeType as string | undefined) ??
    ((data.mimetype as string | undefined) ?? (data.mimeType as string | undefined) ?? null);

  const fallbackMediaCandidates = [
    message.base64,
    rawMessage.base64,
    data.base64,
    raw.base64,
    data.mediaUrl,
    raw.mediaUrl
  ];

  const extractedMedia = mediaPayload
    ? extractMediaSourceFromPayload(mediaPayload, mediaMimeType, fallbackMediaCandidates, {
      preferBase64: true
    })
    : {
      mediaUrl: null,
      sourceKind: "none" as MediaSourceKind,
      encryptedUrlCandidate: null
    };
  const mediaUrl = extractedMedia.mediaUrl;

  const rawMediaFileName =
    (mediaPayload?.fileName as string | undefined) ??
    ((documentMessage.fileName as string | undefined) ?? null);
  const mediaFileName = sanitizeInboundMediaFileName(rawMediaFileName, mediaMimeType, messageType);

  const mediaFileSizeBytes = normalizePositiveInt(
    mediaPayload?.fileLength ?? mediaPayload?.fileSize ?? data.fileLength ?? data.fileSize
  );

  const mediaDurationSeconds = normalizeNonNegativeInt(
    mediaPayload?.seconds ?? mediaPayload?.duration ?? data.seconds ?? data.duration
  );

  const isGroup = Boolean(
    remoteJid?.endsWith("@g.us") ||
    (data.isGroup as boolean | undefined) ||
    (raw.isGroup as boolean | undefined)
  );

  const senderNameCandidate =
    (data.pushName as string | undefined) ??
    (data.participantName as string | undefined) ??
    (raw.pushName as string | undefined) ??
    (raw.senderName as string | undefined) ??
    null;

  const participantPhone = participantJid ? extractPhone(participantJid) : null;
  const senderName =
    senderNameCandidate?.trim() ||
    (isGroup ? participantPhone || "Participante" : "Contato");
  const contactMetadata = extractInboundContactMetadata({
    contactMessage,
    contactsArrayMessage,
    senderName
  });
  const contactText = contactMetadata
    ? [
      "Contato:",
      typeof contactMetadata.name === "string" ? contactMetadata.name : "Contato",
      typeof contactMetadata.phone === "string" ? `(${contactMetadata.phone})` : ""
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    : null;
  const resolvedText = text ?? contactText;

  const groupName =
    (data.groupName as string | undefined) ??
    (data.groupSubject as string | undefined) ??
    (data.subject as string | undefined) ??
    (data.chatName as string | undefined) ??
    (chat.name as string | undefined) ??
    (chat.subject as string | undefined) ??
    (raw.subject as string | undefined) ??
    (raw.groupName as string | undefined) ??
    null;

  const senderAvatarUrl = pickFirstAvatar([
    data.senderProfilePicUrl,
    data.senderAvatarUrl,
    data.participantProfilePicUrl,
    data.participantAvatarUrl,
    data.pushProfilePicture,
    raw.senderAvatarUrl
  ]) ??
    extractAvatarFromPayload(data, [
      "senderProfilePicUrl",
      "senderAvatarUrl",
      "participantProfilePicUrl",
      "participantAvatarUrl",
      "profilePicUrl",
      "profilePictureUrl"
    ]) ??
    extractAvatarFromPayload(raw, [
      "senderProfilePicUrl",
      "senderAvatarUrl",
      "participantProfilePicUrl",
      "participantAvatarUrl",
      "profilePicUrl",
      "profilePictureUrl"
    ]);

  const groupAvatarUrl = pickFirstAvatar([
    data.groupProfilePicUrl,
    data.groupPictureUrl,
    data.groupAvatarUrl,
    raw.groupAvatarUrl
  ]);

  const externalMessageId =
    (key.id as string | undefined) ??
    (data.id as string | undefined) ??
    (raw.id as string | undefined) ??
    null;

  const fromMe = Boolean(
    (key.fromMe as boolean | undefined) ??
    (data.fromMe as boolean | undefined) ??
    (raw.fromMe as boolean | undefined)
  );

  const replyMetadata = extractQuotedReplyMetadata({
    contextInfo,
    senderName
  });
  const mentionedJids = extractMentionedJids(contextInfo);
  const linkPreview = extractLinkPreviewMetadata({
    text: resolvedText,
    extended,
    data,
    raw
  });

  const metadataJson: Record<string, unknown> = {};

  if (mediaPayload) {
    metadataJson.provider = "evolution";
    metadataJson.mediaPayloadKey = mediaPayloadKey;
    metadataJson.mediaKind = mediaPayloadKey === "stickerMessage" ? "sticker" : "media";
    metadataJson.contextInfo = contextInfo;
    metadataJson.hasMediaUrl = Boolean(mediaUrl);
    metadataJson.mediaSourceKind = extractedMedia.sourceKind;
    metadataJson.requiresMediaDecrypt = extractedMedia.sourceKind === "url_encrypted";
    if (extractedMedia.encryptedUrlCandidate) {
      metadataJson.encryptedMediaUrl = extractedMedia.encryptedUrlCandidate;
    }
    if (mediaPayloadKey === "stickerMessage") {
      metadataJson.sticker = extractStickerMetadata(mediaPayload) ?? {
        kind: "sticker"
      };
    }
  }

  if (participantJid) {
    metadataJson.participantJid = participantJid;
  }

  if (mentionedJids.length > 0) {
    metadataJson.mentions = {
      everyOne: false,
      mentioned: mentionedJids
    };
  }

  if (replyMetadata) {
    metadataJson.reply = replyMetadata;
  }

  if (linkPreview) {
    metadataJson.linkPreview = linkPreview;
  }

  if (contactMetadata) {
    metadataJson.contact = contactMetadata;
  }

  if (unsupportedType && !shouldIgnoreUnsupportedType(unsupportedType)) {
    metadataJson.unsupported = {
      type: unsupportedType,
      label: unsupportedTypeLabel(unsupportedType)
    };
  }

  return {
    remoteJid,
    text: resolvedText,
    messageType,
    mediaUrl,
    mediaMimeType,
    mediaFileName,
    mediaFileSizeBytes,
    mediaCaption,
    mediaDurationSeconds,
    metadataJson: Object.keys(metadataJson).length > 0 ? metadataJson : undefined,
    unsupportedType: unsupportedType && !shouldIgnoreUnsupportedType(unsupportedType) ? unsupportedType : null,
    unsupportedPlaceholder,
    senderName,
    participantJid: participantJid ?? null,
    externalMessageId,
    fromMe,
    isGroup,
    groupName,
    senderAvatarUrl,
    groupAvatarUrl
  };
}

function extractPhone(externalId: string) {
  const digits = externalId.replace(/\D/g, "");
  return digits.length > 0 ? digits : externalId;
}

function buildFallbackGroupName(remoteJid: string) {
  const numeric = extractPhone(remoteJid);
  if (!numeric) {
    return "Grupo";
  }
  if (numeric.length <= 8) {
    return `Grupo ${numeric}`;
  }
  return `Grupo ${numeric.slice(-8)}`;
}

function sanitizeGroupName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith("@g.us")) {
    return null;
  }
  return normalized;
}

function sanitizeDirectConversationName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.endsWith("@s.whatsapp.net") ||
    normalized.endsWith("@g.us") ||
    normalized.endsWith("@lid")
  ) {
    return null;
  }

  return normalized;
}

function extractGroupNameFromPayload(payload: unknown) {
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 200) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    const prioritized = [
      obj.subject,
      obj.groupSubject,
      obj.groupName,
      obj.name
    ];

    for (const candidate of prioritized) {
      if (typeof candidate === "string") {
        const sanitized = sanitizeGroupName(candidate);
        if (sanitized) {
          return sanitized;
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function extractGroupAvatarFromPayload(payload: unknown) {
  return extractAvatarFromPayload(payload, [
    "groupProfilePicUrl",
    "groupPictureUrl",
    "groupAvatarUrl"
  ]);
}

function extractProfilePictureFromApiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.profilePictureUrl,
    record.profilePicUrl,
    record.pictureUrl,
    record.avatarUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePictureUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePicUrl
  ];

  return pickFirstAvatar(candidates);
}

function normalizeMentionJid(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function extractMentionedJids(contextInfo: Record<string, unknown>) {
  const nestedContextInfo = asRecord(contextInfo.contextInfo) ?? asRecord(contextInfo.messageContextInfo);
  const candidates = [
    contextInfo.mentionedJid,
    contextInfo.mentioned,
    contextInfo.mentions,
    nestedContextInfo?.mentionedJid,
    nestedContextInfo?.mentioned,
    nestedContextInfo?.mentions
  ];

  const values: string[] = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const item of candidate) {
      if (typeof item !== "string") {
        continue;
      }
      const normalized = normalizeMentionJid(item);
      if (normalized) {
        values.push(normalized);
      }
    }
  }

  return [...new Set(values)];
}

function normalizeJidForCompare(jid: string | null | undefined) {
  const value = jid?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  return value;
}

function isSameParticipant(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeJidForCompare(left);
  const b = normalizeJidForCompare(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const aDigits = extractPhone(a);
  const bDigits = extractPhone(b);
  return Boolean(aDigits && bDigits && aDigits === bDigits);
}

function collectRelatedParticipantRemoteJids(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return [];
  }

  const related = new Set<string>();
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 600) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    const candidateJid =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    if (candidateJid && isSameParticipant(candidateJid, participantJid)) {
      const candidateValues = [
        candidateJid,
        obj.phoneNumber,
        obj.remoteJid,
        obj.phone,
        obj.number,
        obj.pn
      ];

      for (const candidate of candidateValues) {
        if (typeof candidate !== "string" || !candidate.trim()) {
          continue;
        }

        const normalized = normalizeMentionJid(candidate);
        if (normalized) {
          related.add(normalized);
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return [...related];
}

function isWeakDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return true;
  }
  if (normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@g.us") || normalized.endsWith("@lid")) {
    return true;
  }

  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7;
}

function extractParticipantAvatarFromGroupInfo(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return null;
  }

  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 400) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    const candidateJid =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    if (isSameParticipant(candidateJid, participantJid)) {
      const avatar = extractAvatarFromPayload(obj);
      if (avatar) {
        return avatar;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function extractParticipantNameFromGroupInfo(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return null;
  }

  const queue: unknown[] = [payload];
  let depth = 0;
  const candidateKeys = ["subject", "notify", "name", "pushName", "fullName", "verifiedName", "shortName"];

  while (queue.length > 0 && depth < 400) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    const candidateJid =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    if (isSameParticipant(candidateJid, participantJid)) {
      for (const key of candidateKeys) {
        const raw = obj[key];
        if (typeof raw !== "string") {
          continue;
        }

        const normalized = raw.trim();
        if (
          !normalized ||
          normalized.endsWith("@g.us") ||
          normalized.endsWith("@s.whatsapp.net") ||
          normalized.endsWith("@lid")
        ) {
          continue;
        }

        return normalized;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function enrichMentionMetadata(
  metadataValue: unknown,
  options: {
    isGroup: boolean;
    groupInfo: Record<string, unknown> | null;
  }
) {
  const metadataRecord = asRecord(metadataValue);
  if (!metadataRecord) {
    return metadataValue;
  }

  const mentions = asRecord(metadataRecord.mentions);
  if (!mentions) {
    return metadataValue;
  }

  const mentioned = Array.isArray(mentions.mentioned)
    ? [
      ...new Set(
        mentions.mentioned
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => normalizeMentionJid(entry))
          .filter((entry): entry is string => Boolean(entry))
      )
    ]
    : [];

  if (mentioned.length === 0 && !mentions.everyOne) {
    return metadataValue;
  }

  const displayByJid: Record<string, string> = {};
  const displayByPhone: Record<string, string> = {};

  for (const mentionedJid of mentioned) {
    const normalizedJid = normalizeJidForCompare(mentionedJid) ?? mentionedJid;
    const relatedJids = options.isGroup
      ? collectRelatedParticipantRemoteJids(options.groupInfo, normalizedJid)
      : [];
    const aliasJids = [...new Set([normalizedJid, ...relatedJids])];

    const fallbackPhone =
      aliasJids
        .map((entry) => extractPhone(entry))
        .find((entry) => entry.length > 0) ??
      null;

    let displayName: string | null = null;
    if (options.isGroup) {
      for (const aliasJid of aliasJids) {
        const candidateName = extractParticipantNameFromGroupInfo(options.groupInfo, aliasJid);
        if (candidateName) {
          displayName = candidateName;
          break;
        }
      }
    }

    if (!displayName) {
      displayName = fallbackPhone;
    }

    if (!displayName) {
      continue;
    }

    for (const aliasJid of aliasJids) {
      displayByJid[aliasJid] = displayName;

      const aliasPhone = extractPhone(aliasJid);
      if (aliasPhone) {
        displayByPhone[aliasPhone] = displayName;
      }
    }
  }

  const enrichedMentions: Record<string, unknown> = {
    everyOne: Boolean(mentions.everyOne),
    mentioned
  };

  if (Object.keys(displayByJid).length > 0) {
    enrichedMentions.displayByJid = displayByJid;
  }

  if (Object.keys(displayByPhone).length > 0) {
    enrichedMentions.displayByPhone = displayByPhone;
  }

  return {
    ...metadataRecord,
    mentions: enrichedMentions
  };
}

function createEvolutionClient(tenantApiKey: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    return null;
  }

  const apiKey = tenantApiKey ?? env.EVOLUTION_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}

type TenantUserNameCacheEntry = {
  expiresAt: number;
  names: Set<string>;
};

const TENANT_USER_NAME_CACHE_TTL_MS = 5 * 60 * 1000;
const tenantUserNameCache = new Map<string, TenantUserNameCacheEntry>();

function normalizeNameForComparison(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .trim()
      .toLowerCase() ?? ""
  );
}

async function isTenantUserDisplayName(tenantId: string, candidateName: string | null | undefined) {
  const normalizedCandidate = normalizeNameForComparison(candidateName);
  if (!normalizedCandidate) {
    return false;
  }

  const now = Date.now();
  const cached = tenantUserNameCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.names.has(normalizedCandidate);
  }

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { name: true }
  });

  const names = new Set<string>();
  for (const userEntry of users) {
    const normalizedName = normalizeNameForComparison(userEntry.name);
    if (normalizedName) {
      names.add(normalizedName);
    }
  }

  tenantUserNameCache.set(tenantId, {
    expiresAt: now + TENANT_USER_NAME_CACHE_TTL_MS,
    names
  });

  return names.has(normalizedCandidate);
}

async function resolveGroupConversationName(params: {
  incomingGroupName: string | null;
  existingConversationName: string | null;
  remoteJid: string;
  groupInfo: Record<string, unknown> | null;
  senderName: string | null;
  participantJid: string | null;
}) {
  const fromIncoming = sanitizeGroupName(params.incomingGroupName);
  if (fromIncoming) {
    return fromIncoming;
  }

  const fromApi = params.groupInfo ? extractGroupNameFromPayload(params.groupInfo) : null;
  if (fromApi) {
    return fromApi;
  }

  const fromExisting = sanitizeGroupName(params.existingConversationName);
  if (fromExisting) {
    const sender = params.senderName?.trim().toLowerCase() ?? null;
    const existing = fromExisting.trim().toLowerCase();
    const participantPhone = params.participantJid ? extractPhone(params.participantJid) : null;
    const existingPhone = extractPhone(fromExisting);

    const looksLikeParticipantName = Boolean(sender && existing === sender);
    const looksLikeParticipantPhone = Boolean(
      participantPhone &&
      existingPhone &&
      participantPhone.length >= 7 &&
      existingPhone === participantPhone
    );

    if (!looksLikeParticipantName && !looksLikeParticipantPhone) {
      return fromExisting;
    }
  }

  return buildFallbackGroupName(params.remoteJid);
}

function resolveDirectConversationName(params: {
  fromMe: boolean;
  senderName: string | null;
  existingConversationName: string | null;
  existingConversationPhone: string | null;
  remoteJid: string;
  incomingLooksLikeTenantUser: boolean;
}) {
  const fromExisting = sanitizeDirectConversationName(params.existingConversationName);
  const fromIncoming = sanitizeDirectConversationName(params.senderName);
  const fallbackPhone = params.existingConversationPhone ?? extractPhone(params.remoteJid);

  if (params.fromMe) {
    return fromExisting ?? fallbackPhone ?? "Contato";
  }

  if (params.incomingLooksLikeTenantUser) {
    return fromExisting ?? fallbackPhone ?? "Contato";
  }

  // Keep an already-stable direct-contact label to avoid overwriting with
  // operator names when webhook payload is noisy/inconsistent.
  if (fromExisting && !isWeakDisplayName(fromExisting)) {
    return fromExisting;
  }

  return fromIncoming ?? fromExisting ?? fallbackPhone ?? "Contato";
}

function shouldValidateWebhookToken() {
  const token = env.EVOLUTION_WEBHOOK_TOKEN?.trim();
  if (!token) {
    return false;
  }

  if (/^change-this-|^example-|^your-/i.test(token)) {
    return false;
  }

  return true;
}

export async function webhookRoutes(app: FastifyInstance) {
  const handleEvolutionWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({
        tenantSlug: z.string().min(2),
        eventName: z.string().min(2).optional()
      })
      .safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: "Tenant invalido" });
    }

    if (shouldValidateWebhookToken()) {
      const token = request.headers["x-webhook-token"];
      if (token !== env.EVOLUTION_WEBHOOK_TOKEN) {
        return reply.code(401).send({ message: "Token de webhook invalido" });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.data.tenantSlug }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const payload = (request.body ?? {}) as IncomingWebhookPayload;
    const eventName = parseEventName(payload, params.data.eventName);
    const instanceName = extractInstanceName(payload) || tenant.whatsappInstance || "default";
    const webhookCorrelationId = request.correlationId || request.id;
    const isMessageCreateEvent = MESSAGE_CREATE_EVENTS.has(eventName);
    const isMessageUpdateEvent = MESSAGE_UPDATE_EVENTS.has(eventName);

    if (eventName.includes("QRCODE")) {
      const qrCode = extractQrCode(payload);
      if (qrCode) {
        await setLatestQrCode(tenant.id, instanceName, qrCode);
      }

      return reply.code(202).send({
        status: "ok",
        event: eventName,
        hasQrCode: Boolean(qrCode)
      });
    }

    if (eventName && !isMessageCreateEvent && !isMessageUpdateEvent) {
      return reply.code(202).send({
        status: "ignored",
        event: eventName
      });
    }

    const parsedReaction = parseIncomingReaction(payload);
    if (parsedReaction) {
      const reactionConversation = await prisma.conversation.findUnique({
        where: {
          tenantId_externalId_channel: {
            tenantId: tenant.id,
            externalId: parsedReaction.remoteJid,
            channel: ChannelType.WHATSAPP
          }
        }
      });

      if (!reactionConversation) {
        return reply.code(202).send({
          status: "ignored",
          event: eventName,
          reason: "reaction_conversation_not_found"
        });
      }

      const targetMessage = await prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          conversationId: reactionConversation.id,
          externalMessageId: parsedReaction.targetExternalMessageId
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (!targetMessage) {
        return reply.code(202).send({
          status: "ignored",
          event: eventName,
          reason: "reaction_target_not_found"
        });
      }

      const actorJid = normalizeMentionJid(parsedReaction.actorJid ?? "");
      const actorKey = parsedReaction.fromMe
        ? "wa:self"
        : `wa:${actorJid ?? (extractPhone(parsedReaction.actorJid ?? "") || "unknown")}`;
      const nextMetadata = withMessageReactionMetadata({
        metadataJson: targetMessage.metadataJson,
        actorKey,
        actorUserId: null,
        actorName: parsedReaction.actorName,
        actorJid,
        emoji: parsedReaction.emoji,
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
          parsedReaction.targetExternalMessageId ?? webhookCorrelationId,
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
        tenantId: tenant.id,
        payload: {
          ...updatedReactionMessage,
          mediaUrl: sanitizeMediaUrlForRealtime(updatedReactionMessage.mediaUrl),
          correlationId: reactionCorrelationId
        } as unknown as Record<string, unknown>
      });

      return reply.code(202).send({
        status: "ok",
        event: eventName,
        reactionUpdated: true,
        conversationId: reactionConversation.id,
        messageId: targetMessage.id
      });
    }

    if (eventName && !isMessageCreateEvent) {
      return reply.code(202).send({
        status: "ignored",
        event: eventName
      });
    }

    const parsed = parseIncomingMessage(payload);

    if (!parsed.remoteJid) {
      return reply.code(202).send({ message: "Webhook recebido sem identificador de contato" });
    }

    const normalizedText = parsed.text?.trim() ?? "";
    const content =
      normalizedText ||
      parsed.mediaCaption?.trim() ||
      mediaTypeLabel(parsed.messageType) ||
      parsed.unsupportedPlaceholder ||
      "";

    if (!content && parsed.messageType === MessageType.TEXT && !parsed.unsupportedType) {
      return reply.code(202).send({ message: "Webhook recebido sem conteudo suportado" });
    }

    const existingConversation = await prisma.conversation.findUnique({
      where: {
        tenantId_externalId_channel: {
          tenantId: tenant.id,
          externalId: parsed.remoteJid,
          channel: ChannelType.WHATSAPP
        }
      }
    });

    const evolutionClient = createEvolutionClient(tenant.evolutionApiKey);
    let groupInfo: Record<string, unknown> | null = null;
    if (parsed.isGroup) {
      const shouldFetchGroupInfo =
        !sanitizeGroupName(parsed.groupName) ||
        !parsed.groupAvatarUrl ||
        !parsed.senderAvatarUrl ||
        hasMentionTargets(parsed.metadataJson);

      if (shouldFetchGroupInfo && evolutionClient) {
        try {
          groupInfo = await evolutionClient.findGroupInfo(instanceName, parsed.remoteJid);
        } catch {
          groupInfo = null;
        }
      }
    }

    let participantContact: EvolutionContactMatch | null = null;
    if (parsed.isGroup && parsed.participantJid && evolutionClient) {
      const remoteJidCandidates = new Set<string>();

      const normalizedParticipantJid = normalizeMentionJid(parsed.participantJid);
      if (normalizedParticipantJid) {
        remoteJidCandidates.add(normalizedParticipantJid);
      }

      const participantDigits = extractPhone(parsed.participantJid);
      if (participantDigits) {
        remoteJidCandidates.add(`${participantDigits}@s.whatsapp.net`);
      }

      if (groupInfo) {
        for (const relatedJid of collectRelatedParticipantRemoteJids(groupInfo, parsed.participantJid)) {
          remoteJidCandidates.add(relatedJid);
        }
      }

      participantContact = await findContactByRemoteJid(
        evolutionClient,
        instanceName,
        [...remoteJidCandidates]
      );
    }

    let directProfilePictureUrl: string | null = null;
    if (!parsed.isGroup && !parsed.senderAvatarUrl && !existingConversation?.contactAvatarUrl) {
      const number = extractPhone(parsed.remoteJid);
      if (evolutionClient && number) {
        try {
          const profile = await evolutionClient.fetchProfilePictureUrl(instanceName, number);
          directProfilePictureUrl = extractProfilePictureFromApiResponse(profile);
        } catch {
          directProfilePictureUrl = null;
        }
      }
    }

    const messageMetadataJson = enrichMentionMetadata(parsed.metadataJson, {
      isGroup: parsed.isGroup,
      groupInfo
    });

    const senderName = parsed.fromMe
      ? parsed.senderName
      : parsed.isGroup
        ? (isWeakDisplayName(parsed.senderName) ? participantContact?.name ?? parsed.senderName : parsed.senderName)
        : parsed.senderName;

    const incomingLooksLikeTenantUser = !parsed.isGroup && !parsed.fromMe
      ? await isTenantUserDisplayName(tenant.id, parsed.senderName)
      : false;

    const conversationName = parsed.isGroup
      ? await resolveGroupConversationName({
        incomingGroupName: parsed.groupName,
        existingConversationName: existingConversation?.contactName ?? null,
        remoteJid: parsed.remoteJid,
        groupInfo,
        senderName,
        participantJid: parsed.participantJid
      })
      : resolveDirectConversationName({
        fromMe: parsed.fromMe,
        senderName: parsed.senderName,
        existingConversationName: existingConversation?.contactName ?? null,
        existingConversationPhone: existingConversation?.contactPhone ?? null,
        remoteJid: parsed.remoteJid,
        incomingLooksLikeTenantUser
      });

    const conversationAvatarUrl = parsed.isGroup
      ? parsed.groupAvatarUrl ??
      existingConversation?.contactAvatarUrl ??
      (groupInfo ? extractGroupAvatarFromPayload(groupInfo) : null)
      : parsed.fromMe
        ? existingConversation?.contactAvatarUrl ?? directProfilePictureUrl ?? null
        : parsed.senderAvatarUrl ??
        directProfilePictureUrl ??
        existingConversation?.contactAvatarUrl ??
        null;

    let senderAvatarUrl = parsed.senderAvatarUrl ??
      (parsed.isGroup ? extractParticipantAvatarFromGroupInfo(groupInfo, parsed.participantJid) : null) ??
      (parsed.isGroup ? participantContact?.avatarUrl ?? null : null);

    const nextPhone = parsed.isGroup
      ? existingConversation?.contactPhone ?? null
      : extractPhone(parsed.remoteJid);

    const conversation = existingConversation
      ? await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: {
          contactName: conversationName,
          contactAvatarUrl: conversationAvatarUrl,
          contactPhone: nextPhone
        }
      })
      : await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          channel: ChannelType.WHATSAPP,
          externalId: parsed.remoteJid,
          contactName: conversationName,
          contactAvatarUrl: conversationAvatarUrl,
          contactPhone: nextPhone,
          status: ConversationStatus.OPEN,
          lastMessageAt: new Date()
        }
      });

    if (!senderAvatarUrl && !parsed.isGroup && !parsed.fromMe) {
      senderAvatarUrl =
        conversationAvatarUrl ??
        existingConversation?.contactAvatarUrl ??
        directProfilePictureUrl ??
        null;
    }

    if (!senderAvatarUrl && parsed.isGroup && senderName) {
      const lastKnownSenderAvatar = await prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          senderName,
          senderAvatarUrl: {
            not: null
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          senderAvatarUrl: true
        }
      });

      senderAvatarUrl = lastKnownSenderAvatar?.senderAvatarUrl ?? null;
    }

    const direction = parsed.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;
    const mediaMimeType = parsed.mediaMimeType?.trim() || null;
    const mediaFileName = parsed.mediaFileName?.trim() || null;
    const mediaCaption = parsed.mediaCaption?.trim() || null;

    let message =
      parsed.externalMessageId
        ? await prisma.message.findFirst({
          where: {
            tenantId: tenant.id,
            conversationId: conversation.id,
            externalMessageId: parsed.externalMessageId
          },
          orderBy: { createdAt: "desc" }
        })
        : null;

    let messageCreated = false;
    let messageUpdated = false;

    if (!message && parsed.fromMe) {
      const normalizedContent = content.trim();
      const mediaPlaceholder = mediaTypeLabel(parsed.messageType);
      const shouldUseContentAsMediaFingerprint =
        !mediaCaption && normalizedContent.length > 0 && normalizedContent !== mediaPlaceholder;
      const mediaDedupeFilter: Prisma.MessageWhereInput = {
        messageType: {
          in: MEDIA_MESSAGE_TYPES
        },
        ...(mediaFileName
          ? {
            mediaFileName
          }
          : {}),
        ...(parsed.mediaFileSizeBytes
          ? {
            mediaFileSizeBytes: parsed.mediaFileSizeBytes
          }
          : {}),
        ...(mediaMimeType
          ? {
            mediaMimeType
          }
          : {}),
        ...(mediaCaption
          ? {
            OR: [{ mediaCaption }, { content: mediaCaption }]
          }
          : {}),
        ...(shouldUseContentAsMediaFingerprint
          ? {
            content: normalizedContent
          }
          : {})
      };
      const hasStrongMediaFingerprint = Boolean(
        mediaFileName ||
        parsed.mediaFileSizeBytes ||
        mediaMimeType ||
        mediaCaption ||
        shouldUseContentAsMediaFingerprint
      );
      const dedupeWindowMs = parsed.messageType === MessageType.TEXT
        ? 90_000
        : hasStrongMediaFingerprint
          ? 90_000
          : 25_000;
      const dedupeWindowStart = new Date(Date.now() - dedupeWindowMs);
      const maybePendingOutbound = await prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: {
            in: [MessageStatus.PENDING, MessageStatus.SENT, MessageStatus.FAILED]
          },
          // We intentionally do not require `externalMessageId = null` here.
          // Some providers return an outbound id that can differ from webhook echo id.
          // Matching by short time window + content/media fingerprint avoids echo duplicates.
          ...(parsed.messageType === MessageType.TEXT
            ? {
              messageType: MessageType.TEXT,
              content
            }
            : mediaDedupeFilter),
          createdAt: {
            gte: dedupeWindowStart
          }
        },
        orderBy: { createdAt: "desc" }
      });

      if (maybePendingOutbound) {
        message = await prisma.message.update({
          where: { id: maybePendingOutbound.id },
          data: {
            status: MessageStatus.SENT,
            externalMessageId: parsed.externalMessageId ?? maybePendingOutbound.externalMessageId,
            senderAvatarUrl: senderAvatarUrl ?? maybePendingOutbound.senderAvatarUrl,
            mediaUrl: parsed.mediaUrl ?? maybePendingOutbound.mediaUrl,
            mediaMimeType: mediaMimeType ?? maybePendingOutbound.mediaMimeType,
            mediaFileName: mediaFileName ?? maybePendingOutbound.mediaFileName,
            mediaFileSizeBytes: parsed.mediaFileSizeBytes ?? maybePendingOutbound.mediaFileSizeBytes,
            mediaCaption: mediaCaption ?? maybePendingOutbound.mediaCaption,
            mediaDurationSeconds: parsed.mediaDurationSeconds ?? maybePendingOutbound.mediaDurationSeconds,
            metadataJson: mergeMetadataJson(maybePendingOutbound.metadataJson, messageMetadataJson)
          }
        });
        messageUpdated = true;
      }
    }

    if (message && parsed.externalMessageId && !message.externalMessageId) {
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          externalMessageId: parsed.externalMessageId,
          status: MessageStatus.SENT,
          senderAvatarUrl: senderAvatarUrl ?? message.senderAvatarUrl,
          mediaUrl: parsed.mediaUrl ?? message.mediaUrl,
          mediaMimeType: mediaMimeType ?? message.mediaMimeType,
          mediaFileName: mediaFileName ?? message.mediaFileName,
          mediaFileSizeBytes: parsed.mediaFileSizeBytes ?? message.mediaFileSizeBytes,
          mediaCaption: mediaCaption ?? message.mediaCaption,
          mediaDurationSeconds: parsed.mediaDurationSeconds ?? message.mediaDurationSeconds,
          metadataJson: mergeMetadataJson(message.metadataJson, messageMetadataJson)
        }
      });
      messageUpdated = true;
    }

    if (message && message.status !== MessageStatus.SENT) {
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          senderAvatarUrl: senderAvatarUrl ?? message.senderAvatarUrl,
          mediaUrl: parsed.mediaUrl ?? message.mediaUrl,
          mediaMimeType: mediaMimeType ?? message.mediaMimeType,
          mediaFileName: mediaFileName ?? message.mediaFileName,
          mediaFileSizeBytes: parsed.mediaFileSizeBytes ?? message.mediaFileSizeBytes,
          mediaCaption: mediaCaption ?? message.mediaCaption,
          mediaDurationSeconds: parsed.mediaDurationSeconds ?? message.mediaDurationSeconds,
          metadataJson: mergeMetadataJson(message.metadataJson, messageMetadataJson)
        }
      });
      messageUpdated = true;
    }

    if (!senderAvatarUrl && parsed.isGroup && !parsed.fromMe && parsed.participantJid) {
      const participantNumber = participantContact?.phone || extractPhone(parsed.participantJid);
      if (evolutionClient && participantNumber) {
        try {
          const profile = await evolutionClient.fetchProfilePictureUrl(instanceName, participantNumber);
          senderAvatarUrl = extractProfilePictureFromApiResponse(profile);
        } catch {
          senderAvatarUrl = null;
        }
      }
    }

    if (!message) {
      message = await prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction,
          messageType: parsed.messageType,
          senderName,
          senderAvatarUrl,
          content,
          mediaUrl: parsed.mediaUrl,
          mediaMimeType,
          mediaFileName,
          mediaFileSizeBytes: parsed.mediaFileSizeBytes,
          mediaCaption,
          mediaDurationSeconds: parsed.mediaDurationSeconds,
          metadataJson: toPrismaJsonValue(messageMetadataJson),
          status: MessageStatus.SENT,
          externalMessageId: parsed.externalMessageId
        }
      });
      messageCreated = true;
    }

    let messageCorrelationId = getCorrelationIdFromMetadata(message.metadataJson);
    if (!messageCorrelationId) {
      messageCorrelationId = deriveMessageCorrelationId(parsed.externalMessageId ?? webhookCorrelationId, message.id);
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          metadataJson: withCorrelationIdMetadata(message.metadataJson, messageCorrelationId) as Prisma.InputJsonValue
        }
      });
      messageUpdated = true;
    }

    let conversationForEvent = conversation;

    if (messageCreated) {
      conversationForEvent = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.OPEN,
          lastMessageAt: message.createdAt
        }
      });

      await publishEvent({
        type: "message.created",
        tenantId: tenant.id,
        payload: {
          ...message,
          mediaUrl: sanitizeMediaUrlForRealtime(message.mediaUrl),
          correlationId: messageCorrelationId
        } as unknown as Record<string, unknown>
      });
    } else if (messageUpdated) {
      await publishEvent({
        type: "message.updated",
        tenantId: tenant.id,
        payload: {
          ...message,
          mediaUrl: sanitizeMediaUrlForRealtime(message.mediaUrl),
          correlationId: messageCorrelationId
        } as unknown as Record<string, unknown>
      });
    }

    const conversationIdentityChanged =
      !existingConversation ||
      existingConversation.contactName !== conversationForEvent.contactName ||
      existingConversation.contactAvatarUrl !== conversationForEvent.contactAvatarUrl ||
      existingConversation.contactPhone !== conversationForEvent.contactPhone;

    if (messageCreated || conversationIdentityChanged) {
      await publishEvent({
        type: "conversation.updated",
        tenantId: tenant.id,
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
            id: message.id,
            content: message.content,
            messageType: message.messageType,
            mediaUrl: sanitizeMediaUrlForRealtime(message.mediaUrl),
            direction: message.direction,
            status: message.status,
            createdAt: message.createdAt,
            correlationId: messageCorrelationId
          }
        }
      });
    }

    return {
      status: "ok",
      created: messageCreated,
      deduplicated: !messageCreated,
      messageId: message.id,
      conversationId: conversation.id
    };
  };

  app.post("/webhooks/evolution/:tenantSlug", handleEvolutionWebhook);
  app.post("/webhooks/evolution/:tenantSlug/:eventName", handleEvolutionWebhook);
}
