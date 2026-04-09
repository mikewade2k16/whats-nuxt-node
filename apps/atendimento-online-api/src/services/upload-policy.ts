import { MessageType } from "@prisma/client";

const MB = 1024 * 1024;
const DEFAULT_UPLOAD_LIMIT_MB = 500;
const MIN_UPLOAD_LIMIT_MB = 1;
const MAX_UPLOAD_LIMIT_MB = 2048;

type MediaMessageType = Exclude<MessageType, "TEXT">;

interface TenantUploadContext {
  maxUploadMb: number;
}

interface UploadValidationInput {
  messageType: MessageType;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFileSizeBytes?: number | null;
}

interface UploadValidationError {
  statusCode: number;
  code: "UPLOAD_LIMIT_EXCEEDED" | "UPLOAD_MIME_INVALID" | "UPLOAD_SIZE_REQUIRED";
  message: string;
  details: {
    messageType: MessageType;
    maxBytes: number;
    maxMb: number;
    maxUploadMb: number;
    actualBytes: number | null;
    actualMb: number | null;
    mediaMimeType: string | null;
    allowedMimePrefixes: string[] | null;
  };
}

export type UploadValidationResult =
  | {
      ok: true;
      maxBytes: number;
      maxMb: number;
      maxUploadMb: number;
      evaluatedSizeBytes: number | null;
      evaluatedSizeMb: number | null;
    }
  | {
      ok: false;
      error: UploadValidationError;
    };

function bytesToMb(value: number) {
  return Math.round((value / MB) * 10) / 10;
}

function normalizeTenantUploadLimitMb(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_UPLOAD_LIMIT_MB;
  }

  const normalized = Math.trunc(value);
  if (normalized < MIN_UPLOAD_LIMIT_MB) {
    return MIN_UPLOAD_LIMIT_MB;
  }

  if (normalized > MAX_UPLOAD_LIMIT_MB) {
    return MAX_UPLOAD_LIMIT_MB;
  }

  return normalized;
}

function inferSizeFromDataUrl(mediaUrl: string | null | undefined) {
  const normalized = mediaUrl?.trim();
  if (!normalized || !normalized.startsWith("data:")) {
    return null;
  }

  const commaIndex = normalized.indexOf(",");
  if (commaIndex <= 0 || commaIndex >= normalized.length - 1) {
    return null;
  }

  const metadata = normalized.slice(0, commaIndex).toLowerCase();
  if (!metadata.includes(";base64")) {
    return null;
  }

  const payload = normalized.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!payload.length) {
    return null;
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function resolveAllowedMimePrefixes(messageType: MediaMessageType) {
  if (messageType === MessageType.IMAGE) {
    return ["image/"];
  }

  if (messageType === MessageType.VIDEO) {
    return ["video/"];
  }

  if (messageType === MessageType.AUDIO) {
    return ["audio/"];
  }

  return null;
}

function matchesMimePrefixes(mediaMimeType: string | null | undefined, prefixes: string[] | null) {
  if (!prefixes || prefixes.length === 0) {
    return true;
  }

  const normalizedMime = mediaMimeType?.trim().toLowerCase();
  if (!normalizedMime) {
    return true;
  }

  return prefixes.some((prefix) => normalizedMime.startsWith(prefix));
}

export function resolveUploadLimitBytes(maxUploadMb: number) {
  return normalizeTenantUploadLimitMb(maxUploadMb) * MB;
}

export function validateOutboundUpload(
  tenantContext: TenantUploadContext,
  payload: UploadValidationInput
): UploadValidationResult {
  const maxUploadMb = normalizeTenantUploadLimitMb(tenantContext.maxUploadMb);

  if (payload.messageType === MessageType.TEXT) {
    return {
      ok: true,
      maxBytes: 0,
      maxMb: 0,
      maxUploadMb,
      evaluatedSizeBytes: null,
      evaluatedSizeMb: null
    };
  }

  const mediaType = payload.messageType as MediaMessageType;
  const maxBytes = resolveUploadLimitBytes(maxUploadMb);
  const maxMb = bytesToMb(maxBytes);
  const allowedMimePrefixes = resolveAllowedMimePrefixes(mediaType);
  const normalizedMimeType = payload.mediaMimeType?.trim().toLowerCase() || null;
  const providedSize =
    typeof payload.mediaFileSizeBytes === "number" && Number.isFinite(payload.mediaFileSizeBytes)
      ? Math.max(0, Math.trunc(payload.mediaFileSizeBytes))
      : null;
  const inferredSize = inferSizeFromDataUrl(payload.mediaUrl);
  const effectiveSize = providedSize ?? inferredSize;
  const effectiveSizeMb = effectiveSize === null ? null : bytesToMb(effectiveSize);

  const sharedDetails = {
    messageType: payload.messageType,
    maxBytes,
    maxMb,
    maxUploadMb,
    actualBytes: effectiveSize,
    actualMb: effectiveSizeMb,
    mediaMimeType: normalizedMimeType,
    allowedMimePrefixes
  };

  if (!matchesMimePrefixes(normalizedMimeType, allowedMimePrefixes)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "UPLOAD_MIME_INVALID",
        message: `Tipo de arquivo invalido para ${mediaType}. Envie um arquivo compativel.`,
        details: sharedDetails
      }
    };
  }

  if (effectiveSize === null) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "UPLOAD_SIZE_REQUIRED",
        message: "Nao foi possivel identificar o tamanho do arquivo. Informe mediaFileSizeBytes no envio.",
        details: sharedDetails
      }
    };
  }

  if (effectiveSize > maxBytes) {
    return {
      ok: false,
      error: {
        statusCode: 413,
        code: "UPLOAD_LIMIT_EXCEEDED",
        message: `Arquivo acima do limite configurado para este tenant (${maxMb}MB).`,
        details: sharedDetails
      }
    };
  }

  return {
    ok: true,
    maxBytes,
    maxMb,
    maxUploadMb,
    evaluatedSizeBytes: effectiveSize,
    evaluatedSizeMb: effectiveSizeMb
  };
}
