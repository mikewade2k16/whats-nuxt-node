import type { Redis } from "ioredis";
import { createRedisConnection } from "../redis.js";
import { platformCoreClient } from "./core-client.js";

type CachedAccessPayload = {
  email: string;
  isPlatformAdmin: boolean;
  level: string;
  userType: string;
  atendimentoAccess: boolean;
  moduleCodes: string[];
};

const redisClientKey = "__omni_atendimento_access_redis__";
const memoryStoreKey = "__omni_atendimento_access_memory__";
const ACCESS_CACHE_TTL_SECONDS = 5;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const output: string[] = [];
  const seen = new Set<string>();

  for (const entry of source) {
    const code = String(entry ?? "").trim().toLowerCase();
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    output.push(code);
  }

  return output;
}

function getRedisClient() {
  const globalRef = globalThis as typeof globalThis & {
    [redisClientKey]?: Redis;
  };

  if (!globalRef[redisClientKey]) {
    const client = createRedisConnection();
    client.on("error", (error) => {
      console.error("[core-atendimento-access] redis connection error", error);
    });
    globalRef[redisClientKey] = client;
  }

  return globalRef[redisClientKey] as Redis;
}

function getMemoryStore() {
  const globalRef = globalThis as typeof globalThis & {
    [memoryStoreKey]?: Map<string, { value: CachedAccessPayload; expiresAt: number }>;
  };

  if (!globalRef[memoryStoreKey]) {
    globalRef[memoryStoreKey] = new Map();
  }

  return globalRef[memoryStoreKey] as Map<string, { value: CachedAccessPayload; expiresAt: number }>;
}

function cacheKeyForEmail(email: string) {
  return `core:atendimento-access:${normalizeEmail(email)}`;
}

function normalizeAccessPayload(email: string, payload?: Partial<CachedAccessPayload> | null): CachedAccessPayload {
  const moduleCodes = normalizeModuleCodes(payload?.moduleCodes);
  const atendimentoAccess = Boolean(payload?.atendimentoAccess) || moduleCodes.includes("atendimento");

  return {
    email: normalizeEmail(email),
    isPlatformAdmin: Boolean(payload?.isPlatformAdmin),
    level: String(payload?.level ?? "").trim().toLowerCase() || "marketing",
    userType: String(payload?.userType ?? "").trim().toLowerCase() || "client",
    atendimentoAccess,
    moduleCodes
  };
}

async function loadFromRedis(key: string) {
  try {
    const raw = await getRedisClient().get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedAccessPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("[core-atendimento-access] redis read fallback to memory", error);
    return null;
  }
}

async function saveToRedis(key: string, payload: CachedAccessPayload) {
  try {
    await getRedisClient().set(key, JSON.stringify(payload), "EX", ACCESS_CACHE_TTL_SECONDS);
    return true;
  } catch (error) {
    console.error("[core-atendimento-access] redis write fallback to memory", error);
    return false;
  }
}

function loadFromMemory(key: string) {
  const entry = getMemoryStore().get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    getMemoryStore().delete(key);
    return null;
  }
  return entry.value;
}

function saveToMemory(key: string, payload: CachedAccessPayload) {
  getMemoryStore().set(key, {
    value: payload,
    expiresAt: Date.now() + (ACCESS_CACHE_TTL_SECONDS * 1_000)
  });
}

export async function resolveCoreAtendimentoAccessByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const key = cacheKeyForEmail(normalizedEmail);

  const cached = await loadFromRedis(key) ?? loadFromMemory(key);
  if (cached) {
    return normalizeAccessPayload(normalizedEmail, cached);
  }

  const users = await platformCoreClient.listAdminUsers({
    page: 1,
    limit: 20,
    q: normalizedEmail
  });

  const matched = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail) ?? null;
  const payload = normalizeAccessPayload(normalizedEmail, matched ?? undefined);
  const writtenToRedis = await saveToRedis(key, payload);
  if (!writtenToRedis) {
    saveToMemory(key, payload);
  }

  return payload;
}

export async function invalidateCoreAtendimentoAccessCacheByEmail(email: string) {
  const key = cacheKeyForEmail(email);
  getMemoryStore().delete(key);

  try {
    await getRedisClient().del(key);
  } catch (error) {
    console.error("[core-atendimento-access] redis invalidate fallback to memory", error);
  }
}
