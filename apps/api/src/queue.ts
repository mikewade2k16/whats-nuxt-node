import { Queue } from "bullmq";
import { redisOptions } from "./redis.js";

export const outboundQueueName = "outbound-messages";

export const outboundQueue = new Queue(outboundQueueName, {
  connection: redisOptions,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500
  }
});
