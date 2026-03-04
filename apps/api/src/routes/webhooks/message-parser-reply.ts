import { MessageType } from "@prisma/client";
import { extractPhone } from "./contacts.js";
import { mediaTypeLabel, normalizeMediaUrl } from "./media.js";

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

export function extractQuotedReplyMetadata(params: {
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
