import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  API_BODY_LIMIT_MB: z.coerce.number().int().min(5).max(200).default(80),
  EVOLUTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  CORS_ORIGIN: z.string().default("*"),
  JWT_SECRET: z.string().min(10),
  EVOLUTION_BASE_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_SEND_PATH: z.string().default("/message/sendText/:instance"),
  EVOLUTION_SEND_MEDIA_PATH: z.string().default("/message/sendMedia/:instance"),
  EVOLUTION_SEND_AUDIO_PATH: z.string().default("/message/sendWhatsAppAudio/:instance"),
  EVOLUTION_SEND_CONTACT_PATH: z.string().default("/message/sendContact/:instance"),
  EVOLUTION_SEND_STICKER_PATH: z.string().default("/message/sendSticker/:instance"),
  EVOLUTION_SEND_REACTION_PATH: z.string().default("/message/sendReaction/:instance"),
  EVOLUTION_DELETE_FOR_ALL_PATH: z.string().default("/chat/deleteMessageForEveryone/:instance"),
  EVOLUTION_DEFAULT_INSTANCE: z.string().optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  WEBHOOK_RECEIVER_BASE_URL: z.string().default("http://api:4000"),
  SANDBOX_ENABLED: z.coerce.boolean().default(false),
  SANDBOX_ALLOWLIST: z.string().default(""),
  SANDBOX_TEST_EXTERNAL_ID: z.string().default("5511999999999@s.whatsapp.net"),
  RETENTION_SWEEP_ON_BOOT: z.coerce.boolean().default(true),
  RETENTION_SWEEP_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(10_080).default(1_440)
});

export const env = envSchema.parse(process.env);
