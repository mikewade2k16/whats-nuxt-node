import { EvolutionClient } from "../../services/evolution-client.js";
import type { EvolutionContactMatch } from "./webhook-contracts.js";
import { asRecord } from "./object-utils.js";
import { normalizeAvatarUrl, pickFirstAvatar } from "./media.js";
import {
  extractPhone,
  normalizeJidForCompare
} from "./participant-identity.js";

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

  const nestedData = asRecord(record.data);
  if (nestedData && Array.isArray(nestedData.value)) {
    return nestedData.value.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")
    );
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
      .map((entry) => normalizeJidForCompare(entry))
      .filter((entry): entry is string => Boolean(entry))
  );

  const exactMatch = contacts.find((entry) => {
    const remoteJid = typeof entry.remoteJid === "string" ? entry.remoteJid : "";
    const normalizedRemoteJid = normalizeJidForCompare(remoteJid);
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
      const payload = await client.findContacts(instanceName, {
        where: {
          remoteJid
        }
      });

      const contact = selectBestContactMatch(payload, uniqueCandidates);
      if (contact) {
        return contact;
      }
    } catch {
      // best-effort: try next candidate
    }
  }

  return null;
}

export function extractProfilePictureFromApiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.profilePictureUrl,
    record.profilePicUrl,
    record.pictureUrl,
    record.avatarUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePictureUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePicUrl
  ];

  return pickFirstAvatar(candidates);
}
