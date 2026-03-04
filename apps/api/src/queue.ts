import { Queue } from "bullmq";
import { redisOptions } from "./redis.js";

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

export const outboundQueue = new Queue(outboundQueueName, {
  connection: redisOptions,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500
  }
});
