import { AuditEventType } from "@prisma/client";
import { z } from "zod";

const whatsappInstanceUserScopePolicySchema = z.enum(["MULTI_INSTANCE", "SINGLE_INSTANCE"]);

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
  instanceId: z.string().min(1).optional(),
  instanceName: z.string().min(2).max(80).optional(),
  displayName: z.string().min(2).max(120).optional(),
  number: z.string().min(8).max(20).optional(),
  evolutionApiKey: z.string().max(255).optional()
});

export const connectWhatsAppSchema = z.object({
  instanceId: z.string().min(1).optional(),
  number: z.string().min(8).max(20).optional()
});

export const qrCodeQuerySchema = z.object({
  instanceId: z.string().min(1).optional(),
  force: z.coerce.boolean().default(false)
});

export const whatsappStatusQuerySchema = z.object({
  instanceId: z.string().min(1).optional(),
  includeWebhook: z.coerce.boolean().default(false),
  force: z.coerce.boolean().default(false)
});

export const validateWhatsAppEndpointsSchema = z.object({
  instanceId: z.string().min(1).optional(),
  instanceName: z.string().min(2).max(80).optional()
});

export const whatsappInstanceParamsSchema = z.object({
  instanceId: z.string().min(1)
});

export const createWhatsAppInstanceSchema = z.object({
  instanceName: z.string().min(2).max(80),
  displayName: z.string().min(2).max(120).optional(),
  phoneNumber: z.string().min(8).max(20).optional(),
  evolutionApiKey: z.string().max(255).optional(),
  queueLabel: z.string().min(2).max(120).optional(),
  responsibleUserId: z.string().min(1).optional(),
  userScopePolicy: whatsappInstanceUserScopePolicySchema.default("MULTI_INSTANCE"),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true)
});

export const updateWhatsAppInstanceSchema = z.object({
  instanceName: z.string().min(2).max(80).optional(),
  displayName: z.string().min(2).max(120).optional(),
  phoneNumber: z.string().min(8).max(20).optional(),
  evolutionApiKey: z.string().max(255).optional(),
  queueLabel: z.string().min(2).max(120).optional(),
  responsibleUserId: z.string().min(1).optional(),
  userScopePolicy: whatsappInstanceUserScopePolicySchema.optional(),
  isDefault: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional()
});

export const updateWhatsAppInstanceUsersSchema = z.object({
  userIds: z.array(z.string().min(1)).max(500).default([])
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

export const httpEndpointMetricsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["p95", "avg", "errors", "requests"]).default("p95"),
  order: z.enum(["asc", "desc"]).default("desc"),
  routeContains: z.string().trim().max(120).optional()
});
