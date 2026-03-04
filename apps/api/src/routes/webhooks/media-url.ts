export function normalizeAvatarUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

export function normalizeMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file://")
  ) {
    return trimmed;
  }

  return null;
}

export function isLikelyEncryptedMediaUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes(".enc") || normalized.includes(".enc?")) {
    return true;
  }

  if (normalized.includes("mmg.whatsapp.net") && normalized.includes("mms3=true")) {
    return true;
  }

  if (normalized.includes("/o1/v/t24/")) {
    return true;
  }

  return false;
}

export function sanitizeMediaUrlForRealtime(mediaUrl: string | null) {
  if (!mediaUrl) {
    return null;
  }

  const normalized = mediaUrl.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("data:")) {
    return null;
  }

  return normalized;
}

export function normalizeMediaBase64(value: string, mimeType: string | null) {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length < 32) {
    return null;
  }

  if (cleaned.length > 40_000_000) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
    return null;
  }

  const resolvedMimeType = mimeType?.trim() || "application/octet-stream";
  return `data:${resolvedMimeType};base64,${cleaned}`;
}

export function pickFirstAvatar(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const avatar = normalizeAvatarUrl(candidate);
    if (avatar) {
      return avatar;
    }
  }
  return null;
}

export function extractAvatarFromPayload(payload: unknown, priorityKeys: string[] = []) {
  const queue: unknown[] = [payload];
  let depth = 0;
  const defaultKeys = [
    "profilePicUrl",
    "profilePictureUrl",
    "pictureUrl",
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "imgUrl",
    "thumb"
  ];
  const keys = [...priorityKeys, ...defaultKeys];

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string") {
        const avatar = normalizeAvatarUrl(value);
        if (avatar) {
          return avatar;
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}
