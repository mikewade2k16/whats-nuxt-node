import { createError, setHeader, type H3Event } from 'h3'
import { getServerRedis } from '~~/server/utils/redis'
import { resolveTrustedEventClientIp } from '~~/server/utils/trusted-proxy'

interface RateLimitBucket {
  count: number
  resetAt: number
  blockedUntil: number
}

interface RateLimitStore {
  buckets: Map<string, RateLimitBucket>
}

export interface RateLimitRule {
  scope: string
  key?: string
  max: number
  windowMs: number
  blockMs?: number
  message?: string
}

const globalStoreKey = '__omni_server_rate_limit_store__'
const REDIS_RATE_LIMIT_TIMEOUT_MS = 1_200
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
`

function getStore(): RateLimitStore {
  const globalRef = globalThis as typeof globalThis & { [globalStoreKey]?: RateLimitStore }
  if (!globalRef[globalStoreKey]) {
    globalRef[globalStoreKey] = {
      buckets: new Map<string, RateLimitBucket>()
    }
  }
  return globalRef[globalStoreKey] as RateLimitStore
}

function normalizeKeyPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ':')
}

function cleanupBuckets(store: RateLimitStore, now: number) {
  if (store.buckets.size < 2000) return

  for (const [key, bucket] of store.buckets.entries()) {
    if (bucket.blockedUntil > now) continue
    if (bucket.resetAt > now) continue
    store.buckets.delete(key)
  }
}

export function resolveRateLimitClientKey(event: H3Event) {
  const requestIp = resolveTrustedEventClientIp(event)
  return normalizeKeyPart(requestIp || 'unknown')
}

async function enforceRedisRateLimit(event: H3Event, rule: RateLimitRule) {
  const redis = getServerRedis(event)
  if (!redis) {
    return null
  }

  const windowMs = Math.max(1_000, Number(rule.windowMs) || 60_000)
  const blockMs = Math.max(windowMs, Number(rule.blockMs) || windowMs)
  const scopedKey = `${normalizeKeyPart(rule.scope)}:${normalizeKeyPart(rule.key || resolveRateLimitClientKey(event))}`
  const now = Date.now()

  try {
    const result = await Promise.race([
      redis.eval(
        rateLimitRedisScript,
        2,
        `rate-limit:${scopedKey}`,
        `rate-limit:block:${scopedKey}`,
        String(now),
        String(rule.max),
        String(windowMs),
        String(blockMs)
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`redis rate-limit timeout apos ${REDIS_RATE_LIMIT_TIMEOUT_MS}ms`)), REDIS_RATE_LIMIT_TIMEOUT_MS)
      })
    ]) as [number, number, number, number]

    return {
      allowed: Number(result?.[0]) === 1,
      remaining: Math.max(0, Number(result?.[1] ?? 0)),
      resetAt: Number(result?.[2] ?? now + windowMs),
      retryAfterSeconds: Math.max(0, Number(result?.[3] ?? 0))
    }
  } catch (error) {
    console.error('[nuxt-rate-limit] redis fallback to memory', error)
    return null
  }
}

export async function enforceRateLimit(event: H3Event, rule: RateLimitRule) {
  const redisResult = await enforceRedisRateLimit(event, rule)
  if (redisResult) {
    setHeader(event, 'x-rate-limit-limit', String(rule.max))
    setHeader(event, 'x-rate-limit-remaining', String(redisResult.remaining))
    setHeader(event, 'x-rate-limit-reset', String(Math.ceil(redisResult.resetAt / 1_000)))

    if (!redisResult.allowed) {
      setHeader(event, 'retry-after', String(Math.max(1, redisResult.retryAfterSeconds)))
      throw createError({
        statusCode: 429,
        statusMessage: rule.message ?? 'Muitas tentativas. Aguarde antes de tentar novamente.'
      })
    }

    return
  }

  const store = getStore()
  const now = Date.now()
  cleanupBuckets(store, now)

  const scopedKey = `${normalizeKeyPart(rule.scope)}:${normalizeKeyPart(rule.key || resolveRateLimitClientKey(event))}`
  const current = store.buckets.get(scopedKey)
  const windowMs = Math.max(1_000, Number(rule.windowMs) || 60_000)
  const blockMs = Math.max(windowMs, Number(rule.blockMs) || windowMs)

  let bucket = current
  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs,
      blockedUntil: 0
    }
    store.buckets.set(scopedKey, bucket)
  }

  if (bucket.blockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000))
    setHeader(event, 'retry-after', String(retryAfterSeconds))
    setHeader(event, 'x-rate-limit-limit', String(rule.max))
    setHeader(event, 'x-rate-limit-remaining', '0')
    setHeader(event, 'x-rate-limit-reset', String(Math.ceil(bucket.resetAt / 1_000)))
    throw createError({
      statusCode: 429,
      statusMessage: rule.message ?? 'Muitas tentativas. Aguarde antes de tentar novamente.'
    })
  }

  bucket.count += 1
  const remaining = Math.max(0, rule.max - bucket.count)
  setHeader(event, 'x-rate-limit-limit', String(rule.max))
  setHeader(event, 'x-rate-limit-remaining', String(remaining))
  setHeader(event, 'x-rate-limit-reset', String(Math.ceil(bucket.resetAt / 1_000)))

  if (bucket.count > rule.max) {
    bucket.blockedUntil = now + blockMs
    const retryAfterSeconds = Math.max(1, Math.ceil(blockMs / 1_000))
    setHeader(event, 'retry-after', String(retryAfterSeconds))
    throw createError({
      statusCode: 429,
      statusMessage: rule.message ?? 'Muitas tentativas. Aguarde antes de tentar novamente.'
    })
  }
}
