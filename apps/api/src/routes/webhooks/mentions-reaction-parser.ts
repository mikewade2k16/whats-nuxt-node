import type { IncomingWebhookPayload } from "./webhook-contracts.js";
import { asRecord } from "./object-utils.js";
import { extractPhone } from "./contacts.js";
import { unwrapMessagePayload } from "./message-parser-text.js";
import { normalizeReactionEmoji } from "./mentions-reactions.js";

export interface ParsedIncomingReaction {
  remoteJid: string;
  targetExternalMessageId: string;
  emoji: string | null;
  fromMe: boolean;
  actorJid: string | null;
  actorName: string | null;
}

export function parseIncomingReaction(raw: IncomingWebhookPayload): ParsedIncomingReaction | null {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = asRecord(data.key) ?? asRecord(raw.key) ?? {};
  const rawMessage = asRecord(data.message) ?? {};
  const message = unwrapMessagePayload(rawMessage);
  const reactionMessage = asRecord(message.reactionMessage);

  if (!reactionMessage || Object.keys(reactionMessage).length === 0) {
    return null;
  }

  const reactionKey = asRecord(reactionMessage.key) ?? {};
  const remoteJid =
    (key.remoteJid as string | undefined) ??
    (data.remoteJid as string | undefined) ??
    (reactionKey.remoteJid as string | undefined) ??
    null;

  const targetExternalMessageId =
    (reactionKey.id as string | undefined) ??
    (data.stanzaId as string | undefined) ??
    null;

  const emoji = normalizeReactionEmoji(
    reactionMessage.text ??
    reactionMessage.reactionText ??
    reactionMessage.emoji ??
    data.reaction
  );

  const actorJid =
    (key.participant as string | undefined) ??
    (data.participant as string | undefined) ??
    (reactionMessage.participant as string | undefined) ??
    null;
  const fromMe = Boolean(
    (key.fromMe as boolean | undefined) ??
    (data.fromMe as boolean | undefined) ??
    (reactionMessage.fromMe as boolean | undefined)
  );

  const actorNameRaw =
    (data.pushName as string | undefined) ??
    (data.participantName as string | undefined) ??
    (raw.pushName as string | undefined) ??
    null;
  const actorName = actorNameRaw?.trim() || (actorJid ? extractPhone(actorJid) : null);

  if (!remoteJid || !targetExternalMessageId) {
    return null;
  }

  return {
    remoteJid,
    targetExternalMessageId,
    emoji,
    fromMe,
    actorJid,
    actorName
  };
}
