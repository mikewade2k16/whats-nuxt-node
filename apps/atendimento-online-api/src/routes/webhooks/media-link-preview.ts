import type { IncomingWebhookPayload } from "./webhook-contracts.js";
import { asRecord } from "./object-utils.js";
import {
  normalizeMediaBase64,
  normalizeMediaUrl
} from "./media-url.js";

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

export function normalizeLinkPreviewUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractFirstUrlFromText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
  if (!match) {
    return null;
  }

  const rawCandidate = match[0].replace(/[),.!?;:]+$/g, "");
  return normalizeLinkPreviewUrl(rawCandidate);
}

export function normalizeLinkPreviewThumbnail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  const asBase64 = normalizeMediaBase64(trimmed, "image/jpeg");
  if (asBase64) {
    return asBase64;
  }

  return normalizeMediaUrl(trimmed);
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
