import { EventEmitter } from "node:events";
import { Redis, type RedisOptions } from "ioredis";
import { env } from "./config.js";

const disabledRedisBusKey = "__omni_api_disabled_redis_bus__";

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

function getDisabledRedisBus() {
  const globalRef = globalThis as typeof globalThis & {
    [disabledRedisBusKey]?: EventEmitter;
  };

  if (!globalRef[disabledRedisBusKey]) {
    globalRef[disabledRedisBusKey] = new EventEmitter();
  }

  return globalRef[disabledRedisBusKey] as EventEmitter;
}

class DisabledRedisConnection extends EventEmitter {
  private subscriptions = new Map<string, (channel: string, payload: string) => void>();

  async publish(channel: string, payload: string) {
    getDisabledRedisBus().emit(channel, channel, payload);
    return 0;
  }

  async subscribe(channel: string) {
    if (this.subscriptions.has(channel)) {
      return this.subscriptions.size;
    }

    const listener = (eventChannel: string, payload: string) => {
      this.emit("message", eventChannel, payload);
    };

    this.subscriptions.set(channel, listener);
    getDisabledRedisBus().on(channel, listener);
    return this.subscriptions.size;
  }

  async get(_key: string) {
    throw new Error("Redis desabilitado neste ambiente local.");
  }

  async set(_key: string, _value: string, ..._args: Array<string | number>) {
    throw new Error("Redis desabilitado neste ambiente local.");
  }

  async del(..._keys: string[]) {
    throw new Error("Redis desabilitado neste ambiente local.");
  }

  async eval(
    _script: string,
    _numKeys: number,
    ..._args: Array<string | number>
  ) {
    throw new Error("Redis desabilitado neste ambiente local.");
  }

  async quit() {
    for (const [channel, listener] of this.subscriptions.entries()) {
      getDisabledRedisBus().off(channel, listener);
    }

    this.subscriptions.clear();
    this.removeAllListeners();
    return "OK";
  }
}

export function isRedisEnabled() {
  return !env.REDIS_DISABLED;
}

export const redisOptions = parseRedisUrl(env.REDIS_URL);

export function createRedisConnection() {
  if (!isRedisEnabled()) {
    return new DisabledRedisConnection() as unknown as Redis;
  }

  return new Redis(redisOptions);
}

export const redisPublisher = createRedisConnection();
