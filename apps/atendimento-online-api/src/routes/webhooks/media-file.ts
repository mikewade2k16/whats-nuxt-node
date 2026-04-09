import { MessageType } from "@prisma/client";

export function parseOptionalInt(value: unknown) {
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

export function normalizePositiveInt(value: unknown) {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function normalizeNonNegativeInt(value: unknown) {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
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

export function sanitizeInboundMediaFileName(
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
