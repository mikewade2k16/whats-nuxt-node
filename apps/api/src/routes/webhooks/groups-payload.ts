import { extractPhone } from "./participant-identity.js";
import { extractAvatarFromPayload } from "./media.js";

export function buildFallbackGroupName(remoteJid: string) {
  const numeric = extractPhone(remoteJid);
  if (!numeric) {
    return "Grupo";
  }
  if (numeric.length <= 8) {
    return `Grupo ${numeric}`;
  }
  return `Grupo ${numeric.slice(-8)}`;
}

export function sanitizeGroupName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith("@g.us")) {
    return null;
  }
  return normalized;
}

export function extractGroupNameFromPayload(payload: unknown) {
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 200) {
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
    const prioritized = [obj.subject, obj.groupSubject, obj.groupName, obj.name];

    for (const candidate of prioritized) {
      if (typeof candidate !== "string") {
        continue;
      }

      const sanitized = sanitizeGroupName(candidate);
      if (sanitized) {
        return sanitized;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

export function extractGroupAvatarFromPayload(payload: unknown) {
  return extractAvatarFromPayload(payload, ["groupProfilePicUrl", "groupPictureUrl", "groupAvatarUrl"]);
}
