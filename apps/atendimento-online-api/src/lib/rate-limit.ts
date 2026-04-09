import type { Redis } from "ioredis";
import { createRedisConnection } from "../redis.js";

interface RateLimitBucket {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

interface RateLimitStore {
  buckets: Map<string, RateLimitBucket>;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  resetAt: number;
}

interface RateLimitOptions {
  scope: string;
  key: string;
  max: number;
  windowMs: number;
  blockMs?: number;
}

const globalStoreKey = "__omni_api_rate_limit_store__";
const redisClientKey = "__omni_api_rate_limit_redis__";
const rateLimitRedisScript = `
local bucketKey = KEYS[1]
local blockKey = KEYS[2]
local now = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local blockMs = tonumber(ARGV[4])

local blockedUntil = tonumber(redis.call('GET', blockKey) or '0')
if blockedUntil > now then
  local retryAfter = math.floor((blockedUntil - now + 999) / 1000)
  return {0, 0, blockedUntil, retryAfter}
end

local count = redis.call('INCR', bucketKey)
if count == 1 then
  redis.call('PEXPIRE', bucketKey, windowMs)
end

local ttl = redis.call('PTTL', bucketKey)
if ttl < 0 then
  ttl = windowMs
  redis.call('PEXPIRE', bucketKey, windowMs)
end

local resetAt = now + ttl
local remaining = maxRequests - count
if remaining < 0 then
  remaining = 0
end

if count > maxRequests then
  local nextBlockedUntil = now + blockMs
  redis.call('SET', blockKey, tostring(nextBlockedUntil), 'PX', blockMs)
  local retryAfter = math.floor((blockMs + 999) / 1000)
  return {0, 0, resetAt, retryAfter}
end

return {1, remaining, resetAt, 0}
`;

function getStore(): RateLimitStore {
  const globalRef = globalThis as typeof globalThis & { [globalStoreKey]?: RateLimitStore };
  if (!globalRef[globalStoreKey]) {
    globalRef[globalStoreKey] = {
      buckets: new Map<string, RateLimitBucket>()
    };
  }
  return globalRef[globalStoreKey] as RateLimitStore;
}

function getRedisClient() {
  const globalRef = globalThis as typeof globalThis & { [redisClientKey]?: Redis };
  if (!globalRef[redisClientKey]) {
    const client = createRedisConnection();
    client.on("error", (error) => {
      console.error("[api-rate-limit] redis connection error", error);
    });
    globalRef[redisClientKey] = client;
  }
  return globalRef[redisClientKey] as Redis;
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ":");
}

function cleanupBuckets(store: RateLimitStore, now: number) {
  if (store.buckets.size < 2_000) {
    return;
  }

  for (const [key, bucket] of store.buckets.entries()) {
    if (bucket.blockedUntil > now || bucket.resetAt > now) {
      continue;
    }
    store.buckets.delete(key);
  }
}

async function rateLimitWithRedis(options: RateLimitOptions): Promise<RateLimitResult | null> {
  try {
    const client = getRedisClient();
    const now = Date.now();
    const windowMs = Math.max(1_000, Number(options.windowMs) || 60_000);
    const blockMs = Math.max(windowMs, Number(options.blockMs) || windowMs);
    const bucketKey = `${normalizeKey(options.scope)}:${normalizeKey(options.key)}`;
    const result = await client.eval(
      rateLimitRedisScript,
      2,
      `rate-limit:${bucketKey}`,
      `rate-limit:block:${bucketKey}`,
      String(now),
      String(options.max),
      String(windowMs),
      String(blockMs)
    ) as [number, number, number, number];

    return {
      allowed: Number(result?.[0]) === 1,
      retryAfterSeconds: Math.max(0, Number(result?.[3] ?? 0)),
      remaining: Math.max(0, Number(result?.[1] ?? 0)),
      resetAt: Number(result?.[2] ?? now + windowMs)
    };
  } catch (error) {
    console.error("[api-rate-limit] redis fallback to memory", error);
    return null;
  }
}

function rateLimitWithMemory(options: RateLimitOptions): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  cleanupBuckets(store, now);

  const windowMs = Math.max(1_000, Number(options.windowMs) || 60_000);
  const blockMs = Math.max(windowMs, Number(options.blockMs) || windowMs);
  const bucketKey = `${normalizeKey(options.scope)}:${normalizeKey(options.key)}`;
  let bucket = store.buckets.get(bucketKey);

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs,
      blockedUntil: 0
    };
    store.buckets.set(bucketKey, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000)),
      remaining: 0,
      resetAt: bucket.resetAt
    };
  }

  bucket.count += 1;
  const remaining = Math.max(0, options.max - bucket.count);

  if (bucket.count > options.max) {
    bucket.blockedUntil = now + blockMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1_000)),
      remaining: 0,
      resetAt: bucket.resetAt
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining,
    resetAt: bucket.resetAt
  };
}

export async function rateLimitRequest(options: RateLimitOptions): Promise<RateLimitResult> {
  return (await rateLimitWithRedis(options)) ?? rateLimitWithMemory(options);
}
