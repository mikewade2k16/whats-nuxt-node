import { extractAvatarFromPayload } from "./media.js";
import {
  isSameParticipant,
  normalizeJidForCompare,
  normalizeMentionJid
} from "./participant-identity.js";

function resolveParticipantCandidateJid(obj: Record<string, unknown>) {
  return (
    (obj.id as string | undefined) ??
    (obj.jid as string | undefined) ??
    (obj.participant as string | undefined) ??
    (obj.user as string | undefined) ??
    (obj.lid as string | undefined) ??
    null
  );
}

export function collectRelatedParticipantRemoteJids(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return [];
  }

  const normalizedParticipantJid = normalizeJidForCompare(participantJid) ?? participantJid;
  const related = new Set<string>();
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 600) {
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
    const candidateJid = resolveParticipantCandidateJid(obj);

    if (candidateJid && isSameParticipant(candidateJid, normalizedParticipantJid)) {
      const candidateValues = [candidateJid, obj.phoneNumber, obj.remoteJid, obj.phone, obj.number, obj.pn];

      for (const candidate of candidateValues) {
        if (typeof candidate !== "string" || !candidate.trim()) {
          continue;
        }

        const normalized = normalizeMentionJid(candidate);
        if (normalized) {
          related.add(normalized);
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return [...related];
}

export function extractParticipantAvatarFromGroupInfo(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return null;
  }

  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 400) {
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
    const candidateJid = resolveParticipantCandidateJid(obj);

    if (isSameParticipant(candidateJid, participantJid)) {
      const avatar = extractAvatarFromPayload(obj);
      if (avatar) {
        return avatar;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

export function extractParticipantNameFromGroupInfo(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return null;
  }

  const queue: unknown[] = [payload];
  let depth = 0;
  const candidateKeys = ["subject", "notify", "name", "pushName", "fullName", "verifiedName", "shortName"];

  while (queue.length > 0 && depth < 400) {
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
    const candidateJid = resolveParticipantCandidateJid(obj);

    if (isSameParticipant(candidateJid, participantJid)) {
      for (const key of candidateKeys) {
        const raw = obj[key];
        if (typeof raw !== "string") {
          continue;
        }

        const normalized = raw.trim();
        if (
          !normalized ||
          normalized.endsWith("@g.us") ||
          normalized.endsWith("@s.whatsapp.net") ||
          normalized.endsWith("@lid")
        ) {
          continue;
        }

        return normalized;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}
