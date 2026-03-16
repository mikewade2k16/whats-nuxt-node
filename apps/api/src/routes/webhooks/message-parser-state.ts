import { MessageType } from "@prisma/client";
import { extractPhone } from "./contacts.js";
import {
  extractAvatarFromPayload,
  extractMediaSourceFromPayload,
  normalizeNonNegativeInt,
  normalizePositiveInt,
  pickFirstAvatar,
  sanitizeInboundMediaFileName
} from "./media.js";
import { extractMentionedJids } from "./mentions.js";
import {
  detectUnsupportedMessageType,
  shouldIgnoreUnsupportedType,
  unsupportedTypeLabel,
  unsupportedTypePlaceholder
} from "./message-parser-text.js";
import {
  extractLinkPreviewMetadata,
  extractStickerMetadata
} from "./message-parser-media.js";
import { extractInboundContactMetadata } from "./message-parser-contact.js";
import { extractQuotedReplyMetadata } from "./message-parser-reply.js";
import type { IncomingMessageStructure } from "./message-parser-context.js";

function parseNumericTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const low = typeof record.low === "number" && Number.isFinite(record.low) ? record.low : null;
  const high = typeof record.high === "number" && Number.isFinite(record.high) ? record.high : 0;
  if (low === null) {
    return null;
  }

  return (high * 4_294_967_296) + (low >>> 0);
}

function resolveMessageTimestampDate(candidates: unknown[]) {
  for (const candidate of candidates) {
    const numeric = parseNumericTimestamp(candidate);
    if (numeric === null) {
      continue;
    }

    const asMilliseconds = numeric > 1_000_000_000_000 ? numeric : numeric > 1_000_000_000 ? numeric * 1_000 : null;
    if (!asMilliseconds) {
      continue;
    }

    const date = new Date(asMilliseconds);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function resolveIncomingMessageState(structure: IncomingMessageStructure) {
  const {
    raw,
    data,
    key,
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
  } = structure;

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
  const normalizedMediaMimeType = mediaMimeType?.trim().toLowerCase() ?? "";
  const isAudioFileDocument =
    mediaPayloadKey === "documentMessage" &&
    normalizedMediaMimeType.startsWith("audio/");
  const isVoiceNoteAudio =
    mediaPayloadKey === "audioMessage" &&
    mediaPayload?.ptt === true;

  const fallbackMediaCandidates = [
    message.base64,
    structure.rawMessage.base64,
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
        sourceKind: "none" as const,
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
  const hasContactsArrayPayload =
    Array.isArray(contactsArrayMessage.contacts) &&
    contactsArrayMessage.contacts.length > 0;
  const hasContactMessagePayload = Object.keys(contactMessage).length > 0;
  const hasExplicitContactPayload = hasContactMessagePayload || hasContactsArrayPayload;
  const hasRegularTextPayload = Boolean(text && text.trim().length > 0);
  const shouldResolveContactMetadata =
    hasExplicitContactPayload &&
    !mediaPayload &&
    !hasRegularTextPayload;

  const contactMetadata = shouldResolveContactMetadata
    ? extractInboundContactMetadata({
        contactMessage,
        contactsArrayMessage,
        senderName
      })
    : null;
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

  const messageTimestamp = resolveMessageTimestampDate([
    data.messageTimestamp,
    raw.messageTimestamp,
    data.messageTimestampMs,
    raw.messageTimestampMs
  ]);

  const replyMetadata = extractQuotedReplyMetadata({
    contextInfo,
    senderName,
    data,
    raw,
    message,
    extended
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
    metadataJson.mediaKind =
      mediaPayloadKey === "stickerMessage"
        ? "sticker"
        : isVoiceNoteAudio
          ? "voice_note"
          : isAudioFileDocument
            ? "audio_file"
            : "media";
    metadataJson.contextInfo = contextInfo;
    metadataJson.hasMediaUrl = Boolean(mediaUrl);
    metadataJson.mediaSourceKind = extractedMedia.sourceKind;
    metadataJson.requiresMediaDecrypt = extractedMedia.sourceKind === "url_encrypted";
    if (mediaPayloadKey === "audioMessage") {
      metadataJson.audio = {
        voiceNote: isVoiceNoteAudio
      };
    }
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
    groupAvatarUrl,
    messageTimestamp
  };
}
