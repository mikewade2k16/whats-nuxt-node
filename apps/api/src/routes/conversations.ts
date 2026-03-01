import {
  AuditEventType,
  ChannelType,
  ConversationStatus,
  MessageDirection,
  Prisma,
  MessageStatus,
  MessageType
} from "@prisma/client";
import { isIP } from "node:net";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../lib/correlation.js";
import { requireConversationWrite } from "../lib/guards.js";
import { outboundQueue } from "../queue.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { EvolutionClient } from "../services/evolution-client.js";
import { validateOutboundUpload } from "../services/upload-policy.js";

const createConversationSchema = z.object({
  channel: z.nativeEnum(ChannelType).default(ChannelType.WHATSAPP),
  externalId: z.string().min(3),
  contactName: z.string().optional(),
  contactAvatarUrl: z.string().url().optional(),
  contactPhone: z.string().optional()
});

const sendMessageSchema = z
  .object({
    type: z.nativeEnum(MessageType).default(MessageType.TEXT),
    content: z.string().max(4000).optional(),
    mediaUrl: z.string().min(1).max(60_000_000).optional(),
    mediaMimeType: z.string().max(255).optional(),
    mediaFileName: z.string().max(255).optional(),
    mediaFileSizeBytes: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    mediaCaption: z.string().max(4000).optional(),
    mediaDurationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
    metadataJson: z.record(z.unknown()).optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === MessageType.TEXT) {
      const content = value.content?.trim();
      if (!content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "content e obrigatorio para mensagens de texto",
          path: ["content"]
        });
      }
      return;
    }

    const media = value.mediaUrl?.trim();
    if (!media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mediaUrl e obrigatorio para mensagens de midia",
        path: ["mediaUrl"]
      });
    }
  });

const assignConversationSchema = z.object({
  assignedToId: z.string().nullable()
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus)
});

const reprocessMessageSchema = z.object({
  force: z.boolean().default(false)
});

const reprocessBatchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const reactToMessageSchema = z.object({
  emoji: z.string().max(32).nullable().optional()
});

const messageMediaQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).optional(),
  download: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional()
});

interface GroupParticipantResponse {
  jid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
}

interface EvolutionContactMatch {
  remoteJid: string;
  phone: string;
  name: string | null;
  avatarUrl: string | null;
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

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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
      source: record.source === "whatsapp" ? "whatsapp" : "agent"
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

function normalizeParticipantJid(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function normalizeComparableJid(value: string | null | undefined) {
  const normalized = normalizeParticipantJid(value);
  if (normalized) {
    return normalized;
  }

  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function extractPhone(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "");
}

function normalizeAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image")) {
    return trimmed;
  }

  return null;
}

function resolveParticipantName(rawName: string | null | undefined, fallbackPhone: string) {
  const normalized = rawName?.trim();
  if (normalized && !normalized.endsWith("@s.whatsapp.net") && !normalized.endsWith("@g.us")) {
    const digitsOnly = normalized.replace(/\D/g, "");
    if (digitsOnly.length >= 7 && fallbackPhone && digitsOnly !== fallbackPhone) {
      return fallbackPhone;
    }
    return normalized;
  }

  if (fallbackPhone) {
    return fallbackPhone;
  }

  return "Participante";
}

function mergeParticipantRecord(
  map: Map<string, GroupParticipantResponse>,
  value: {
    jid: string;
    name?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  }
) {
  const normalizedJid = normalizeParticipantJid(value.jid);
  if (!normalizedJid) {
    return;
  }
  if (normalizedJid.endsWith("@g.us")) {
    return;
  }

  const fallbackPhone = extractPhone(value.phone?.trim() ?? null) || extractPhone(normalizedJid);
  const nextName = resolveParticipantName(value.name ?? null, fallbackPhone);
  const nextAvatar = normalizeAvatarUrl(value.avatarUrl ?? null);
  const current = map.get(normalizedJid);

  if (!current) {
    map.set(normalizedJid, {
      jid: normalizedJid,
      phone: fallbackPhone,
      name: nextName,
      avatarUrl: nextAvatar
    });
    return;
  }

  map.set(normalizedJid, {
    jid: normalizedJid,
    phone: (() => {
      const currentPhone = extractPhone(current.phone);
      const jidDigits = extractPhone(normalizedJid);
      const shouldUpgradeFromLidDigits =
        Boolean(currentPhone && jidDigits && currentPhone === jidDigits && fallbackPhone && fallbackPhone !== currentPhone);
      return shouldUpgradeFromLidDigits ? fallbackPhone : current.phone || fallbackPhone;
    })(),
    name: current.name !== current.phone && current.name !== "Participante"
      ? current.name
      : nextName,
    avatarUrl: current.avatarUrl || nextAvatar
  });
}

function parseGroupParticipantsFromPayload(payload: unknown) {
  const participants = new Map<string, GroupParticipantResponse>();
  const queue: unknown[] = [payload];
  let depth = 0;
  const nameKeys = ["subject", "notify", "name", "pushName", "fullName", "verifiedName", "shortName"];
  const avatarKeys = [
    "profilePicUrl",
    "profilePictureUrl",
    "pictureUrl",
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "imgUrl",
    "thumb"
  ];

  while (queue.length > 0 && depth < 700) {
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
    const candidateJidRaw =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    const candidatePhoneRaw =
      (obj.phoneNumber as string | undefined) ??
      (obj.remoteJid as string | undefined) ??
      (obj.phone as string | undefined) ??
      (obj.number as string | undefined) ??
      (obj.pn as string | undefined) ??
      null;

    if (candidateJidRaw || candidatePhoneRaw) {
      const participantJid = (candidateJidRaw ?? candidatePhoneRaw)?.trim();
      if (!participantJid) {
        queue.push(...Object.values(obj));
        continue;
      }

      let resolvedName: string | null = null;
      for (const key of nameKeys) {
        const value = obj[key];
        if (typeof value === "string" && value.trim().length > 0) {
          resolvedName = value.trim();
          break;
        }
      }

      let resolvedAvatar: string | null = null;
      for (const key of avatarKeys) {
        const value = obj[key];
        if (typeof value === "string") {
          const avatar = normalizeAvatarUrl(value);
          if (avatar) {
            resolvedAvatar = avatar;
            break;
          }
        }
      }

      mergeParticipantRecord(participants, {
        jid: participantJid,
        phone: candidatePhoneRaw ?? undefined,
        name: resolvedName,
        avatarUrl: resolvedAvatar
      });
    }

    queue.push(...Object.values(obj));
  }

  return [...participants.values()];
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

  const data = asRecord(record.data);
  if (data && Array.isArray(data.value)) {
    return data.value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
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
      .map((candidate) => normalizeComparableJid(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
  );

  const exactMatch = contacts.find((entry) => {
    const remoteJid = typeof entry.remoteJid === "string" ? entry.remoteJid : "";
    const normalizedRemoteJid = normalizeComparableJid(remoteJid);
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
      const contactPayload = await client.findContacts(instanceName, {
        where: {
          remoteJid
        }
      });
      const contact = selectBestContactMatch(contactPayload, uniqueCandidates);
      if (contact) {
        return contact;
      }
    } catch {
      // best-effort: continue trying other candidates.
    }
  }

  return null;
}

function shouldResolveParticipantName(value: GroupParticipantResponse) {
  const name = value.name.trim();
  if (!name) {
    return true;
  }

  if (name === "Participante") {
    return true;
  }

  const digits = name.replace(/\D/g, "");
  return digits.length >= 7;
}

function isSameParticipantJid(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeComparableJid(left);
  const b = normalizeComparableJid(right);

  if (a && b && a === b) {
    return true;
  }

  const aDigits = extractPhone(a ?? left);
  const bDigits = extractPhone(b ?? right);
  return Boolean(aDigits && bDigits && aDigits === bDigits);
}

function collectRelatedRemoteJidsFromGroupInfo(payload: unknown, participantJid: string) {
  const related = new Set<string>();
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 700) {
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

    if (candidateJid && isSameParticipantJid(candidateJid, participantJid)) {
      const candidates = [
        candidateJid,
        obj.phoneNumber,
        obj.remoteJid,
        obj.phone,
        obj.number,
        obj.pn
      ];

      for (const entry of candidates) {
        if (typeof entry !== "string" || !entry.trim()) {
          continue;
        }

        const normalized = normalizeParticipantJid(entry);
        if (normalized) {
          related.add(normalized);
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return [...related];
}

function createEvolutionClientForTenant(tenantApiKey: string | null) {
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

function mapConversation(conversation: {
  id: string;
  channel: ChannelType;
  status: ConversationStatus;
  externalId: string;
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
    direction: MessageDirection;
    createdAt: Date;
    status: MessageStatus;
    mediaUrl: string | null;
  }>;
}) {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    channel: conversation.channel,
    status: conversation.status,
    externalId: conversation.externalId,
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
          mediaUrl: sanitizeMediaUrlForRealtime(lastMessage.mediaUrl),
          direction: lastMessage.direction,
          status: lastMessage.status,
          createdAt: lastMessage.createdAt
        }
      : null
  };
}

function sanitizeMediaUrlForRealtime(mediaUrl: string | null) {
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

function toRealtimeMessagePayload<
  T extends {
    mediaUrl: string | null;
  }
>(message: T) {
  return {
    ...message,
    mediaUrl: sanitizeMediaUrlForRealtime(message.mediaUrl)
  };
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

function resolveOutboundMessageContent(payload: z.infer<typeof sendMessageSchema>) {
  const text = payload.content?.trim();
  if (text) {
    return text;
  }

  const metadata = asRecord(payload.metadataJson);
  const media = metadata ? asRecord(metadata.media) : null;
  if (media?.sendAsSticker === true) {
    return "[figurinha]";
  }

  const caption = payload.mediaCaption?.trim();
  if (caption) {
    return caption;
  }

  return mediaTypeLabel(payload.type);
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

function sanitizeEncryptedMediaFileName(
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

function resolveMediaDownloadFileName(message: {
  id: string;
  messageType: MessageType;
  mediaFileName: string | null;
  mediaMimeType: string | null;
}) {
  const normalized = sanitizeEncryptedMediaFileName(
    message.mediaFileName,
    message.mediaMimeType,
    message.messageType
  );
  if (normalized) {
    return normalized;
  }

  return `${message.messageType.toLowerCase()}-${message.id}${resolveMediaExtensionByMime(message.mediaMimeType, message.messageType)}`;
}

function sanitizeHeaderFileName(value: string) {
  const sanitized = value
    .replace(/["\\]/g, "")
    .replace(/[\r\n]/g, " ")
    .trim();
  return sanitized || "arquivo.bin";
}

function buildContentDispositionHeader(disposition: "inline" | "attachment", fileName: string) {
  const safeFileName = sanitizeHeaderFileName(fileName);
  const encodedFileName = encodeURIComponent(safeFileName)
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

  return `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}

function decodeDataUrl(mediaUrl: string) {
  if (!mediaUrl.startsWith("data:")) {
    return null;
  }

  const commaIndex = mediaUrl.indexOf(",");
  if (commaIndex <= 5) {
    return null;
  }

  const metadata = mediaUrl.slice(5, commaIndex);
  const payload = mediaUrl.slice(commaIndex + 1);
  const metadataParts = metadata.split(";").map((entry) => entry.trim()).filter(Boolean);
  const mimeType = metadataParts[0] || null;
  const isBase64 = metadataParts.includes("base64");

  try {
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf-8");

    return {
      mimeType,
      buffer
    };
  } catch {
    return null;
  }
}

function normalizeMimeType(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("/") || normalized.includes(" ")) {
    return null;
  }

  return normalized;
}

function normalizeDataUrlCandidate(value: string, fallbackMimeType: string | null) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:")) {
    const parsed = decodeDataUrl(trimmed);
    if (!parsed || parsed.buffer.length === 0) {
      return null;
    }

    return {
      dataUrl: trimmed,
      mimeType: parsed.mimeType ?? fallbackMimeType ?? "application/octet-stream",
      sizeBytes: parsed.buffer.length
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const cleaned = trimmed
    .replace(/^base64[:,]/i, "")
    .replace(/\s+/g, "");

  if (cleaned.length < 128 || !/^[a-z0-9+/=]+$/i.test(cleaned)) {
    return null;
  }

  try {
    const buffer = Buffer.from(cleaned, "base64");
    if (buffer.length === 0) {
      return null;
    }

    const mimeType = fallbackMimeType ?? "application/octet-stream";
    return {
      dataUrl: `data:${mimeType};base64,${cleaned}`,
      mimeType,
      sizeBytes: buffer.length
    };
  } catch {
    return null;
  }
}

function extractEvolutionRehydratedMediaPayload(payload: unknown, fallbackMimeType: string | null) {
  const mimeTypeKeys = ["mimetype", "mimeType", "mediaType", "type", "fileType"];
  const fileNameKeys = ["fileName", "filename", "mediaName", "name", "title"];
  const base64Keys = ["base64", "data", "file", "buffer"];

  const queue: unknown[] = [payload];
  let depth = 0;
  let detectedMimeType = normalizeMimeType(fallbackMimeType);
  let detectedFileName: string | null = null;

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();

    if (typeof current === "string") {
      const normalized = normalizeDataUrlCandidate(current, detectedMimeType);
      if (normalized) {
        return {
          ...normalized,
          fileName: detectedFileName
        };
      }
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const objectEntry = current as Record<string, unknown>;

    for (const key of mimeTypeKeys) {
      const candidate = normalizeMimeType(objectEntry[key]);
      if (candidate) {
        detectedMimeType = candidate;
        break;
      }
    }

    if (!detectedFileName) {
      for (const key of fileNameKeys) {
        const candidate = objectEntry[key];
        if (typeof candidate !== "string") {
          continue;
        }

        const normalized = candidate.trim();
        if (normalized) {
          detectedFileName = normalized.slice(0, 255);
          break;
        }
      }
    }

    for (const key of base64Keys) {
      const candidate = objectEntry[key];
      if (typeof candidate !== "string") {
        continue;
      }

      const normalized = normalizeDataUrlCandidate(candidate, detectedMimeType);
      if (normalized) {
        return {
          ...normalized,
          fileName: detectedFileName
        };
      }
    }

    queue.push(...Object.values(objectEntry));
  }

  return null;
}

function isLikelyEncryptedOrEphemeralMediaUrl(mediaUrl: string | null | undefined) {
  const normalized = mediaUrl?.trim();
  if (!normalized) {
    return false;
  }

  if (/\.enc(?:[?#]|$)/i.test(normalized)) {
    return true;
  }

  try {
    const target = new URL(normalized);
    const hostname = target.hostname.toLowerCase();
    if (hostname.endsWith("mmg.whatsapp.net")) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function isBlockedIpv4Address(hostname: string) {
  const parts = hostname.split(".").map((entry) => Number(entry));
  if (parts.length !== 4 || parts.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }

  return false;
}

function isBlockedIpv6Address(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "::1") {
    return true;
  }

  return normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

function isBlockedMediaProxyHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isBlockedIpv4Address(normalized);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6Address(normalized);
  }

  return false;
}

function normalizeSandboxDestination(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.endsWith("@g.us") || trimmed.endsWith("@broadcast")) {
    return trimmed;
  }

  const [left, suffix] = trimmed.split("@");
  if (suffix === "s.whatsapp.net") {
    const digits = left.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }

  return `${digits}@s.whatsapp.net`;
}

function buildSandboxCandidates(value: string | null | undefined) {
  const set = new Set<string>();
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return set;
  }

  set.add(trimmed);

  const normalized = normalizeSandboxDestination(trimmed);
  if (normalized) {
    set.add(normalized);
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    set.add(digits);
    set.add(`${digits}@s.whatsapp.net`);
  }

  return set;
}

const SANDBOX_ALLOWLIST_RAW_VALUES = env.SANDBOX_ALLOWLIST
  .split(/[,\n;]+/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const SANDBOX_ALLOWLIST_ALL = SANDBOX_ALLOWLIST_RAW_VALUES.some((entry) => entry === "*");

const SANDBOX_ALLOWLIST_SET = (() => {
  const set = new Set<string>();
  for (const entry of SANDBOX_ALLOWLIST_RAW_VALUES) {
    for (const candidate of buildSandboxCandidates(entry)) {
      set.add(candidate);
    }
  }
  return set;
})();

function isSandboxDestinationAllowed(externalId: string) {
  if (!env.SANDBOX_ENABLED) {
    return true;
  }

  if (SANDBOX_ALLOWLIST_ALL) {
    return true;
  }

  if (SANDBOX_ALLOWLIST_SET.size === 0) {
    return false;
  }

  const candidates = buildSandboxCandidates(externalId);
  for (const candidate of candidates) {
    if (SANDBOX_ALLOWLIST_SET.has(candidate)) {
      return true;
    }
  }

  return false;
}

function resolveSandboxTestExternalId() {
  const normalized = normalizeSandboxDestination(env.SANDBOX_TEST_EXTERNAL_ID);
  if (normalized) {
    return normalized;
  }

  return "5511999999999@s.whatsapp.net";
}

export async function conversationRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/conversations", async (request) => {
      const conversations = await prisma.conversation.findMany({
        where: { tenantId: request.authUser.tenantId },
        orderBy: { lastMessageAt: "desc" },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      return conversations.map(mapConversation);
    });

    protectedApp.get("/conversations/sandbox/test", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      if (!env.SANDBOX_ENABLED) {
        return reply.code(400).send({
          message: "Sandbox desativado. Defina SANDBOX_ENABLED=true para usar conversa de teste."
        });
      }

      const externalId = resolveSandboxTestExternalId();
      const contactPhone = extractPhone(externalId) || null;

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel: ChannelType.WHATSAPP
          }
        },
        update: {
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          channel: ChannelType.WHATSAPP,
          externalId,
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

    protectedApp.post("/conversations", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const parsed = createConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const { externalId, channel, contactName, contactAvatarUrl, contactPhone } = parsed.data;

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel
          }
        },
        update: {
          contactName,
          contactAvatarUrl,
          contactPhone,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          channel,
          externalId,
          contactName,
          contactAvatarUrl,
          contactPhone
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

    protectedApp.get("/conversations/:conversationId/messages", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const query = z
        .object({
          limit: z.coerce.number().min(1).max(200).default(100),
          beforeId: z.string().min(1).optional()
        })
        .safeParse(request.query);

      const limit = query.success ? query.data.limit : 100;
      const beforeId = query.success ? query.data.beforeId : undefined;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      let beforeMessageCreatedAt: Date | null = null;
      if (beforeId) {
        const beforeMessage = await prisma.message.findFirst({
          where: {
            id: beforeId,
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id
          },
          select: {
            createdAt: true
          }
        });
        beforeMessageCreatedAt = beforeMessage?.createdAt ?? null;
      }

      const messagesDesc = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          ...(beforeMessageCreatedAt
            ? {
                createdAt: {
                  lt: beforeMessageCreatedAt
                }
              }
            : {})
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const messages = [...messagesDesc].reverse();

      let hasMore = false;
      if (messages.length > 0) {
        const oldest = messages[0];
        const older = await prisma.message.findFirst({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            createdAt: {
              lt: oldest.createdAt
            }
          },
          select: { id: true }
        });
        hasMore = Boolean(older);
      }

      return {
        conversationId: conversation.id,
        messages,
        hasMore
      };
    });

    protectedApp.get("/conversations/:conversationId/messages/:messageId", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          conversationId: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      return message;
    });

    protectedApp.get("/conversations/:conversationId/messages/:messageId/media", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const query = messageMediaQuerySchema.safeParse(request.query ?? {});

      if (!params.success || !query.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          conversationId: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        select: {
          id: true,
          tenantId: true,
          conversationId: true,
          messageType: true,
          direction: true,
          content: true,
          mediaUrl: true,
          mediaMimeType: true,
          mediaFileName: true,
          mediaFileSizeBytes: true,
          metadataJson: true,
          externalMessageId: true,
          senderName: true,
          senderAvatarUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          conversation: {
            select: {
              externalId: true
            }
          }
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      const wantsDownload = query.data.download === true || query.data.download === "true";
      const disposition = query.data.disposition ?? (wantsDownload ? "attachment" : "inline");
      const conversationExternalId = message.conversation.externalId;

      let effectiveMediaUrl = message.mediaUrl?.trim() ?? "";
      let effectiveMediaMimeType = message.mediaMimeType?.trim() || null;
      let effectiveMediaFileName = message.mediaFileName?.trim() || null;
      let effectiveMediaFileSizeBytes = message.mediaFileSizeBytes ?? null;

      const applyMediaResponseHeaders = () => {
        const fileName = resolveMediaDownloadFileName({
          id: message.id,
          messageType: message.messageType,
          mediaFileName: effectiveMediaFileName,
          mediaMimeType: effectiveMediaMimeType
        });
        reply.header("Content-Disposition", buildContentDispositionHeader(disposition, fileName));
        reply.header("Cache-Control", "private, max-age=60");
      };

      let resolvedEvolutionClient: EvolutionClient | null | undefined;
      let resolvedInstanceName = env.EVOLUTION_DEFAULT_INSTANCE || "default";
      let rehydrateAttempted = false;

      const attemptEvolutionRehydrate = async (reason: string) => {
        if (rehydrateAttempted) {
          return false;
        }
        rehydrateAttempted = true;

        if (!message.externalMessageId?.trim()) {
          return false;
        }

        if (resolvedEvolutionClient === undefined) {
          const tenant = await prisma.tenant.findUnique({
            where: {
              id: request.authUser.tenantId
            },
            select: {
              whatsappInstance: true,
              evolutionApiKey: true
            }
          });

          resolvedEvolutionClient = tenant ? createEvolutionClientForTenant(tenant.evolutionApiKey) : null;
          resolvedInstanceName = tenant?.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "default";
        }

        if (!resolvedEvolutionClient) {
          return false;
        }

        const metadata = asRecord(message.metadataJson);
        const participantJid =
          metadata && typeof metadata.participantJid === "string"
            ? metadata.participantJid.trim()
            : "";

        const keyPayload: Record<string, unknown> = {
          id: message.externalMessageId,
          remoteJid: conversationExternalId,
          fromMe: message.direction === MessageDirection.OUTBOUND
        };

        if (participantJid && conversationExternalId.endsWith("@g.us")) {
          keyPayload.participant = participantJid;
        }

        try {
          const evolutionPayload = await resolvedEvolutionClient.getBase64FromMediaMessage(
            resolvedInstanceName,
            {
              message: {
                key: keyPayload
              },
              convertToMp4: false
            },
            env.EVOLUTION_REQUEST_TIMEOUT_MS
          );

          const rehydratedMedia = extractEvolutionRehydratedMediaPayload(
            evolutionPayload,
            effectiveMediaMimeType
          );
          if (!rehydratedMedia) {
            request.log.warn(
              {
                messageId: message.id,
                reason
              },
              "Nao foi possivel extrair base64 da Evolution para reidratacao de midia"
            );
            return false;
          }

          const resolvedMimeType = rehydratedMedia.mimeType || effectiveMediaMimeType || "application/octet-stream";
          const resolvedFileName =
            sanitizeEncryptedMediaFileName(
              rehydratedMedia.fileName ?? effectiveMediaFileName,
              resolvedMimeType,
              message.messageType
            ) ??
            resolveMediaDownloadFileName({
              id: message.id,
              messageType: message.messageType,
              mediaFileName: null,
              mediaMimeType: resolvedMimeType
            });

          const nextMetadata = {
            ...(asRecord(message.metadataJson) ?? {})
          } as Record<string, unknown>;

          if (!nextMetadata.legacyMediaUrl && effectiveMediaUrl) {
            nextMetadata.legacyMediaUrl = effectiveMediaUrl;
          }
          nextMetadata.hasMediaUrl = true;
          nextMetadata.mediaSourceKind = "base64";
          nextMetadata.requiresMediaDecrypt = false;
          nextMetadata.mediaRehydratedAt = new Date().toISOString();
          nextMetadata.mediaRehydratedBy = "conversation-media-proxy";
          nextMetadata.mediaRehydratedReason = reason;

          const updatedMessage = await prisma.message.update({
            where: {
              id: message.id
            },
            data: {
              mediaUrl: rehydratedMedia.dataUrl,
              mediaMimeType: resolvedMimeType,
              mediaFileName: resolvedFileName,
              mediaFileSizeBytes: rehydratedMedia.sizeBytes || effectiveMediaFileSizeBytes,
              metadataJson: nextMetadata as Prisma.InputJsonValue
            }
          });

          effectiveMediaUrl = updatedMessage.mediaUrl?.trim() ?? "";
          effectiveMediaMimeType = updatedMessage.mediaMimeType?.trim() || null;
          effectiveMediaFileName = updatedMessage.mediaFileName?.trim() || null;
          effectiveMediaFileSizeBytes = updatedMessage.mediaFileSizeBytes ?? null;

          await publishEvent({
            type: "message.updated",
            tenantId: request.authUser.tenantId,
            payload: toRealtimeMessagePayload(updatedMessage) as unknown as Record<string, unknown>
          });

          return Boolean(effectiveMediaUrl);
        } catch (error) {
          request.log.warn(
            {
              messageId: message.id,
              reason,
              error: error instanceof Error ? error.message : String(error)
            },
            "Falha ao reidratar midia legada via Evolution"
          );
          return false;
        }
      };

      const metadata = asRecord(message.metadataJson);
      const requiresDecrypt =
        metadata?.requiresMediaDecrypt === true || metadata?.mediaSourceKind === "url_encrypted";
      if (
        (!effectiveMediaUrl || requiresDecrypt || isLikelyEncryptedOrEphemeralMediaUrl(effectiveMediaUrl)) &&
        message.externalMessageId
      ) {
        await attemptEvolutionRehydrate("legacy-media");
      }

      if (!effectiveMediaUrl) {
        return reply.code(404).send({ message: "Midia nao encontrada na mensagem" });
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (effectiveMediaUrl.startsWith("data:")) {
          const parsedDataUrl = decodeDataUrl(effectiveMediaUrl);
          if (!parsedDataUrl) {
            return reply.code(422).send({ message: "Media data URL invalida" });
          }

          applyMediaResponseHeaders();
          const mimeType =
            effectiveMediaMimeType?.trim() || parsedDataUrl.mimeType || "application/octet-stream";
          reply.type(mimeType);
          reply.header("Content-Length", String(parsedDataUrl.buffer.length));
          return reply.send(parsedDataUrl.buffer);
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(effectiveMediaUrl);
        } catch {
          const rehydrated = await attemptEvolutionRehydrate("invalid-url");
          if (rehydrated) {
            continue;
          }
          return reply.code(422).send({ message: "mediaUrl invalida para download" });
        }

        if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
          return reply.code(422).send({ message: "Protocolo de midia nao suportado" });
        }

        if (isBlockedMediaProxyHost(targetUrl.hostname)) {
          return reply.code(403).send({ message: "Host de midia bloqueado por seguranca" });
        }

        let upstreamResponse: Response;
        const timeoutMs = Math.max(10_000, Math.min(env.EVOLUTION_REQUEST_TIMEOUT_MS, 120_000));
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, timeoutMs);
        try {
          upstreamResponse = await fetch(targetUrl.toString(), {
            method: "GET",
            redirect: "follow",
            signal: abortController.signal
          });
        } catch {
          const rehydrated = await attemptEvolutionRehydrate("provider-fetch-failure");
          if (rehydrated) {
            continue;
          }
          return reply.code(502).send({ message: "Falha ao buscar midia no provedor" });
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (!upstreamResponse.ok) {
          const rehydrated = await attemptEvolutionRehydrate(`provider-status-${upstreamResponse.status}`);
          if (rehydrated) {
            continue;
          }
          return reply.code(502).send({
            message: `Provedor de midia respondeu com erro (${upstreamResponse.status})`
          });
        }

        const contentTypeFromProvider = upstreamResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
        const mimeType =
          effectiveMediaMimeType?.trim() || contentTypeFromProvider || "application/octet-stream";
        const payload = Buffer.from(await upstreamResponse.arrayBuffer());
        applyMediaResponseHeaders();
        reply.type(mimeType);
        reply.header("Content-Length", String(payload.length));
        return reply.send(payload);
      }

      return reply.code(502).send({ message: "Falha ao carregar midia da mensagem" });
    });

    protectedApp.get("/conversations/:conversationId/group-participants", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (conversation.channel !== ChannelType.WHATSAPP || !conversation.externalId.endsWith("@g.us")) {
        return reply.code(400).send({ message: "Conversa nao e um grupo WhatsApp" });
      }

      const participantsMap = new Map<string, GroupParticipantResponse>();

      const recentMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 400,
        select: {
          senderName: true,
          senderAvatarUrl: true,
          metadataJson: true
        }
      });

      for (const messageEntry of recentMessages) {
        const metadata = asRecord(messageEntry.metadataJson);
        const participantJidRaw = metadata && typeof metadata.participantJid === "string"
          ? metadata.participantJid
          : null;

        if (participantJidRaw) {
          mergeParticipantRecord(participantsMap, {
            jid: participantJidRaw,
            name: messageEntry.senderName,
            avatarUrl: messageEntry.senderAvatarUrl
          });
        }

        const mentions = metadata ? asRecord(metadata.mentions) : null;
        const mentioned = mentions && Array.isArray(mentions.mentioned)
          ? mentions.mentioned.filter((entry): entry is string => typeof entry === "string")
          : [];
        const displayByJid = mentions ? asRecord(mentions.displayByJid) : null;

        for (const mentionedJid of mentioned) {
          mergeParticipantRecord(participantsMap, {
            jid: mentionedJid,
            name: displayByJid && typeof displayByJid[mentionedJid] === "string"
              ? String(displayByJid[mentionedJid])
              : null
          });
        }
      }

      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      const evolutionClient = tenant ? createEvolutionClientForTenant(tenant.evolutionApiKey) : null;
      const instanceName = tenant?.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "default";
      let groupInfo: Record<string, unknown> | null = null;

      if (evolutionClient) {
        try {
          groupInfo = await evolutionClient.findGroupInfo(instanceName, conversation.externalId);
          const apiParticipants = parseGroupParticipantsFromPayload(groupInfo);
          for (const participant of apiParticipants) {
            mergeParticipantRecord(participantsMap, participant);
          }
        } catch {
          // best-effort: fallback to participant list inferred from message history.
        }
      }

      if (evolutionClient) {
        for (const participant of [...participantsMap.values()]) {
          const normalizedParticipantJid = normalizeParticipantJid(participant.jid);
          if (!normalizedParticipantJid) {
            continue;
          }

          const remoteJidCandidates = new Set<string>();
          if (participant.phone) {
            remoteJidCandidates.add(`${participant.phone}@s.whatsapp.net`);
          }
          remoteJidCandidates.add(normalizedParticipantJid);

          if (groupInfo) {
            for (const relatedJid of collectRelatedRemoteJidsFromGroupInfo(groupInfo, normalizedParticipantJid)) {
              remoteJidCandidates.add(relatedJid);
            }
          }

          if (remoteJidCandidates.size === 0) {
            continue;
          }

          if (!shouldResolveParticipantName(participant) && participant.avatarUrl) {
            continue;
          }

          const contact = await findContactByRemoteJid(evolutionClient, instanceName, [...remoteJidCandidates]);
          if (!contact) {
            continue;
          }

          mergeParticipantRecord(participantsMap, {
            jid: normalizedParticipantJid,
            phone: contact.phone || participant.phone,
            name: contact.name,
            avatarUrl: contact.avatarUrl
          });
        }
      }

      const participants = [...participantsMap.values()]
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));

      return {
        conversationId: conversation.id,
        participants
      };
    });

    protectedApp.post("/conversations/:conversationId/messages", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const body = sendMessageSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: body.error.flatten()
        });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }
      const messageCorrelationId = deriveMessageCorrelationId(request.correlationId);

      if (body.data.type !== MessageType.TEXT) {
        const tenantLimits = await prisma.tenant.findUnique({
          where: { id: request.authUser.tenantId },
          select: {
            maxUploadMb: true
          }
        });

        if (!tenantLimits) {
          return reply.code(404).send({ message: "Tenant nao encontrado" });
        }

        const uploadValidation = validateOutboundUpload(tenantLimits, {
          messageType: body.data.type,
          mediaUrl: body.data.mediaUrl,
          mediaMimeType: body.data.mediaMimeType,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes
        });

        if (!uploadValidation.ok) {
          return reply.code(uploadValidation.error.statusCode).send({
            message: uploadValidation.error.message,
            code: uploadValidation.error.code,
            details: uploadValidation.error.details
          });
        }
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou envio para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const content = resolveOutboundMessageContent(body.data);
      const outboundMetadataWithCorrelation = withCorrelationIdMetadata(
        body.data.metadataJson,
        messageCorrelationId
      );

      const message = await prisma.message.create({
        data: {
          tenant: {
            connect: {
              id: request.authUser.tenantId
            }
          },
          conversation: {
            connect: {
              id: conversation.id
            }
          },
          senderUser: {
            connect: {
              id: request.authUser.sub
            }
          },
          direction: MessageDirection.OUTBOUND,
          messageType: body.data.type,
          senderName: request.authUser.name,
          senderAvatarUrl: null,
          content,
          mediaUrl: body.data.mediaUrl?.trim() || null,
          mediaMimeType: body.data.mediaMimeType?.trim() || null,
          mediaFileName: body.data.mediaFileName?.trim() || null,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes,
          mediaCaption: body.data.mediaCaption?.trim() || null,
          mediaDurationSeconds: body.data.mediaDurationSeconds,
          metadataJson: outboundMetadataWithCorrelation as Prisma.InputJsonValue,
          status: MessageStatus.PENDING
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          status: ConversationStatus.OPEN
        }
      });

      try {
        await outboundQueue.add(
          "send-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: message.id,
            correlationId: messageCorrelationId
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000
            }
          }
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);

        const failed = await prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.created",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(failed) as unknown as Record<string, unknown>),
            correlationId: messageCorrelationId
          }
        });

        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          messageId: failed.id,
          eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
          payloadJson: {
            messageType: failed.messageType,
            provider: "queue",
            stage: "queue_add",
            errorMessage: queueErrorMessage,
            correlationId: messageCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.created",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(message) as unknown as Record<string, unknown>),
          correlationId: messageCorrelationId
        }
      });

      await recordAuditEvent({
        tenantId: request.authUser.tenantId,
        actorUserId: request.authUser.sub,
        conversationId: conversation.id,
        messageId: message.id,
        eventType: AuditEventType.MESSAGE_OUTBOUND_QUEUED,
        payloadJson: {
          messageType: message.messageType,
          status: message.status,
          queuedBy: {
            userId: request.authUser.sub,
            userName: request.authUser.name
          },
          correlationId: messageCorrelationId,
          queue: {
            name: "send-message",
            attempts: 3,
            backoffType: "exponential",
            backoffDelayMs: 2000
          }
        } as Prisma.InputJsonValue
      });

      return message;
    });

    protectedApp.post("/conversations/:conversationId/messages/:messageId/reaction", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reactToMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      const normalizedEmoji = normalizeReactionEmoji(body.data.emoji);
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      if (env.EVOLUTION_BASE_URL) {
        if (!message.externalMessageId) {
          return reply.code(409).send({
            message: "Mensagem ainda sem identificador externo para enviar reacao."
          });
        }

        const instanceName = tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "";
        const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
        if (evolutionClient && instanceName) {
          try {
            await evolutionClient.sendReaction({
              instanceName,
              pathTemplate: env.EVOLUTION_SEND_REACTION_PATH,
              payload: {
                key: {
                  remoteJid: conversation.externalId,
                  fromMe: message.direction === MessageDirection.OUTBOUND,
                  id: message.externalMessageId
                },
                reaction: normalizedEmoji ?? ""
              },
              timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
            });
          } catch (error) {
            request.log.error(
              {
                messageId: message.id,
                conversationId: conversation.id,
                error
              },
              "Falha ao enviar reacao na Evolution"
            );
            return reply.code(502).send({
              message: "Nao foi possivel enviar a reacao para o WhatsApp."
            });
          }
        }
      }

      const nextMetadata = withMessageReactionMetadata({
        metadataJson: message.metadataJson,
        actorKey: `user:${request.authUser.sub}`,
        actorUserId: request.authUser.sub,
        actorName: request.authUser.name,
        actorJid: null,
        emoji: normalizedEmoji,
        source: "agent"
      });

      let updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          metadataJson: nextMetadata as Prisma.InputJsonValue
        }
      });

      const correlationId =
        getCorrelationIdFromMetadata(updated.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, updated.id);

      if (!getCorrelationIdFromMetadata(updated.metadataJson)) {
        updated = await prisma.message.update({
          where: { id: updated.id },
          data: {
            metadataJson: withCorrelationIdMetadata(updated.metadataJson, correlationId) as Prisma.InputJsonValue
          }
        });
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(updated) as unknown as Record<string, unknown>),
          correlationId
        }
      });

      return updated;
    });

    protectedApp.post("/conversations/:conversationId/messages/:messageId/reprocess", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou reprocessamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      if (message.direction !== MessageDirection.OUTBOUND) {
        return reply.code(400).send({ message: "Somente mensagens outbound podem ser reprocessadas" });
      }

      const reprocessCorrelationId =
        getCorrelationIdFromMetadata(message.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, message.id);
      const metadataWithCorrelation = withCorrelationIdMetadata(message.metadataJson, reprocessCorrelationId);

      if (!body.data.force && message.status === MessageStatus.SENT) {
        return reply.code(409).send({
          message: "Mensagem ja enviada. Use force=true para reenviar."
        });
      }

      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.PENDING,
          externalMessageId: null,
          metadataJson: metadataWithCorrelation as Prisma.InputJsonValue
        }
      });

      try {
        await outboundQueue.add(
          "reprocess-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: updated.id,
            correlationId: reprocessCorrelationId
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000
            }
          }
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
        const failed = await prisma.message.update({
          where: { id: updated.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failed.id,
            status: failed.status,
            externalMessageId: failed.externalMessageId,
            updatedAt: failed.updatedAt,
            correlationId: reprocessCorrelationId
          }
        });

        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          messageId: failed.id,
          eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
          payloadJson: {
            messageType: failed.messageType,
            provider: "queue",
            stage: "queue_add_reprocess_single",
            errorMessage: queueErrorMessage,
            correlationId: reprocessCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          id: updated.id,
          status: updated.status,
          externalMessageId: updated.externalMessageId,
          updatedAt: updated.updatedAt,
          correlationId: reprocessCorrelationId
        }
      });

      return updated;
    });

    protectedApp.post("/conversations/:conversationId/messages/reprocess-failed", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessBatchSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou reprocessamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const failedMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED
        },
        orderBy: {
          createdAt: "asc"
        },
        take: body.data.limit
      });

      if (failedMessages.length === 0) {
        return {
          queued: 0,
          totalFailed: 0,
          messageIds: []
        };
      }

      const failedIds = failedMessages.map((entry) => entry.id);
      const queuedIds: string[] = [];
      const failedToQueueIds: string[] = [];
      const now = new Date().toISOString();
      for (const failedMessage of failedMessages) {
        const correlationId =
          getCorrelationIdFromMetadata(failedMessage.metadataJson) ??
          deriveMessageCorrelationId(request.correlationId, failedMessage.id);

        const nextMetadata = withCorrelationIdMetadata(failedMessage.metadataJson, correlationId);

        await prisma.message.update({
          where: { id: failedMessage.id },
          data: {
            status: MessageStatus.PENDING,
            externalMessageId: null,
            metadataJson: nextMetadata as Prisma.InputJsonValue
          }
        });

        try {
          await outboundQueue.add(
            "reprocess-failed-message",
            {
              tenantId: request.authUser.tenantId,
              conversationId: conversation.id,
              messageId: failedMessage.id,
              correlationId
            },
            {
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 2000
              }
            }
          );
          queuedIds.push(failedMessage.id);
        } catch (queueError) {
          const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
          failedToQueueIds.push(failedMessage.id);

          await prisma.message.update({
            where: { id: failedMessage.id },
            data: {
              status: MessageStatus.FAILED
            }
          });

          await publishEvent({
            type: "message.updated",
            tenantId: request.authUser.tenantId,
            payload: {
              id: failedMessage.id,
              status: MessageStatus.FAILED,
              updatedAt: new Date().toISOString(),
              correlationId
            }
          });

          await recordAuditEvent({
            tenantId: request.authUser.tenantId,
            actorUserId: request.authUser.sub,
            conversationId: conversation.id,
            messageId: failedMessage.id,
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            payloadJson: {
              messageType: failedMessage.messageType,
              provider: "queue",
              stage: "queue_add_reprocess_batch",
              errorMessage: queueErrorMessage,
              correlationId
            } as Prisma.InputJsonValue
          });

          continue;
        }

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failedMessage.id,
            status: MessageStatus.PENDING,
            updatedAt: now,
            correlationId
          }
        });
      }

      return {
        queued: queuedIds.length,
        totalFailed: failedIds.length,
        messageIds: queuedIds,
        failedToQueueCount: failedToQueueIds.length,
        failedToQueueMessageIds: failedToQueueIds
      };
    });

    protectedApp.patch("/conversations/:conversationId/assign", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = assignConversationSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      if (body.data.assignedToId) {
        const user = await prisma.user.findFirst({
          where: {
            id: body.data.assignedToId,
            tenantId: request.authUser.tenantId
          }
        });
        if (!user) {
          return reply.code(404).send({ message: "Usuario nao encontrado no tenant" });
        }
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedToId: body.data.assignedToId },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      if (conversation.assignedToId !== updated.assignedToId) {
        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          eventType: AuditEventType.CONVERSATION_ASSIGNED,
          payloadJson: {
            before: {
              assignedToId: conversation.assignedToId
            },
            after: {
              assignedToId: updated.assignedToId
            },
            changedBy: {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }
          } as Prisma.InputJsonValue
        });
      }

      return payload;
    });

    protectedApp.patch("/conversations/:conversationId/status", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = updateStatusSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: body.data.status },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      if (conversation.status !== updated.status) {
        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          eventType: AuditEventType.CONVERSATION_STATUS_CHANGED,
          payloadJson: {
            before: {
              status: conversation.status
            },
            after: {
              status: updated.status
            },
            changedBy: {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }
          } as Prisma.InputJsonValue
        });
      }

      return payload;
    });
  });
}
