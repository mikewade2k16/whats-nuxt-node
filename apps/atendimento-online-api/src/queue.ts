import { Queue as BullQueue, type Queue } from "bullmq";
import { isRedisEnabled, redisOptions } from "./redis.js";

export const outboundQueueName = "outbound-messages";
export const outboundQueueBackoffDelayMs = 2_000;
export const outboundQueueMaxAttempts = 5;
export const outboundRetryJobOptions = {
  attempts: outboundQueueMaxAttempts,
  backoff: {
    type: "exponential" as const,
    delay: outboundQueueBackoffDelayMs
  }
};

type OutboundQueueLike = Pick<Queue, "add">;

const disabledOutboundQueue: OutboundQueueLike = {
  async add() {
    throw new Error("Fila outbound indisponivel com REDIS_DISABLED=true.");
  }
};

export const outboundQueue: OutboundQueueLike = isRedisEnabled()
  ? new BullQueue(outboundQueueName, {
      connection: redisOptions,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 500
      }
    })
  : disabledOutboundQueue;
