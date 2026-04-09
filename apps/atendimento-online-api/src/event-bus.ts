import type { Redis } from "ioredis";
import { createRedisConnection, redisPublisher } from "./redis.js";

export type PlatformEventType = "message.created" | "message.updated" | "conversation.updated";

export interface PlatformEvent {
  type: PlatformEventType;
  tenantId: string;
  payload: Record<string, unknown>;
}

const EVENT_CHANNEL = "omnichannel-events";

export async function publishEvent(event: PlatformEvent) {
  await redisPublisher.publish(EVENT_CHANNEL, JSON.stringify(event));
}

export async function subscribeEvents(handler: (event: PlatformEvent) => void) {
  const subscriber = createRedisConnection();
  await subscriber.subscribe(EVENT_CHANNEL);
  subscriber.on("message", (_channel: string, raw: string) => {
    try {
      const event = JSON.parse(raw) as PlatformEvent;
      handler(event);
    } catch (error) {
      console.error("Falha ao ler evento do Redis:", error);
    }
  });
  return subscriber;
}

export async function closeSubscriber(subscriber: Redis | null) {
  if (subscriber) {
    await subscriber.quit();
  }
}
