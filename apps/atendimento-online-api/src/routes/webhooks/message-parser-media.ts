import type { IncomingWebhookPayload } from "./shared.js";
import {
  extractFirstUrlFromText,
  normalizeLinkPreviewThumbnail,
  normalizeLinkPreviewUrl,
  normalizeMediaBase64,
  normalizeMediaUrl
} from "./media.js";

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

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function extractStickerMetadata(payload: Record<string, unknown>) {
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

  const stickerName = pickString([payload.stickerName, payload.name]);
  const packName = pickString([payload.packName, payload.packname]);
  const author = pickString([payload.stickerAuthor, payload.author, payload.publisher]);
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

export function extractLinkPreviewMetadata(params: {
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

export function normalizeMaybeBase64Thumb(value: string) {
  if (value.startsWith("data:image")) {
    return value;
  }

  return normalizeMediaBase64(value, "image/jpeg") ?? normalizeMediaUrl(value);
}
