import {
  isLikelyEncryptedMediaUrl,
  normalizeMediaBase64,
  normalizeMediaUrl
} from "./media-url.js";

export type MediaSourceKind = "none" | "base64" | "url" | "url_encrypted";

export interface ExtractMediaSourceResult {
  mediaUrl: string | null;
  sourceKind: MediaSourceKind;
  encryptedUrlCandidate: string | null;
}

export function extractMediaSourceFromPayload(
  payload: unknown,
  mimeType: string | null,
  fallbackCandidates: unknown[] = [],
  options?: {
    preferBase64?: boolean;
  }
): ExtractMediaSourceResult {
  const queue: unknown[] = [payload, ...fallbackCandidates];
  let depth = 0;
  const priorityKeys = options?.preferBase64
    ? ["base64", "data", "media", "url", "mediaUrl", "fileUrl", "downloadUrl", "directPath"]
    : ["url", "mediaUrl", "fileUrl", "downloadUrl", "directPath", "base64", "data", "media"];
  let preferredUrl: string | null = null;
  let encryptedUrlCandidate: string | null = null;

  const captureUrlCandidate = (candidate: string) => {
    if (isLikelyEncryptedMediaUrl(candidate)) {
      if (!encryptedUrlCandidate) {
        encryptedUrlCandidate = candidate;
      }
      return;
    }

    if (!preferredUrl) {
      preferredUrl = candidate;
    }
  };

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      if (typeof current === "string") {
        const normalizedBase64 = normalizeMediaBase64(current, mimeType);
        if (normalizedBase64) {
          return {
            mediaUrl: normalizedBase64,
            sourceKind: "base64",
            encryptedUrlCandidate
          };
        }

        const normalizedUrl = normalizeMediaUrl(current);
        if (normalizedUrl) {
          captureUrlCandidate(normalizedUrl);
          if (!options?.preferBase64 && preferredUrl) {
            return {
              mediaUrl: preferredUrl,
              sourceKind: "url",
              encryptedUrlCandidate
            };
          }
        }
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    for (const key of priorityKeys) {
      const value = obj[key];
      if (typeof value !== "string") {
        continue;
      }

      const normalizedBase64 = normalizeMediaBase64(value, mimeType);
      if (normalizedBase64) {
        return {
          mediaUrl: normalizedBase64,
          sourceKind: "base64",
          encryptedUrlCandidate
        };
      }

      const normalizedUrl = normalizeMediaUrl(value);
      if (normalizedUrl) {
        captureUrlCandidate(normalizedUrl);
        if (!options?.preferBase64 && preferredUrl) {
          return {
            mediaUrl: preferredUrl,
            sourceKind: "url",
            encryptedUrlCandidate
          };
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  if (preferredUrl) {
    return {
      mediaUrl: preferredUrl,
      sourceKind: "url",
      encryptedUrlCandidate
    };
  }

  if (encryptedUrlCandidate) {
    return {
      mediaUrl: encryptedUrlCandidate,
      sourceKind: "url_encrypted",
      encryptedUrlCandidate
    };
  }

  return {
    mediaUrl: null,
    sourceKind: "none",
    encryptedUrlCandidate: null
  };
}
