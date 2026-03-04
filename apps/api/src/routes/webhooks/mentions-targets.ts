import { asRecord } from "./object-utils.js";
import { normalizeMentionJid } from "./participant-identity.js";

export function hasMentionTargets(metadataValue: unknown) {
  const metadata = asRecord(metadataValue);
  if (!metadata) {
    return false;
  }

  const mentions = asRecord(metadata.mentions);
  if (!mentions) {
    return false;
  }

  if (mentions.everyOne === true) {
    return true;
  }

  return Array.isArray(mentions.mentioned) && mentions.mentioned.length > 0;
}

export function extractMentionedJids(contextInfo: Record<string, unknown>) {
  const nestedContextInfo = asRecord(contextInfo.contextInfo) ?? asRecord(contextInfo.messageContextInfo);
  const candidates = [
    contextInfo.mentionedJid,
    contextInfo.mentioned,
    contextInfo.mentions,
    nestedContextInfo?.mentionedJid,
    nestedContextInfo?.mentioned,
    nestedContextInfo?.mentions
  ];

  const values: string[] = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const item of candidate) {
      if (typeof item !== "string") {
        continue;
      }
      const normalized = normalizeMentionJid(item);
      if (normalized) {
        values.push(normalized);
      }
    }
  }

  return [...new Set(values)];
}
