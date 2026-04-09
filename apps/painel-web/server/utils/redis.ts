import { Redis } from 'ioredis'
import type { H3Event } from 'h3'

const redisClientCacheKey = '__omni_nuxt_redis_clients__'

type RedisClientCache = Map<string, Redis>

function getRedisClientCache() {
  const globalRef = globalThis as typeof globalThis & {
    [redisClientCacheKey]?: RedisClientCache
  }

  if (!globalRef[redisClientCacheKey]) {
    globalRef[redisClientCacheKey] = new Map<string, Redis>()
  }

  return globalRef[redisClientCacheKey] as RedisClientCache
}

export function resolveServerRedisUrl(event: H3Event) {
  const config = useRuntimeConfig(event)
  return String(config.redisUrl ?? '').trim()
}

export function getServerRedis(event: H3Event) {
  const redisUrl = resolveServerRedisUrl(event)
  if (!redisUrl) {
    return null
  }

  const cache = getRedisClientCache()
  const cached = cache.get(redisUrl)
  if (cached) {
    return cached
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    commandTimeout: 1_500,
    enableOfflineQueue: false,
    retryStrategy: () => null
  })

  client.on('error', (error) => {
    console.error('[nuxt-redis] connection error', error)
  })

  client.on('end', () => {
    const nextCached = cache.get(redisUrl)
    if (nextCached === client) {
      cache.delete(redisUrl)
    }
  })

  cache.set(redisUrl, client)
  return client
}
