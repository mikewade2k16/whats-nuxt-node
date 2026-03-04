import { env } from "../../config.js";
import { EvolutionClient } from "../../services/evolution-client.js";
import type {
  EvolutionContactMatch,
  GroupParticipantResponse
} from "./types.js";
import { asRecord } from "./object-utils.js";

export function normalizeParticipantJid(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

export function normalizeComparableJid(value: string | null | undefined) {
  const normalized = normalizeParticipantJid(value);
  if (normalized) {
    return normalized;
  }

  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

export function extractPhone(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "");
}

export function normalizeAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image")) {
    return trimmed;
  }

  return null;
}

export function resolveParticipantName(rawName: string | null | undefined, fallbackPhone: string) {
  const normalized = rawName?.trim();
  if (normalized && !normalized.endsWith("@s.whatsapp.net") && !normalized.endsWith("@g.us")) {
    const digitsOnly = normalized.replace(/\D/g, "");
    if (digitsOnly.length >= 7 && fallbackPhone && digitsOnly !== fallbackPhone) {
      return fallbackPhone;
    }
    return normalized;
  }

  if (fallbackPhone) {
    return fallbackPhone;
  }

  return "Participante";
}

export function mergeParticipantRecord(
  map: Map<string, GroupParticipantResponse>,
  value: {
    jid: string;
    name?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  }
) {
  const normalizedJid = normalizeParticipantJid(value.jid);
  if (!normalizedJid) {
    return;
  }
  if (normalizedJid.endsWith("@g.us")) {
    return;
  }

  const fallbackPhone = extractPhone(value.phone?.trim() ?? null) || extractPhone(normalizedJid);
  const nextName = resolveParticipantName(value.name ?? null, fallbackPhone);
  const nextAvatar = normalizeAvatarUrl(value.avatarUrl ?? null);
  const current = map.get(normalizedJid);

  if (!current) {
    map.set(normalizedJid, {
      jid: normalizedJid,
      phone: fallbackPhone,
      name: nextName,
      avatarUrl: nextAvatar
    });
    return;
  }

  map.set(normalizedJid, {
    jid: normalizedJid,
    phone: (() => {
      const currentPhone = extractPhone(current.phone);
      const jidDigits = extractPhone(normalizedJid);
      const shouldUpgradeFromLidDigits =
        Boolean(currentPhone && jidDigits && currentPhone === jidDigits && fallbackPhone && fallbackPhone !== currentPhone);
      return shouldUpgradeFromLidDigits ? fallbackPhone : current.phone || fallbackPhone;
    })(),
    name: current.name !== current.phone && current.name !== "Participante"
      ? current.name
      : nextName,
    avatarUrl: current.avatarUrl || nextAvatar
  });
}

export function parseGroupParticipantsFromPayload(payload: unknown) {
  const participants = new Map<string, GroupParticipantResponse>();
  const queue: unknown[] = [payload];
  let depth = 0;
  const nameKeys = ["subject", "notify", "name", "pushName", "fullName", "verifiedName", "shortName"];
  const avatarKeys = [
    "profilePicUrl",
    "profilePictureUrl",
    "pictureUrl",
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "imgUrl",
    "thumb"
  ];

  while (queue.length > 0 && depth < 700) {
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
    const candidateJidRaw =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    const candidatePhoneRaw =
      (obj.phoneNumber as string | undefined) ??
      (obj.remoteJid as string | undefined) ??
      (obj.phone as string | undefined) ??
      (obj.number as string | undefined) ??
      (obj.pn as string | undefined) ??
      null;

    if (candidateJidRaw || candidatePhoneRaw) {
      const participantJid = (candidateJidRaw ?? candidatePhoneRaw)?.trim();
      if (!participantJid) {
        queue.push(...Object.values(obj));
        continue;
      }

      let resolvedName: string | null = null;
      for (const key of nameKeys) {
        const value = obj[key];
        if (typeof value === "string" && value.trim().length > 0) {
          resolvedName = value.trim();
          break;
        }
      }

      let resolvedAvatar: string | null = null;
      for (const key of avatarKeys) {
        const value = obj[key];
        if (typeof value === "string") {
          const avatar = normalizeAvatarUrl(value);
          if (avatar) {
            resolvedAvatar = avatar;
            break;
          }
        }
      }

      mergeParticipantRecord(participants, {
        jid: participantJid,
        phone: candidatePhoneRaw ?? undefined,
        name: resolvedName,
        avatarUrl: resolvedAvatar
      });
    }

    queue.push(...Object.values(obj));
  }

  return [...participants.values()];
}

export function parseFindContactsResponse(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.value)) {
    return record.value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  const data = asRecord(record.data);
  if (data && Array.isArray(data.value)) {
    return data.value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  }

  return [];
}

export function selectBestContactMatch(value: unknown, remoteJidCandidates: string[]) {
  const contacts = parseFindContactsResponse(value);
  if (!contacts.length) {
    return null;
  }

  const normalizedCandidates = new Set(
    remoteJidCandidates
      .map((candidate) => normalizeComparableJid(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
  );

  const exactMatch = contacts.find((entry) => {
    const remoteJid = typeof entry.remoteJid === "string" ? entry.remoteJid : "";
    const normalizedRemoteJid = normalizeComparableJid(remoteJid);
    return Boolean(normalizedRemoteJid && normalizedCandidates.has(normalizedRemoteJid));
  });

  const match = exactMatch ?? contacts[0];
  if (!match) {
    return null;
  }

  const remoteJid = typeof match.remoteJid === "string" ? match.remoteJid.trim() : "";
  if (!remoteJid) {
    return null;
  }

  const phone = extractPhone(remoteJid);
  const name = typeof match.pushName === "string" && match.pushName.trim().length > 0
    ? match.pushName.trim()
    : null;
  const avatarUrl = typeof match.profilePicUrl === "string"
    ? normalizeAvatarUrl(match.profilePicUrl)
    : null;

  return {
    remoteJid,
    phone,
    name,
    avatarUrl
  } satisfies EvolutionContactMatch;
}

export async function findContactByRemoteJid(
  client: EvolutionClient,
  instanceName: string,
  remoteJidCandidates: string[]
) {
  const uniqueCandidates = [...new Set(remoteJidCandidates.map((entry) => entry.trim()).filter(Boolean))];
  for (const remoteJid of uniqueCandidates) {
    try {
      const contactPayload = await client.findContacts(instanceName, {
        where: {
          remoteJid
        }
      });
      const contact = selectBestContactMatch(contactPayload, uniqueCandidates);
      if (contact) {
        return contact;
      }
    } catch {
      // best-effort: continue trying other candidates.
    }
  }

  return null;
}

export function shouldResolveParticipantName(value: GroupParticipantResponse) {
  const name = value.name.trim();
  if (!name) {
    return true;
  }

  if (name === "Participante") {
    return true;
  }

  const digits = name.replace(/\D/g, "");
  return digits.length >= 7;
}

export function isSameParticipantJid(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeComparableJid(left);
  const b = normalizeComparableJid(right);

  if (a && b && a === b) {
    return true;
  }

  const aDigits = extractPhone(a ?? left);
  const bDigits = extractPhone(b ?? right);
  return Boolean(aDigits && bDigits && aDigits === bDigits);
}

export function collectRelatedRemoteJidsFromGroupInfo(payload: unknown, participantJid: string) {
  const related = new Set<string>();
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 700) {
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
    const candidateJid =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      (obj.lid as string | undefined) ??
      null;

    if (candidateJid && isSameParticipantJid(candidateJid, participantJid)) {
      const candidates = [
        candidateJid,
        obj.phoneNumber,
        obj.remoteJid,
        obj.phone,
        obj.number,
        obj.pn
      ];

      for (const entry of candidates) {
        if (typeof entry !== "string" || !entry.trim()) {
          continue;
        }

        const normalized = normalizeParticipantJid(entry);
        if (normalized) {
          related.add(normalized);
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return [...related];
}

export function createEvolutionClientForTenant(tenantApiKey: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    return null;
  }

  const apiKey = tenantApiKey ?? env.EVOLUTION_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}


