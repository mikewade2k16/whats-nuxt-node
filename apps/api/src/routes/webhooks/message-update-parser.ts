import { extractPhone } from "./contacts.js";
import { unwrapMessagePayload } from "./message-parser-text.js";
import { asRecord } from "./object-utils.js";
import type { IncomingWebhookPayload } from "./webhook-contracts.js";

export type IncomingDeletionScope = "EVERYONE" | "ME";

export interface ParsedIncomingDeletionUpdate {
  remoteJid: string;
  targetExternalMessageId: string;
  scope: IncomingDeletionScope;
  fromMe: boolean;
  actorJid: string | null;
  actorName: string | null;
  deletedAt: Date | null;
}

function normalizeProtocolTypeKey(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `NUM_${Math.trunc(value)}`;
  }

  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();
}

function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function normalizeRemoteJid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/:\d+(?=@)/, "")
    .replace(/@c\.us$/i, "@s.whatsapp.net");
}

function parseNumericTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const low = typeof record.low === "number" && Number.isFinite(record.low) ? record.low : null;
  const high = typeof record.high === "number" && Number.isFinite(record.high) ? record.high : 0;
  if (low === null) {
    return null;
  }

  return (high * 4_294_967_296) + (low >>> 0);
}

function parseDeletedAt(valueCandidates: unknown[]) {
  for (const candidate of valueCandidates) {
    const numeric = parseNumericTimestamp(candidate);
    if (numeric === null) {
      continue;
    }

    const milliseconds =
      numeric > 1_000_000_000_000
        ? numeric
        : numeric > 1_000_000_000
          ? numeric * 1_000
          : null;
    if (!milliseconds) {
      continue;
    }

    const parsedDate = new Date(milliseconds);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
}

function resolveDeletionScope(payload: {
  protocolMessage: Record<string, unknown>;
  data: Record<string, unknown>;
  raw: IncomingWebhookPayload;
}) {
  const explicitDeleteForMe = [
    payload.protocolMessage.deleteForMe,
    payload.data.deleteForMe,
    payload.raw.deleteForMe
  ]
    .map(parseBooleanFlag)
    .find((entry) => entry !== null);
  if (explicitDeleteForMe === true) {
    return "ME" as const;
  }

  const explicitDeleteForEveryone = [
    payload.protocolMessage.deleteForEveryone,
    payload.data.deleteForEveryone,
    payload.raw.deleteForEveryone
  ]
    .map(parseBooleanFlag)
    .find((entry) => entry !== null);
  if (explicitDeleteForEveryone === true) {
    return "EVERYONE" as const;
  }

  const typeCandidates = [
    payload.protocolMessage.type,
    payload.protocolMessage.protocolType,
    payload.protocolMessage.messageType,
    payload.data.type,
    payload.data.protocolType,
    payload.data.messageType,
    payload.raw.type
  ];

  const normalizedTypes = typeCandidates
    .map(normalizeProtocolTypeKey)
    .filter((entry) => entry.length > 0);

  if (
    normalizedTypes.some((entry) =>
      entry.includes("DELETE_FOR_ME") ||
      entry.includes("REMOVE_FOR_ME") ||
      entry.includes("SELF_DELETE")
    )
  ) {
    return "ME" as const;
  }

  if (normalizedTypes.some((entry) => entry === "NUM_0")) {
    return "EVERYONE" as const;
  }

  if (
    normalizedTypes.some((entry) =>
      entry.includes("DELETE_FOR_EVERYONE") ||
      entry.includes("REVOKE") ||
      entry.includes("RETRACT")
    )
  ) {
    return "EVERYONE" as const;
  }

  return null;
}

export function parseIncomingDeletionUpdate(raw: IncomingWebhookPayload): ParsedIncomingDeletionUpdate | null {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = asRecord(data.key) ?? asRecord(raw.key) ?? {};
  const rawMessage = asRecord(data.message) ?? {};
  const message = unwrapMessagePayload(rawMessage);
  const protocolMessage = asRecord(message.protocolMessage);
  if (!protocolMessage || Object.keys(protocolMessage).length < 1) {
    return null;
  }

  const protocolKey = asRecord(protocolMessage.key) ?? {};
  const scope = resolveDeletionScope({
    protocolMessage,
    data,
    raw
  });
  if (!scope) {
    return null;
  }

  const remoteJid =
    normalizeRemoteJid(protocolKey.remoteJid) ??
    normalizeRemoteJid(key.remoteJid) ??
    normalizeRemoteJid(data.remoteJid) ??
    normalizeRemoteJid(data.chatId) ??
    normalizeRemoteJid(data.chatJid);

  const targetExternalMessageId =
    (typeof protocolKey.id === "string" ? protocolKey.id.trim() : "") ||
    (typeof data.stanzaId === "string" ? data.stanzaId.trim() : "") ||
    (typeof key.id === "string" ? key.id.trim() : "");

  if (!remoteJid || !targetExternalMessageId) {
    return null;
  }

  const actorJid =
    normalizeRemoteJid(key.participant) ??
    normalizeRemoteJid(data.participant) ??
    normalizeRemoteJid(protocolMessage.participant);
  const fromMe = Boolean(
    (typeof key.fromMe === "boolean" ? key.fromMe : undefined) ??
    (typeof protocolKey.fromMe === "boolean" ? protocolKey.fromMe : undefined) ??
    (typeof data.fromMe === "boolean" ? data.fromMe : undefined)
  );

  const actorNameRaw =
    (typeof data.pushName === "string" ? data.pushName : "") ||
    (typeof data.participantName === "string" ? data.participantName : "") ||
    (typeof raw.pushName === "string" ? raw.pushName : "") ||
    (typeof raw.senderName === "string" ? raw.senderName : "");
  const actorName = actorNameRaw.trim() || (actorJid ? extractPhone(actorJid) : null);

  const deletedAt = parseDeletedAt([
    data.messageTimestamp,
    raw.messageTimestamp,
    data.messageTimestampMs,
    raw.messageTimestampMs,
    data.timestamp,
    raw.timestamp
  ]);

  return {
    remoteJid,
    targetExternalMessageId,
    scope,
    fromMe,
    actorJid: actorJid ?? null,
    actorName,
    deletedAt
  };
}

