import { MessageType } from "@prisma/client";
import { env } from "../../config.js";

const DEFAULT_TEXT_PATH = "/message/sendText/:instance";
const DEFAULT_MEDIA_PATH = "/message/sendMedia/:instance";
const DEFAULT_AUDIO_PATH = "/message/sendWhatsAppAudio/:instance";
const DEFAULT_CONTACT_PATH = "/message/sendContact/:instance";
const DEFAULT_STICKER_PATH = "/message/sendSticker/:instance";

function buildEvolutionUrl(instance: string, template: string) {
  const base = env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }

  const normalizedTemplate = template.trim();
  const resolvedTemplate = normalizedTemplate.length > 0 ? normalizedTemplate : DEFAULT_TEXT_PATH;
  const path = resolvedTemplate.replace(":instance", instance).replace(/^\/+/, "");
  return `${base}/${path}`;
}

export function getEvolutionUrls(instance: string) {
  if (!instance) {
    return {
      textUrl: null,
      mediaUrl: null,
      audioUrl: null,
      contactUrl: null,
      stickerUrl: null
    };
  }

  const textSendPath = env.EVOLUTION_SEND_PATH?.trim() || DEFAULT_TEXT_PATH;
  const mediaSendPath = env.EVOLUTION_SEND_MEDIA_PATH?.trim() || DEFAULT_MEDIA_PATH;
  const audioSendPath = env.EVOLUTION_SEND_AUDIO_PATH?.trim() || DEFAULT_AUDIO_PATH;
  const contactSendPath = env.EVOLUTION_SEND_CONTACT_PATH?.trim() || DEFAULT_CONTACT_PATH;
  const stickerSendPath = env.EVOLUTION_SEND_STICKER_PATH?.trim() || DEFAULT_STICKER_PATH;

  return {
    textUrl: buildEvolutionUrl(instance, textSendPath),
    mediaUrl: buildEvolutionUrl(instance, mediaSendPath),
    audioUrl: buildEvolutionUrl(instance, audioSendPath),
    contactUrl: buildEvolutionUrl(instance, contactSendPath),
    stickerUrl: buildEvolutionUrl(instance, stickerSendPath)
  };
}

export function normalizeRecipient(externalId: string) {
  if (externalId.endsWith("@g.us") || externalId.endsWith("@broadcast")) {
    return externalId;
  }

  const phone = externalId.split("@")[0].replace(/\D/g, "");
  return phone.length > 0 ? phone : externalId;
}

export function toEvolutionMediaType(type: MessageType) {
  switch (type) {
    case MessageType.IMAGE:
      return "image";
    case MessageType.AUDIO:
      return "audio";
    case MessageType.VIDEO:
      return "video";
    case MessageType.DOCUMENT:
      return "document";
    case MessageType.TEXT:
    default:
      return "text";
  }
}

export function isMediaType(type: MessageType) {
  return (
    type === MessageType.IMAGE ||
    type === MessageType.AUDIO ||
    type === MessageType.VIDEO ||
    type === MessageType.DOCUMENT
  );
}

export function isPlaceholderContent(content: string) {
  return ["[imagem]", "[audio]", "[video]", "[documento]", "[figurinha]"].includes(
    content.trim().toLowerCase()
  );
}

export function extractExternalMessageId(responseData: unknown) {
  if (!responseData || typeof responseData !== "object") {
    return undefined;
  }

  const payload = responseData as Record<string, unknown>;
  const key = payload.key as Record<string, unknown> | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  return (
    (key?.id as string | undefined) ??
    (payload.id as string | undefined) ??
    (data?.id as string | undefined) ??
    ((data?.key as Record<string, unknown> | undefined)?.id as string | undefined)
  );
}

export function normalizeMediaForEvolution(mediaSource: string) {
  const trimmed = mediaSource.trim();
  if (!trimmed) {
    return trimmed;
  }

  // Accept additional mime parameters (e.g. data:audio/webm;codecs=opus;base64,...)
  const dataUrlMatch = /^data:[^,]*;base64,(.+)$/i.exec(trimmed);
  if (dataUrlMatch?.[1]) {
    return dataUrlMatch[1];
  }

  return trimmed;
}
