import type { IncomingWebhookPayload } from "./webhook-contracts.js";
import { unwrapMessagePayload } from "./message-parser-text.js";

export interface IncomingMessageStructure {
  raw: IncomingWebhookPayload;
  data: Record<string, unknown>;
  key: Record<string, unknown>;
  rawKey: Record<string, unknown>;
  rawMessage: Record<string, unknown>;
  message: Record<string, unknown>;
  extended: Record<string, unknown>;
  contactMessage: Record<string, unknown>;
  contactsArrayMessage: Record<string, unknown>;
  stickerMessage: Record<string, unknown>;
  imageMessage: Record<string, unknown>;
  audioMessage: Record<string, unknown>;
  videoMessage: Record<string, unknown>;
  documentMessage: Record<string, unknown>;
  contextInfo: Record<string, unknown>;
  chat: Record<string, unknown>;
  remoteJid: string | null;
  participantJid: string | null;
}

export function resolveIncomingMessageStructure(raw: IncomingWebhookPayload): IncomingMessageStructure {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const rawKey = (raw.key ?? {}) as Record<string, unknown>;
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

  const jidCandidates = [
    key.remoteJidAlt,
    data.remoteJidAlt,
    rawKey.remoteJidAlt,
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

  const groupJid = jidCandidates.find((value) => value.endsWith("@g.us"));
  const directPhoneJid = jidCandidates.find((value) => value.endsWith("@s.whatsapp.net"));
  const directLidJid = jidCandidates.find((value) => value.endsWith("@lid"));

  const remoteJid = groupJid ?? directPhoneJid ?? directLidJid ?? jidCandidates[0] ?? null;

  const participantJid =
    (key.participant as string | undefined) ??
    (data.participant as string | undefined) ??
    (contextInfo.participant as string | undefined) ??
    (raw.participant as string | undefined) ??
    null;

  return {
    raw,
    data,
    key,
    rawKey,
    rawMessage,
    message,
    extended,
    contactMessage,
    contactsArrayMessage,
    stickerMessage,
    imageMessage,
    audioMessage,
    videoMessage,
    documentMessage,
    contextInfo,
    chat,
    remoteJid,
    participantJid
  };
}
