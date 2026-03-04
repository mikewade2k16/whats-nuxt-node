import { AuditEventType } from "@prisma/client";
import { z } from "zod";

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  whatsappInstance: z.string().min(2).max(80).optional(),
  evolutionApiKey: z.string().max(255).optional(),
  maxChannels: z.coerce.number().int().min(0).max(50).optional(),
  maxUsers: z.coerce.number().int().min(1).max(500).optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  maxUploadMb: z.coerce.number().int().min(1).max(2048).optional()
});

export const bootstrapWhatsAppSchema = z.object({
  instanceName: z.string().min(2).max(80).optional(),
  number: z.string().min(8).max(20).optional(),
  evolutionApiKey: z.string().max(255).optional()
});

export const connectWhatsAppSchema = z.object({
  number: z.string().min(8).max(20).optional()
});

export const qrCodeQuerySchema = z.object({
  force: z.coerce.boolean().default(true)
});

export const validateWhatsAppEndpointsSchema = z.object({
  instanceName: z.string().min(2).max(80).optional()
});

export const listAuditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.coerce.date().optional(),
  eventType: z.nativeEnum(AuditEventType).optional(),
  conversationId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional()
});

export const failuresDashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7)
});
