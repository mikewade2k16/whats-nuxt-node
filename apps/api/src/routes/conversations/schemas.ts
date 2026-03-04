import {
  ChannelType,
  ConversationStatus,
  MessageType
} from "@prisma/client";
import { z } from "zod";

export const createConversationSchema = z.object({
  channel: z.nativeEnum(ChannelType).default(ChannelType.WHATSAPP),
  externalId: z.string().min(3),
  contactName: z.string().optional(),
  contactAvatarUrl: z.string().url().optional(),
  contactPhone: z.string().optional()
});

export const sendMessageSchema = z
  .object({
    type: z.nativeEnum(MessageType).default(MessageType.TEXT),
    content: z.string().max(4000).optional(),
    mediaUrl: z.string().min(1).max(60_000_000).optional(),
    mediaMimeType: z.string().max(255).optional(),
    mediaFileName: z.string().max(255).optional(),
    mediaFileSizeBytes: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    mediaCaption: z.string().max(4000).optional(),
    mediaDurationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
    metadataJson: z.record(z.unknown()).optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === MessageType.TEXT) {
      const content = value.content?.trim();
      if (!content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "content e obrigatorio para mensagens de texto",
          path: ["content"]
        });
      }
      return;
    }

    const media = value.mediaUrl?.trim();
    if (!media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mediaUrl e obrigatorio para mensagens de midia",
        path: ["mediaUrl"]
      });
    }
  });

export const assignConversationSchema = z.object({
  assignedToId: z.string().nullable()
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus)
});

export const reprocessMessageSchema = z.object({
  force: z.boolean().default(false)
});

export const reprocessBatchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const reactToMessageSchema = z.object({
  emoji: z.string().max(32).nullable().optional()
});

export const bulkMessageIdsSchema = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(100)
});

export const forwardMessagesSchema = bulkMessageIdsSchema.extend({
  targetConversationId: z.string().min(1)
});

export const messageMediaQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).optional(),
  download: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional()
});
