import { Redis, type RedisOptions } from "ioredis";
import { env } from "./config.js";

function parseRedisUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const database = url.pathname ? Number.parseInt(url.pathname.replace("/", ""), 10) : 0;

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isNaN(database) ? 0 : database,
    maxRetriesPerRequest: null
  };
}

export const redisOptions = parseRedisUrl(env.REDIS_URL);

export function createRedisConnection() {
  return new Redis(redisOptions);
}

export const redisPublisher = createRedisConnection();
