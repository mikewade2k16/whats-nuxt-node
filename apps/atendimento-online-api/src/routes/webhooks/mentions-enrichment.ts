import { asRecord } from "./object-utils.js";
import { extractPhone } from "./contacts.js";
import {
  collectRelatedParticipantRemoteJids,
  extractParticipantNameFromGroupInfo,
} from "./groups.js";
import { normalizeJidForCompare, normalizeMentionJid } from "./participant-identity.js";

export function enrichMentionMetadata(
  metadataValue: unknown,
  options: {
    isGroup: boolean;
    groupInfo: Record<string, unknown> | null;
  }
) {
  const metadataRecord = asRecord(metadataValue);
  if (!metadataRecord) {
    return metadataValue;
  }

  const mentions = asRecord(metadataRecord.mentions);
  if (!mentions) {
    return metadataValue;
  }

  const mentioned = Array.isArray(mentions.mentioned)
    ? [
      ...new Set(
        mentions.mentioned
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => normalizeMentionJid(entry))
          .filter((entry): entry is string => Boolean(entry))
      )
    ]
    : [];

  if (mentioned.length === 0 && !mentions.everyOne) {
    return metadataValue;
  }

  const displayByJid: Record<string, string> = {};
  const displayByPhone: Record<string, string> = {};

  for (const mentionedJid of mentioned) {
    const normalizedJid = normalizeJidForCompare(mentionedJid) ?? mentionedJid;
    const relatedJids = options.isGroup
      ? collectRelatedParticipantRemoteJids(options.groupInfo, normalizedJid)
      : [];
    const aliasJids = [...new Set([normalizedJid, ...relatedJids])];

    const fallbackPhone =
      aliasJids
        .map((entry) => extractPhone(entry))
        .find((entry) => entry.length > 0) ??
      null;

    let displayName: string | null = null;
    if (options.isGroup) {
      for (const aliasJid of aliasJids) {
        const candidateName = extractParticipantNameFromGroupInfo(options.groupInfo, aliasJid);
        if (candidateName) {
          displayName = candidateName;
          break;
        }
      }
    }

    if (!displayName) {
      displayName = fallbackPhone;
    }

    if (!displayName) {
      continue;
    }

    for (const aliasJid of aliasJids) {
      displayByJid[aliasJid] = displayName;

      const aliasPhone = extractPhone(aliasJid);
      if (aliasPhone) {
        displayByPhone[aliasPhone] = displayName;
      }
    }
  }

  const enrichedMentions: Record<string, unknown> = {
    everyOne: Boolean(mentions.everyOne),
    mentioned
  };

  if (Object.keys(displayByJid).length > 0) {
    enrichedMentions.displayByJid = displayByJid;
  }

  if (Object.keys(displayByPhone).length > 0) {
    enrichedMentions.displayByPhone = displayByPhone;
  }

  return {
    ...metadataRecord,
    mentions: enrichedMentions
  };
}
