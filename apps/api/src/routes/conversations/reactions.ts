import { asRecord } from "./object-utils.js";
import type { MessageReactionEntry } from "./types.js";

export function normalizeReactionEmoji(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = [...trimmed].slice(0, 8).join("");
  return normalized || null;
}

export function extractReactionEntries(metadataJson: unknown) {
  const metadata = asRecord(metadataJson);
  const reactions = metadata ? asRecord(metadata.reactions) : null;
  const items = Array.isArray(reactions?.items) ? reactions.items : [];
  const entries: MessageReactionEntry[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const actorKey = typeof record.actorKey === "string" ? record.actorKey.trim() : "";
    const emoji = normalizeReactionEmoji(record.emoji);
    if (!actorKey || !emoji) {
      continue;
    }

    entries.push({
      actorKey,
      actorUserId: typeof record.actorUserId === "string" ? record.actorUserId : null,
      actorName: typeof record.actorName === "string" ? record.actorName : null,
      actorJid: typeof record.actorJid === "string" ? record.actorJid : null,
      emoji,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      source: record.source === "whatsapp" ? "whatsapp" : "agent"
    });
  }

  return entries;
}

export function summarizeReactionEntries(entries: MessageReactionEntry[]) {
  const summary: Record<string, number> = {};
  for (const entry of entries) {
    summary[entry.emoji] = (summary[entry.emoji] ?? 0) + 1;
  }
  return summary;
}

export function withMessageReactionMetadata(params: {
  metadataJson: unknown;
  actorKey: string;
  actorUserId: string | null;
  actorName: string | null;
  actorJid: string | null;
  emoji: string | null;
  source: MessageReactionEntry["source"];
}) {
  const nowIso = new Date().toISOString();
  const metadata = asRecord(params.metadataJson)
    ? { ...(asRecord(params.metadataJson) as Record<string, unknown>) }
    : {};
  const withoutActor = extractReactionEntries(params.metadataJson).filter(
    (entry) => entry.actorKey !== params.actorKey
  );

  if (params.emoji) {
    withoutActor.push({
      actorKey: params.actorKey,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorJid: params.actorJid,
      emoji: params.emoji,
      updatedAt: nowIso,
      source: params.source
    });
  }

  metadata.reactions = {
    items: withoutActor,
    summary: summarizeReactionEntries(withoutActor),
    updatedAt: nowIso
  };

  return metadata;
}


