import { MessageType } from "@prisma/client";
import { asRecord } from "./object-utils.js";

interface OutboundMessagePayloadLike {
  type: MessageType;
  content?: string;
  mediaCaption?: string;
  metadataJson?: Record<string, unknown> | null | undefined;
}

export function mediaTypeLabel(type: MessageType) {
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

export function resolveOutboundMessageContent(payload: OutboundMessagePayloadLike) {
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

export function resolveMediaExtensionByMime(mimeType: string | null, messageType: MessageType) {
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

export function sanitizeEncryptedMediaFileName(
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

export function resolveMediaDownloadFileName(message: {
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

export function sanitizeHeaderFileName(value: string) {
  const sanitized = value
    .replace(/["\\]/g, "")
    .replace(/[\r\n]/g, " ")
    .trim();
  return sanitized || "arquivo.bin";
}

export function buildContentDispositionHeader(disposition: "inline" | "attachment", fileName: string) {
  const safeFileName = sanitizeHeaderFileName(fileName);
  const encodedFileName = encodeURIComponent(safeFileName)
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

  return `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
}

export function decodeDataUrl(mediaUrl: string) {
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

export function normalizeMimeType(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("/") || normalized.includes(" ")) {
    return null;
  }

  return normalized;
}

function normalizeMimeTypeWithParameters(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/;\s+/g, ";");
  if (!normalized) {
    return null;
  }

  const mimeBase = normalized.split(";")[0]?.trim() ?? "";
  if (!mimeBase || !mimeBase.includes("/") || mimeBase.includes(" ")) {
    return null;
  }

  return normalized;
}

function resolveMimeTypeFromFileName(fileName: string | null | undefined) {
  const normalized = fileName?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  const sanitized = normalized.replace(/[?#].*$/, "");
  const extension = sanitized.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() ?? "";
  if (!extension) {
    return null;
  }

  const extensionMimeMap: Record<string, string> = {
    aac: "audio/aac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mpga: "audio/mpeg",
    oga: "audio/ogg",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    wav: "audio/wav",
    weba: "audio/webm",
    webm: "audio/webm"
  };

  return extensionMimeMap[extension] ?? null;
}

export function resolveEffectiveMediaMimeType(params: {
  messageType: MessageType;
  mediaMimeType: string | null | undefined;
  mediaFileName?: string | null | undefined;
  metadataJson?: unknown;
  fallbackMimeType?: string | null | undefined;
}) {
  const explicitMimeType = normalizeMimeTypeWithParameters(params.mediaMimeType);
  const explicitMimeBase = normalizeMimeType(params.mediaMimeType);
  if (explicitMimeType && explicitMimeBase !== "application/octet-stream") {
    return explicitMimeType;
  }

  const fallbackMimeType = normalizeMimeTypeWithParameters(params.fallbackMimeType);
  const fallbackMimeBase = normalizeMimeType(params.fallbackMimeType);
  if (fallbackMimeType && fallbackMimeBase !== "application/octet-stream") {
    return fallbackMimeType;
  }

  const fileNameMimeType = resolveMimeTypeFromFileName(params.mediaFileName);
  if (fileNameMimeType) {
    return fileNameMimeType;
  }

  const metadata = asRecord(params.metadataJson);
  const audioMetadata = metadata ? asRecord(metadata.audio) : null;
  const mediaKind = typeof metadata?.mediaKind === "string" ? metadata.mediaKind.trim().toLowerCase() : "";
  if (params.messageType === MessageType.AUDIO) {
    if (audioMetadata?.voiceNote === true || mediaKind === "voice_note") {
      return "audio/ogg";
    }

    return "audio/ogg";
  }

  return explicitMimeType || fallbackMimeType || "application/octet-stream";
}

export function normalizeDataUrlCandidate(value: string, fallbackMimeType: string | null) {
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

export function extractEvolutionRehydratedMediaPayload(payload: unknown, fallbackMimeType: string | null) {
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

export function isLikelyEncryptedOrEphemeralMediaUrl(mediaUrl: string | null | undefined) {
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


