import axios from "axios";
import { MessageType } from "@prisma/client";
import { env } from "../../config.js";
import { normalizeMediaForEvolution } from "./common.js";
import { extractQuoted } from "./quoted.js";

type SendMediaMessageParams = {
  mediaUrl: string | null;
  audioUrl: string | null;
  stickerUrl: string | null;
  recipient: string;
  conversationExternalId?: string | null;
  messageType: MessageType;
  mediaSource: string;
  caption: string | null;
  fileName: string | null;
  mimeType: string | null;
  metadataJson?: unknown;
  apiKey: string | null | undefined;
};

type EvolutionMediaType = "image" | "video" | "document";

function toEvolutionMediaTypeForMediaEndpoint(type: MessageType): EvolutionMediaType {
  if (type === MessageType.IMAGE) {
    return "image";
  }

  if (type === MessageType.VIDEO) {
    return "video";
  }

  // sendMedia endpoint expects image/video/document. Audio fallback is sent as document.
  return "document";
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeMimeType(mimeType: string | null, mediaType: MessageType, endpointMediaType: EvolutionMediaType) {
  const normalized = mimeType?.trim().toLowerCase() ?? "";

  if (endpointMediaType === "document") {
    if (!normalized) {
      return "application/octet-stream";
    }

    // When document payload carries image/video/audio MIME, Evolution may route to media pipeline
    // (Sharp conversion) and fail for formats such as webp. Force binary MIME for reliability.
    if (normalized.startsWith("image/") || normalized.startsWith("video/") || normalized.startsWith("audio/")) {
      return "application/octet-stream";
    }

    return normalized;
  }

  if (normalized.length > 0) {
    return normalized;
  }

  if (mediaType === MessageType.IMAGE) {
    return "image/jpeg";
  }

  if (mediaType === MessageType.VIDEO) {
    return "video/mp4";
  }

  if (mediaType === MessageType.AUDIO) {
    return "audio/ogg";
  }

  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string) {
  const base = mimeType.split(";")[0] ?? mimeType;
  const slashIndex = base.indexOf("/");
  if (slashIndex === -1) {
    return "bin";
  }

  const extension = base.slice(slashIndex + 1).trim().toLowerCase();
  if (!extension) {
    return "bin";
  }

  // e.g. svg+xml -> svg, vnd.openxmlformats-officedocument... -> bin
  const cleaned = extension.replace(/\+.*$/, "");
  return /^[a-z0-9-]+$/.test(cleaned) ? cleaned : "bin";
}

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim().replace(/[\\/:*?"<>|]+/g, "_");
  if (trimmed.length <= 120) {
    return trimmed;
  }

  const dotIndex = trimmed.lastIndexOf(".");
  const extension = dotIndex > 0 ? trimmed.slice(dotIndex) : "";
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  const maxBaseLength = Math.max(20, 120 - extension.length);

  return `${base.slice(0, maxBaseLength)}${extension}`.slice(0, 120);
}

function defaultFileName(mediaType: MessageType, mimeType: string) {
  if (mediaType === MessageType.IMAGE) {
    return `image.${extensionFromMimeType(mimeType)}`;
  }

  if (mediaType === MessageType.VIDEO) {
    return `video.${extensionFromMimeType(mimeType)}`;
  }

  if (mediaType === MessageType.AUDIO) {
    return `audio.${extensionFromMimeType(mimeType)}`;
  }

  return `document.${extensionFromMimeType(mimeType)}`;
}

function buildMediaPayload(params: {
  recipient: string;
  conversationExternalId?: string | null;
  mediaType: MessageType;
  mediaSource: string;
  caption: string | null;
  fileName: string | null;
  mimeType: string | null;
  metadataJson?: unknown;
}) {
  const mediaType = toEvolutionMediaTypeForMediaEndpoint(params.mediaType);
  const normalizedMimeType = normalizeMimeType(params.mimeType, params.mediaType, mediaType);
  const fallbackFileName = defaultFileName(params.mediaType, normalizedMimeType);
  const normalizedFileName = sanitizeFileName(params.fileName?.trim() || fallbackFileName);
  const quoted = extractQuoted(params.metadataJson, params.conversationExternalId?.trim() || null);

  const payload: Record<string, unknown> = {
    number: params.recipient,
    media: normalizeMediaForEvolution(params.mediaSource),
    mediatype: mediaType,
    mediaType,
    fileName: normalizedFileName,
    mimetype: normalizedMimeType,
    caption: params.caption ?? ""
  };

  if (quoted) {
    payload.quoted = quoted;
  }

  return payload;
}

function buildAudioPayload(params: {
  recipient: string;
  conversationExternalId?: string | null;
  mediaSource: string;
  fileName: string | null;
  mimeType: string | null;
  ptt: boolean;
  metadataJson?: unknown;
}) {
  const normalizedMedia = normalizeMediaForEvolution(params.mediaSource);
  const normalizedMimeType = params.mimeType?.trim().toLowerCase() || "audio/ogg";
  const fallbackFileName = defaultFileName(MessageType.AUDIO, normalizedMimeType);
  const normalizedFileName = sanitizeFileName(params.fileName?.trim() || fallbackFileName);
  const quoted = extractQuoted(params.metadataJson, params.conversationExternalId?.trim() || null);

  const payload: Record<string, unknown> = {
    number: params.recipient,
    audio: normalizedMedia,
    media: normalizedMedia,
    ptt: params.ptt,
    fileName: normalizedFileName,
    mimetype: normalizedMimeType
  };

  if (quoted) {
    payload.quoted = quoted;
  }

  return payload;
}

function resolveAudioPtt(metadataJson: unknown) {
  const metadata = asRecord(metadataJson);
  const media = metadata ? asRecord(metadata.media) : null;
  return media?.sendAsVoiceNote === true;
}

function buildStickerPayload(recipient: string, mediaSource: string) {
  const normalizedMedia = normalizeMediaForEvolution(mediaSource);
  return {
    number: recipient,
    sticker: normalizedMedia
  };
}

function shouldRetryAudioWithGenericMedia(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  return status === 400 || status === 404 || status === 405 || status === 422;
}

function shouldUseAudioEndpoint(mimeType: string | null, fileName: string | null) {
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalizedFileName = fileName?.trim().toLowerCase() ?? "";

  if (normalizedMime.startsWith("audio/")) {
    return true;
  }

  const knownAudioExtensions = [
    ".ogg",
    ".oga",
    ".opus",
    ".webm",
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".flac",
    ".wma"
  ];

  if (knownAudioExtensions.some((extension) => normalizedFileName.endsWith(extension))) {
    return true;
  }

  return false;
}

export async function sendMediaMessage(params: SendMediaMessageParams) {
  if (params.messageType === MessageType.IMAGE) {
    return sendImageMessage(params);
  }

  if (params.messageType === MessageType.VIDEO) {
    return sendVideoMessage(params);
  }

  if (params.messageType === MessageType.DOCUMENT) {
    return sendDocumentMessage(params);
  }

  return sendAudioMessage(params);
}

function buildRequestConfig(apiKey: string | null | undefined) {
  const requestConfig = {
    headers: apiKey
      ? {
          apikey: apiKey
        }
      : undefined,
    timeout: env.EVOLUTION_REQUEST_TIMEOUT_MS
  };

  return requestConfig;
}

function ensureMediaEndpoint(mediaUrl: string | null) {
  if (!mediaUrl) {
    throw new Error("EVOLUTION_SEND_MEDIA_PATH nao configurado");
  }

  return mediaUrl;
}

async function sendByMediaEndpoint(params: SendMediaMessageParams, messageType: MessageType) {
  const response = await axios.post(
    ensureMediaEndpoint(params.mediaUrl),
      buildMediaPayload({
        recipient: params.recipient,
        conversationExternalId: params.conversationExternalId,
        mediaType: messageType,
        mediaSource: params.mediaSource,
        caption: params.caption,
        fileName: params.fileName,
        mimeType: params.mimeType,
        metadataJson: params.metadataJson
      }),
      buildRequestConfig(params.apiKey)
    );

  return response.data;
}

export async function sendImageMessage(params: SendMediaMessageParams) {
  return sendByMediaEndpoint(params, MessageType.IMAGE);
}

export async function sendVideoMessage(params: SendMediaMessageParams) {
  return sendByMediaEndpoint(params, MessageType.VIDEO);
}

export async function sendDocumentMessage(params: SendMediaMessageParams) {
  return sendByMediaEndpoint(params, MessageType.DOCUMENT);
}

async function sendAudioAsDocumentMessage(params: SendMediaMessageParams) {
  return sendByMediaEndpoint(params, MessageType.AUDIO);
}

export async function sendAudioMessage(params: SendMediaMessageParams) {
  if (!shouldUseAudioEndpoint(params.mimeType, params.fileName) || !params.audioUrl) {
    return sendAudioAsDocumentMessage(params);
  }

  try {
    const response = await axios.post(
      params.audioUrl,
      buildAudioPayload({
        recipient: params.recipient,
        conversationExternalId: params.conversationExternalId,
        mediaSource: params.mediaSource,
        fileName: params.fileName,
        mimeType: params.mimeType,
        ptt: resolveAudioPtt(params.metadataJson),
        metadataJson: params.metadataJson
      }),
      buildRequestConfig(params.apiKey)
    );
    return response.data;
  } catch (error) {
    if (!params.mediaUrl || !shouldRetryAudioWithGenericMedia(error)) {
      throw error;
    }
  }

  return sendAudioAsDocumentMessage(params);
}

export async function sendStickerMessage(params: SendMediaMessageParams) {
  if (!params.stickerUrl) {
    return sendImageMessage(params);
  }

  try {
    const response = await axios.post(
      params.stickerUrl,
      buildStickerPayload(params.recipient, params.mediaSource),
      buildRequestConfig(params.apiKey)
    );
    return response.data;
  } catch {
    // Some providers reject sticker endpoint for specific media; fallback keeps outbound stable.
    return sendImageMessage(params);
  }
}
