import { randomUUID } from "node:crypto";

const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const CORRELATION_ID_MAX_LENGTH = 120;

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCorrelationId(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > CORRELATION_ID_MAX_LENGTH) {
    return null;
  }

  if (!CORRELATION_ID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function createCorrelationId(prefix = "corr") {
  const safePrefix = normalizeCorrelationId(prefix)?.replace(/[:.]/g, "-") ?? "corr";
  return `${safePrefix}-${randomUUID()}`;
}

export function resolveRequestCorrelationId(rawHeaderValue: unknown, fallbackRequestId: string) {
  if (Array.isArray(rawHeaderValue)) {
    const first = rawHeaderValue.find((entry) => normalizeCorrelationId(entry));
    if (first) {
      return normalizeCorrelationId(first) as string;
    }
  }

  return normalizeCorrelationId(rawHeaderValue) ?? normalizeCorrelationId(fallbackRequestId) ?? createCorrelationId("req");
}

export function deriveMessageCorrelationId(requestOrSeedCorrelationId: unknown, messageId?: string | null) {
  const normalizedSeed = normalizeCorrelationId(requestOrSeedCorrelationId) ?? createCorrelationId("msg");
  const normalizedMessageId = normalizeCorrelationId(messageId);

  if (!normalizedMessageId) {
    return normalizedSeed;
  }

  const shortMessageId = normalizedMessageId.slice(-24);
  const candidate = normalizeCorrelationId(`${normalizedSeed}:${shortMessageId}`);
  if (candidate) {
    return candidate;
  }

  return normalizedSeed;
}

export function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getCorrelationIdFromMetadata(metadata: unknown) {
  const record = asRecord(metadata);
  return normalizeCorrelationId(record?.correlationId);
}

export function withCorrelationIdMetadata(metadata: unknown, correlationId: string) {
  const normalizedCorrelationId = normalizeCorrelationId(correlationId) ?? createCorrelationId("msg");
  const record = asRecord(metadata);
  if (!record) {
    return {
      correlationId: normalizedCorrelationId
    };
  }

  return {
    ...record,
    correlationId: normalizedCorrelationId
  };
}

