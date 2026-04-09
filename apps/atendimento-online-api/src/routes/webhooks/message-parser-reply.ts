import { MessageType } from "@prisma/client";
import { extractPhone } from "./contacts.js";
import { mediaTypeLabel, normalizeMediaUrl } from "./media.js";
import { unwrapMessagePayload } from "./message-parser-text.js";

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function firstNonEmptyString(...candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

function resolveQuotedContainer(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const directQuotedMessage = asRecord(record.quotedMessage);
  if (directQuotedMessage) {
    return directQuotedMessage;
  }

  const nestedMessage = asRecord(record.message);
  if (nestedMessage) {
    const unwrapped = unwrapMessagePayload(nestedMessage);
    return asRecord(unwrapped) ?? nestedMessage;
  }

  const quoted = asRecord(record.quoted);
  if (quoted) {
    return quoted;
  }

  const quotedMsg = asRecord(record.quotedMsg);
  if (quotedMsg) {
    return quotedMsg;
  }

  const quotedData = asRecord(record.quotedData);
  if (quotedData) {
    return quotedData;
  }

  return null;
}

function collectReplyContextCandidates(params: {
  contextInfo: Record<string, unknown>;
  data?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  message?: Record<string, unknown> | null;
  extended?: Record<string, unknown> | null;
}) {
  const candidates: Record<string, unknown>[] = [];
  const pushCandidate = (value: unknown) => {
    const record = asRecord(value);
    if (!record) {
      return;
    }

    candidates.push(record);
  };

  pushCandidate(params.contextInfo);
  pushCandidate(params.extended?.contextInfo);
  pushCandidate(params.message?.messageContextInfo);
  pushCandidate(params.data?.messageContextInfo);
  pushCandidate(params.data?.contextInfo);
  pushCandidate(params.raw?.contextInfo);
  pushCandidate(params.data?.quoted);
  pushCandidate(params.raw?.quoted);
  pushCandidate(params.data?.quote);
  pushCandidate(params.raw?.quote);
  pushCandidate(params.data?.quotedMsg);
  pushCandidate(params.raw?.quotedMsg);
  pushCandidate(params.data?.quotedMessage);
  pushCandidate(params.raw?.quotedMessage);

  return candidates;
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
  data?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  message?: Record<string, unknown> | null;
  extended?: Record<string, unknown> | null;
}) {
  const contextCandidates = collectReplyContextCandidates({
    contextInfo: params.contextInfo,
    data: params.data,
    raw: params.raw,
    message: params.message,
    extended: params.extended
  });

  let sourceContext: Record<string, unknown> | null = null;
  let quotedMessage: Record<string, unknown> | null = null;

  for (const candidate of contextCandidates) {
    const resolvedQuoted = resolveQuotedContainer(candidate);
    if (!resolvedQuoted) {
      continue;
    }

    sourceContext = candidate;
    quotedMessage = resolvedQuoted;
    break;
  }

  if (!quotedMessage || !sourceContext) {
    return null;
  }

  const stanzaId = firstNonEmptyString(
    sourceContext.stanzaId,
    sourceContext.stanza_id,
    sourceContext.quotedMessageId,
    sourceContext.id
  );
  const participantJid =
    firstNonEmptyString(
      sourceContext.participant,
      sourceContext.participantJid,
      sourceContext.remoteJid,
      sourceContext.sender
    ) ??
    null;
  const participantName =
    firstNonEmptyString(
      sourceContext.participantName,
      sourceContext.participant_name,
      sourceContext.pushName,
      sourceContext.senderName
    ) ??
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
