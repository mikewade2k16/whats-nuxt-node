import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("*"),
  JWT_SECRET: z.string().min(10),
  EVOLUTION_BASE_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_SEND_PATH: z.string().default("/message/sendText/:instance"),
  EVOLUTION_DEFAULT_INSTANCE: z.string().optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  WEBHOOK_RECEIVER_BASE_URL: z.string().default("http://api:4000")
});

export const env = envSchema.parse(process.env);
