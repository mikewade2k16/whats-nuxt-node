import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { env } from "../../config.js";
import { createRedisConnection } from "../../redis.js";
import { parseIncomingDeletionUpdate } from "./message-update-parser.js";
import {
  extractInstanceName,
  extractQrCode,
  MESSAGE_CREATE_EVENTS,
  normalizeEventName,
  parseIncomingMessage,
  parseIncomingReaction,
  type IncomingWebhookPayload
} from "./shared.js";

type IdempotencyDecision = "acquired" | "done" | "processing";

interface WebhookIdempotencyResult {
  decision: IdempotencyDecision;
  key: string;
  token: string | null;
  fingerprint: string;
}

interface MemoryEntry {
  status: "processing" | "done";
  token: string;
  expiresAt: number;
}

const memoryStoreKey = "__omni_webhook_idempotency_store__";
const redisClientKey = "__omni_webhook_idempotency_redis__";

const acquireScript = `
local key = KEYS[1]
local token = ARGV[1]
local processingTtlMs = tonumber(ARGV[2])

local current = redis.call('GET', key)
if not current then
  local nextValue = 'processing:' .. token
  redis.call('SET', key, nextValue, 'PX', processingTtlMs)
  return {'acquired', nextValue}
end

if string.sub(current, 1, 5) == 'done:' then
  return {'done', current}
end

return {'processing', current}
`;

const completeScript = `
local key = KEYS[1]
local token = ARGV[1]
local completedTtlMs = tonumber(ARGV[2])
local current = redis.call('GET', key)
if current ~= ('processing:' .. token) then
  return 0
end

redis.call('SET', key, 'done:' .. token, 'PX', completedTtlMs)
return 1
`;

const releaseScript = `
local key = KEYS[1]
local token = ARGV[1]
local current = redis.call('GET', key)
if current ~= ('processing:' .. token) then
  return 0
end

redis.call('DEL', key)
return 1
`;

function getMemoryStore() {
  const globalRef = globalThis as typeof globalThis & {
    [memoryStoreKey]?: Map<string, MemoryEntry>;
  };

  if (!globalRef[memoryStoreKey]) {
    globalRef[memoryStoreKey] = new Map<string, MemoryEntry>();
  }

  return globalRef[memoryStoreKey] as Map<string, MemoryEntry>;
}

function getRedisClient() {
  const globalRef = globalThis as typeof globalThis & {
    [redisClientKey]?: Redis;
  };

  if (!globalRef[redisClientKey]) {
    const client = createRedisConnection();
    client.on("error", (error) => {
      console.error("[webhook-idempotency] redis connection error", error);
    });
    globalRef[redisClientKey] = client;
  }

  return globalRef[redisClientKey] as Redis;
}

function normalizeKeyPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_@.-]+/g, "_")
    .slice(0, 200);
}

function cleanupMemoryStore(now: number) {
  const store = getMemoryStore();
  if (store.size < 2_000) {
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt > now) {
      continue;
    }
    store.delete(key);
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b, "en-US"));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function hashValue(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function resolveWebhookFingerprint(params: {
  tenantSlug: string;
  eventName: string;
  payload: IncomingWebhookPayload;
}) {
  const normalizedEventName = normalizeEventName(params.eventName || "unknown");
  const instanceName = extractInstanceName(params.payload) || "default";
  const qrCode = extractQrCode(params.payload);
  if (qrCode) {
    return `qr:${normalizeKeyPart(instanceName)}:${hashValue(qrCode)}`;
  }

  const reaction = parseIncomingReaction(params.payload);
  if (reaction) {
    return [
      "reaction",
      normalizeKeyPart(instanceName),
      normalizeKeyPart(reaction.remoteJid),
      normalizeKeyPart(reaction.targetExternalMessageId),
      normalizeKeyPart(reaction.actorJid ?? reaction.actorName ?? (reaction.fromMe ? "self" : "unknown")),
      hashValue(reaction.emoji ?? "")
    ].join(":");
  }

  const deletion = parseIncomingDeletionUpdate(params.payload);
  if (deletion) {
    return [
      "delete",
      normalizeKeyPart(instanceName),
      normalizeKeyPart(deletion.remoteJid),
      normalizeKeyPart(deletion.targetExternalMessageId),
      normalizeKeyPart(deletion.scope),
      normalizeKeyPart(deletion.actorJid ?? deletion.actorName ?? (deletion.fromMe ? "self" : "unknown"))
    ].join(":");
  }

  if (MESSAGE_CREATE_EVENTS.has(normalizedEventName)) {
    const message = parseIncomingMessage(params.payload);
    if (message.externalMessageId) {
      return [
        "message",
        normalizeKeyPart(instanceName),
        normalizeKeyPart(message.remoteJid ?? "unknown"),
        normalizeKeyPart(message.externalMessageId)
      ].join(":");
    }

    return [
      "message-fallback",
      normalizeKeyPart(instanceName),
      normalizeKeyPart(message.remoteJid ?? "unknown"),
      hashValue({
        fromMe: message.fromMe,
        participantJid: message.participantJid,
        text: message.text,
        messageType: message.messageType,
        mediaUrl: message.mediaUrl,
        mediaMimeType: message.mediaMimeType,
        timestamp: message.messageTimestamp?.toISOString() ?? null
      })
    ].join(":");
  }

  return [
    "raw",
    normalizeKeyPart(instanceName),
    normalizeKeyPart(normalizedEventName),
    hashValue({
      tenantSlug: params.tenantSlug,
      eventName: normalizedEventName,
      payload: params.payload
    })
  ].join(":");
}

async function acquireWithRedis(key: string, token: string, processingTtlMs: number) {
  try {
    const client = getRedisClient();
    const result = await client.eval(
      acquireScript,
      1,
      key,
      token,
      String(processingTtlMs)
    ) as [string, string];

    const decision = String(result?.[0] ?? "processing") as IdempotencyDecision;
    return decision;
  } catch (error) {
    console.error("[webhook-idempotency] redis fallback to memory", error);
    return null;
  }
}

function acquireWithMemory(key: string, token: string, processingTtlMs: number): IdempotencyDecision {
  const now = Date.now();
  cleanupMemoryStore(now);
  const store = getMemoryStore();
  const current = store.get(key);

  if (!current || current.expiresAt <= now) {
    store.set(key, {
      status: "processing",
      token,
      expiresAt: now + processingTtlMs
    });
    return "acquired";
  }

  return current.status === "done" ? "done" : "processing";
}

async function completeWithRedis(key: string, token: string, completedTtlMs: number) {
  try {
    const client = getRedisClient();
    await client.eval(
      completeScript,
      1,
      key,
      token,
      String(completedTtlMs)
    );
    return true;
  } catch (error) {
    console.error("[webhook-idempotency] redis complete fallback to memory", error);
    return false;
  }
}

function completeWithMemory(key: string, token: string, completedTtlMs: number) {
  const store = getMemoryStore();
  const current = store.get(key);
  if (!current || current.status !== "processing" || current.token !== token) {
    return;
  }

  store.set(key, {
    status: "done",
    token,
    expiresAt: Date.now() + completedTtlMs
  });
}

async function releaseWithRedis(key: string, token: string) {
  try {
    const client = getRedisClient();
    await client.eval(
      releaseScript,
      1,
      key,
      token
    );
    return true;
  } catch (error) {
    console.error("[webhook-idempotency] redis release fallback to memory", error);
    return false;
  }
}

function releaseWithMemory(key: string, token: string) {
  const store = getMemoryStore();
  const current = store.get(key);
  if (!current || current.status !== "processing" || current.token !== token) {
    return;
  }
  store.delete(key);
}

export async function acquireWebhookIdempotency(params: {
  tenantSlug: string;
  eventName: string;
  payload: IncomingWebhookPayload;
}) : Promise<WebhookIdempotencyResult> {
  const fingerprint = resolveWebhookFingerprint(params);
  const key = `webhook:idempotency:${normalizeKeyPart(params.tenantSlug)}:${fingerprint}`;
  const token = randomUUID();
  const processingTtlMs = env.WEBHOOK_IDEMPOTENCY_PROCESSING_TTL_SECONDS * 1_000;

  const redisDecision = await acquireWithRedis(key, token, processingTtlMs);
  const decision = redisDecision ?? acquireWithMemory(key, token, processingTtlMs);

  return {
    decision,
    key,
    token: decision === "acquired" ? token : null,
    fingerprint
  };
}

export async function completeWebhookIdempotency(key: string, token: string | null) {
  if (!token) {
    return;
  }

  const completedTtlMs = env.WEBHOOK_IDEMPOTENCY_TTL_SECONDS * 1_000;
  const completedInRedis = await completeWithRedis(key, token, completedTtlMs);
  if (!completedInRedis) {
    completeWithMemory(key, token, completedTtlMs);
  }
}

export async function releaseWebhookIdempotency(key: string, token: string | null) {
  if (!token) {
    return;
  }

  const releasedInRedis = await releaseWithRedis(key, token);
  if (!releasedInRedis) {
    releaseWithMemory(key, token);
  }
}
