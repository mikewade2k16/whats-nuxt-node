import type { FastifyInstance } from "fastify";
import { AuditEventType, MessageStatus, Prisma, type UserRole } from "@prisma/client";
import axios from "axios";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { requireAdmin, requireAdminOrSupervisor } from "../../lib/guards.js";
import { EvolutionApiError, EvolutionClient } from "../../services/evolution-client.js";
import { getLatestQrCode, setLatestQrCode } from "../../services/whatsapp-qr-cache.js";

const updateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  whatsappInstance: z.string().min(2).max(80).optional(),
  evolutionApiKey: z.string().max(255).optional(),
  maxChannels: z.coerce.number().int().min(0).max(50).optional(),
  maxUsers: z.coerce.number().int().min(1).max(500).optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  maxUploadMb: z.coerce.number().int().min(1).max(2048).optional()
});

const bootstrapWhatsAppSchema = z.object({
  instanceName: z.string().min(2).max(80).optional(),
  number: z.string().min(8).max(20).optional(),
  evolutionApiKey: z.string().max(255).optional()
});

const connectWhatsAppSchema = z.object({
  number: z.string().min(8).max(20).optional()
});

const qrCodeQuerySchema = z.object({
  force: z.coerce.boolean().default(true)
});

const validateWhatsAppEndpointsSchema = z.object({
  instanceName: z.string().min(2).max(80).optional()
});

const listAuditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.coerce.date().optional(),
  eventType: z.nativeEnum(AuditEventType).optional(),
  conversationId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional()
});

const failuresDashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7)
});

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildWebhookUrl(tenantSlug: string) {
  return `${stripTrailingSlash(env.WEBHOOK_RECEIVER_BASE_URL)}/webhooks/evolution/${tenantSlug}`;
}

function buildWebhookHeaders() {
  if (!env.EVOLUTION_WEBHOOK_TOKEN) {
    return undefined;
  }

  return {
    "x-webhook-token": env.EVOLUTION_WEBHOOK_TOKEN
  };
}

function normalizeEvolutionApiKey(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getTenantOrFail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });
  if (!tenant) {
    throw new Error("Tenant nao encontrado");
  }
  return tenant;
}

function createEvolutionClientOrThrow(tenantApiKey: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    throw new EvolutionApiError("EVOLUTION_BASE_URL nao configurada no ambiente", 400);
  }

  const apiKey = tenantApiKey ?? env.EVOLUTION_API_KEY;
  if (!apiKey) {
    throw new EvolutionApiError(
      "Nenhuma API key da Evolution configurada (tenant ou ambiente)",
      400
    );
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}

function resolveInstanceName(explicit: string | undefined, fallback: string | null, tenantSlug: string) {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  if (fallback?.trim()) {
    return fallback.trim();
  }
  return `${tenantSlug}-wa`;
}

function resolveConfiguredChannelCount(whatsappInstance: string | null | undefined) {
  return whatsappInstance?.trim() ? 1 : 0;
}

function canReadSensitiveConfig(role: UserRole) {
  return role === "ADMIN";
}

function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
}

function normalizePairingText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return null;
  }

  if (trimmed.length > 64) {
    return null;
  }

  if (!/^[A-Za-z0-9\-_.@:+/]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function normalizeConnectionState(source: unknown) {
  const state =
    (source as { instance?: { state?: unknown } } | null)?.instance?.state;

  if (typeof state !== "string") {
    return "unknown";
  }

  return state.trim().toLowerCase();
}

function resolvePathTemplate(template: string, instanceName: string) {
  const normalizedTemplate = template.trim();
  if (!normalizedTemplate) {
    return null;
  }

  const encodedInstance = encodeURIComponent(instanceName);
  const resolvedTemplate = normalizedTemplate.includes(":instance")
    ? normalizedTemplate.replace(":instance", encodedInstance)
    : normalizedTemplate;

  return resolvedTemplate.startsWith("/") ? resolvedTemplate : `/${resolvedTemplate}`;
}

type EndpointValidationStatus =
  | "ok"
  | "validation_error"
  | "missing_route"
  | "auth_error"
  | "provider_error"
  | "network_error"
  | "unexpected_error";

function classifyEndpointValidationStatus(statusCode: number | null): EndpointValidationStatus {
  if (statusCode === null) {
    return "network_error";
  }

  if (statusCode >= 200 && statusCode < 300) {
    return "ok";
  }

  if (statusCode === 400 || statusCode === 409 || statusCode === 422 || statusCode === 429) {
    return "validation_error";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "auth_error";
  }

  if (statusCode === 404 || statusCode === 405) {
    return "missing_route";
  }

  if (statusCode >= 500) {
    return "provider_error";
  }

  return "unexpected_error";
}

function extractEndpointValidationMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybeRecord = payload as Record<string, unknown>;
  if (typeof maybeRecord.message === "string" && maybeRecord.message.trim().length > 0) {
    return maybeRecord.message.trim();
  }

  const response = maybeRecord.response;
  if (response && typeof response === "object") {
    const responseRecord = response as Record<string, unknown>;
    if (typeof responseRecord.message === "string" && responseRecord.message.trim().length > 0) {
      return responseRecord.message.trim();
    }
  }

  return fallback;
}

interface EvolutionEndpointProbe {
  key: "text" | "media" | "audio" | "contact" | "sticker" | "reaction";
  label: string;
  pathTemplate: string;
  payload: Record<string, unknown>;
}

function buildEndpointProbes() {
  return [
    {
      key: "text",
      label: "sendText",
      pathTemplate: env.EVOLUTION_SEND_PATH,
      payload: {
        number: "0000000000",
        text: "[probe] endpoint validation",
        textMessage: {
          text: "[probe] endpoint validation"
        }
      }
    },
    {
      key: "media",
      label: "sendMedia",
      pathTemplate: env.EVOLUTION_SEND_MEDIA_PATH,
      payload: {
        number: "0000000000",
        mediatype: "document",
        media: "ZHVtbXk=",
        fileName: "probe.txt",
        caption: "[probe]"
      }
    },
    {
      key: "audio",
      label: "sendWhatsAppAudio",
      pathTemplate: env.EVOLUTION_SEND_AUDIO_PATH,
      payload: {
        number: "0000000000",
        audio: "ZHVtbXk="
      }
    },
    {
      key: "contact",
      label: "sendContact",
      pathTemplate: env.EVOLUTION_SEND_CONTACT_PATH,
      payload: {
        number: "0000000000",
        fullName: "Endpoint Probe",
        phone: "0000000000",
        contacts: [
          {
            fullName: "Endpoint Probe",
            phoneNumber: "0000000000"
          }
        ]
      }
    },
    {
      key: "sticker",
      label: "sendSticker",
      pathTemplate: env.EVOLUTION_SEND_STICKER_PATH,
      payload: {
        number: "0000000000",
        sticker: "ZHVtbXk=",
        fileName: "probe.webp"
      }
    },
    {
      key: "reaction",
      label: "sendReaction",
      pathTemplate: env.EVOLUTION_SEND_REACTION_PATH,
      payload: {
        key: {
          remoteJid: "0000000000@s.whatsapp.net",
          fromMe: false,
          id: "probe-message-id"
        },
        reaction: "ðŸ‘"
      }
    }
  ] as const satisfies readonly EvolutionEndpointProbe[];
}

function toUtcDayKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isInstanceAlreadyInUseError(error: EvolutionApiError) {
  if (![400, 403, 409].includes(error.statusCode)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  const normalizedDetails = JSON.stringify(error.details ?? "").toLowerCase();
  const combined = `${normalizedMessage} ${normalizedDetails}`;

  return /already|exist|in use|ja existe|em uso/.test(combined);
}

function extractQrAndPairing(source: unknown): { qrCode: string | null; pairingCode: string | null } {
  const queue: unknown[] = [source];
  let qrCode: string | null = null;
  let pairingCode: string | null = null;
  let depth = 0;

  while (queue.length > 0 && depth < 1000) {
    depth += 1;
    const current = queue.shift();

    if (typeof current === "string") {
      if (!qrCode) {
        qrCode = normalizeQrDataUrl(current);
      }
      if (!pairingCode) {
        pairingCode = normalizePairingText(current);
      }
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    const obj = current as Record<string, unknown>;
    const prioritizedKeys = ["base64", "qrcode", "qr", "code", "pairingCode"];

    for (const key of prioritizedKeys) {
      const value = obj[key];
      if (typeof value === "string") {
        if (!qrCode && (key === "base64" || key === "qrcode" || key === "qr")) {
          qrCode = normalizeQrDataUrl(value);
        }
        if (!pairingCode && (key === "code" || key === "pairingCode")) {
          pairingCode = normalizePairingText(value);
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return { qrCode, pairingCode };
}

export async function tenantRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/me", async (request, reply) => {
      const user = await prisma.user.findFirst({
        where: {
          id: request.authUser.sub,
          tenantId: request.authUser.tenantId
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return reply.code(404).send({ message: "Usuario nao encontrado" });
      }

      return user;
    });

    protectedApp.get("/tenant", async (request, reply) => {
      const [tenant, currentUsers] = await prisma.$transaction([
        prisma.tenant.findUnique({
          where: {
            id: request.authUser.tenantId
          },
          select: {
            id: true,
            slug: true,
            name: true,
            whatsappInstance: true,
            evolutionApiKey: true,
            maxChannels: true,
            maxUsers: true,
            retentionDays: true,
            maxUploadMb: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        prisma.user.count({
          where: {
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const instanceName = tenant.whatsappInstance;
      const currentChannels = resolveConfiguredChannelCount(instanceName);
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsappInstance: instanceName,
        maxChannels: tenant.maxChannels,
        maxUsers: tenant.maxUsers,
        retentionDays: tenant.retentionDays,
        maxUploadMb: tenant.maxUploadMb,
        currentChannels,
        currentUsers,
        hasEvolutionApiKey: Boolean(tenant.evolutionApiKey || env.EVOLUTION_API_KEY),
        webhookUrl: buildWebhookUrl(tenant.slug),
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        canViewSensitive: canReadSensitiveConfig(request.authUser.role),
        evolutionApiKey:
          canReadSensitiveConfig(request.authUser.role) && tenant.evolutionApiKey
            ? tenant.evolutionApiKey
            : null
      };
    });

    protectedApp.get("/tenant/audit-events", async (request, reply) => {
      if (!requireAdminOrSupervisor(request, reply)) {
        return;
      }

      const query = listAuditEventsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          message: "Query invalida",
          errors: query.error.flatten()
        });
      }

      const where: Prisma.AuditEventWhereInput = {
        tenantId: request.authUser.tenantId
      };

      if (query.data.before) {
        where.createdAt = { lt: query.data.before };
      }

      if (query.data.eventType) {
        where.eventType = query.data.eventType;
      }

      if (query.data.conversationId) {
        where.conversationId = query.data.conversationId;
      }

      if (query.data.messageId) {
        where.messageId = query.data.messageId;
      }

      if (query.data.actorUserId) {
        where.actorUserId = query.data.actorUserId;
      }

      const rows = await prisma.auditEvent.findMany({
        where,
        take: query.data.limit + 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          conversation: {
            select: {
              id: true,
              channel: true,
              externalId: true,
              contactName: true
            }
          },
          message: {
            select: {
              id: true,
              direction: true,
              messageType: true,
              status: true
            }
          }
        }
      });

      const hasMore = rows.length > query.data.limit;
      const events = hasMore ? rows.slice(0, query.data.limit) : rows;
      const nextBefore = hasMore && events.length > 0
        ? events[events.length - 1]?.createdAt.toISOString()
        : null;

      return {
        events,
        hasMore,
        nextBefore
      };
    });

    protectedApp.get("/tenant/metrics/failures", async (request, reply) => {
      if (!requireAdminOrSupervisor(request, reply)) {
        return;
      }

      const query = failuresDashboardQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          message: "Query invalida",
          errors: query.error.flatten()
        });
      }

      const now = new Date();
      const since = new Date(now.getTime() - query.data.days * 24 * 60 * 60 * 1000);
      const where: Prisma.MessageWhereInput = {
        tenantId: request.authUser.tenantId,
        status: MessageStatus.FAILED,
        createdAt: {
          gte: since
        }
      };

      type DailyFailureRow = {
        day: Date;
        messageType: string;
        total: number;
      };

      const [failedByTypeRaw, failedTotal, recentFailures, dailyRowsRaw] = await prisma.$transaction([
        prisma.message.groupBy({
          by: ["messageType"],
          where,
          _count: {
            messageType: true
          },
          orderBy: {
            _count: {
              messageType: "desc"
            }
          }
        }),
        prisma.message.count({
          where
        }),
        prisma.message.findMany({
          where,
          orderBy: {
            createdAt: "desc"
          },
          take: 20,
          select: {
            id: true,
            conversationId: true,
            messageType: true,
            content: true,
            createdAt: true,
            status: true,
            conversation: {
              select: {
                contactName: true,
                externalId: true
              }
            }
          }
        }),
        prisma.$queryRaw<DailyFailureRow[]>(Prisma.sql`
          select
            date_trunc('day', "createdAt") as day,
            "messageType"::text as "messageType",
            count(*)::int as total
          from "Message"
          where "tenantId" = ${request.authUser.tenantId}
            and "status" = 'FAILED'::"MessageStatus"
            and "createdAt" >= ${since}
          group by 1, 2
          order by 1 asc
        `)
      ]);

      const messageTypes = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"] as const;
      const failedByType = failedByTypeRaw
        .map((entry) => {
          const total =
            typeof entry._count === "object" &&
            entry._count !== null &&
            "messageType" in entry._count
              ? Number((entry._count as { messageType?: number }).messageType ?? 0)
              : 0;

          return {
            messageType: entry.messageType,
            total
          };
        })
        .sort((left, right) => right.total - left.total);

      const dayMap = new Map<
        string,
        {
          day: string;
          total: number;
          byType: Record<string, number>;
        }
      >();

      for (let offset = query.data.days; offset >= 0; offset -= 1) {
        const dayDate = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
        const day = toUtcDayKey(dayDate);
        dayMap.set(day, {
          day,
          total: 0,
          byType: Object.fromEntries(messageTypes.map((type) => [type, 0]))
        });
      }

      for (const row of dailyRowsRaw) {
        const dayKey = toUtcDayKey(new Date(row.day));
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, {
            day: dayKey,
            total: 0,
            byType: Object.fromEntries(messageTypes.map((type) => [type, 0]))
          });
        }

        const current = dayMap.get(dayKey);
        if (!current) {
          continue;
        }

        const messageType = row.messageType.toUpperCase();
        const nextValue = Number(row.total) || 0;
        current.byType[messageType] = (current.byType[messageType] ?? 0) + nextValue;
        current.total += nextValue;
      }

      const dailySeries = [...dayMap.values()].sort((left, right) => left.day.localeCompare(right.day));

      return {
        generatedAt: now.toISOString(),
        windowDays: query.data.days,
        since: since.toISOString(),
        failedTotal,
        failedByType,
        dailySeries,
        recentFailures: recentFailures.map((entry) => ({
          id: entry.id,
          conversationId: entry.conversationId,
          messageType: entry.messageType,
          status: entry.status,
          createdAt: entry.createdAt,
          content: entry.content,
          contactName: entry.conversation.contactName,
          externalId: entry.conversation.externalId
        }))
      };
    });

    protectedApp.patch("/tenant", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const parsed = updateTenantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const evolutionApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);
      const [currentTenant, currentUsers] = await prisma.$transaction([
        prisma.tenant.findUnique({
          where: { id: request.authUser.tenantId },
          select: {
            id: true,
            whatsappInstance: true,
            maxChannels: true,
            maxUsers: true,
            retentionDays: true,
            maxUploadMb: true
          }
        }),
        prisma.user.count({
          where: {
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!currentTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const currentChannels = resolveConfiguredChannelCount(currentTenant.whatsappInstance);
      const nextMaxUsers = parsed.data.maxUsers ?? currentTenant.maxUsers;
      const nextMaxChannels = parsed.data.maxChannels ?? currentTenant.maxChannels;
      const nextRetentionDays = parsed.data.retentionDays ?? currentTenant.retentionDays;
      const nextMaxUploadMb = parsed.data.maxUploadMb ?? currentTenant.maxUploadMb;

      if (nextMaxUsers < currentUsers) {
        return reply.code(409).send({
          message: "Limite de usuarios nao pode ficar abaixo do total atual do tenant.",
          details: {
            currentUsers,
            nextMaxUsers
          }
        });
      }

      if (nextMaxChannels < currentChannels) {
        return reply.code(409).send({
          message: "Limite de canais nao pode ficar abaixo dos canais configurados no tenant.",
          details: {
            currentChannels,
            nextMaxChannels
          }
        });
      }

      const updated = await prisma.tenant.update({
        where: { id: request.authUser.tenantId },
        data: {
          name: parsed.data.name,
          whatsappInstance: parsed.data.whatsappInstance,
          evolutionApiKey,
          maxChannels: nextMaxChannels,
          maxUsers: nextMaxUsers,
          retentionDays: nextRetentionDays,
          maxUploadMb: nextMaxUploadMb
        },
        select: {
          id: true,
          slug: true,
          name: true,
          whatsappInstance: true,
          evolutionApiKey: true,
          maxChannels: true,
          maxUsers: true,
          retentionDays: true,
          maxUploadMb: true,
          createdAt: true,
          updatedAt: true
        }
      });

      const nextCurrentChannels = resolveConfiguredChannelCount(updated.whatsappInstance);
      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        whatsappInstance: updated.whatsappInstance,
        maxChannels: updated.maxChannels,
        maxUsers: updated.maxUsers,
        retentionDays: updated.retentionDays,
        maxUploadMb: updated.maxUploadMb,
        currentChannels: nextCurrentChannels,
        currentUsers,
        hasEvolutionApiKey: Boolean(updated.evolutionApiKey || env.EVOLUTION_API_KEY),
        webhookUrl: buildWebhookUrl(updated.slug),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        canViewSensitive: canReadSensitiveConfig(request.authUser.role),
        evolutionApiKey:
          canReadSensitiveConfig(request.authUser.role) && updated.evolutionApiKey
            ? updated.evolutionApiKey
            : null
      };
    });

    protectedApp.get("/tenant/whatsapp/status", async (request, reply) => {
      const tenant = await getTenantOrFail(request.authUser.tenantId);
      const instanceName = tenant.whatsappInstance;

      if (!instanceName) {
        return {
          configured: false,
          message: "Tenant ainda nao possui instancia WhatsApp configurada"
        };
      }

      try {
        const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
        const [connectionState, webhook] = await Promise.all([
          client.getConnectionState(instanceName),
          client.findWebhook(instanceName)
        ]);

        return {
          configured: true,
          instanceName,
          webhookUrl: buildWebhookUrl(tenant.slug),
          connectionState,
          webhook
        };
      } catch (error) {
        if (error instanceof EvolutionApiError) {
          return reply.code(error.statusCode).send({
            message: error.message,
            details: error.details
          });
        }
        throw error;
      }
    });

    protectedApp.post("/tenant/whatsapp/validate-endpoints", async (request, reply) => {
      if (!requireAdminOrSupervisor(request, reply)) {
        return;
      }

      const parsed = validateWhatsAppEndpointsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenant = await getTenantOrFail(request.authUser.tenantId);
      const instanceName = resolveInstanceName(
        parsed.data.instanceName,
        tenant.whatsappInstance,
        tenant.slug
      );

      if (!env.EVOLUTION_BASE_URL) {
        return reply.code(400).send({
          message: "EVOLUTION_BASE_URL nao configurada no ambiente"
        });
      }

      const apiKey = tenant.evolutionApiKey ?? env.EVOLUTION_API_KEY;
      if (!apiKey) {
        return reply.code(400).send({
          message: "Nenhuma API key da Evolution configurada (tenant ou ambiente)"
        });
      }

      const baseUrl = stripTrailingSlash(env.EVOLUTION_BASE_URL);
      const requestConfig = {
        headers: {
          apikey: apiKey
        },
        timeout: env.EVOLUTION_REQUEST_TIMEOUT_MS
      };

      const probes = buildEndpointProbes();
      const results = await Promise.all(
        probes.map(async (probe) => {
          const resolvedPath = resolvePathTemplate(probe.pathTemplate, instanceName);
          if (!resolvedPath) {
            return {
              key: probe.key,
              label: probe.label,
              pathTemplate: probe.pathTemplate,
              resolvedPath: null,
              status: "missing_route" as EndpointValidationStatus,
              available: false,
              httpStatus: null as number | null,
              message: "Path nao configurado"
            };
          }

          const url = `${baseUrl}${resolvedPath}`;

          try {
            const response = await axios.post(url, probe.payload, requestConfig);
            return {
              key: probe.key,
              label: probe.label,
              pathTemplate: probe.pathTemplate,
              resolvedPath,
              status: "ok" as EndpointValidationStatus,
              available: true,
              httpStatus: response.status,
              message: "Endpoint respondeu com sucesso"
            };
          } catch (error) {
            if (axios.isAxiosError(error)) {
              const statusCode = error.response?.status ?? null;
              const status = classifyEndpointValidationStatus(statusCode);
              const fallbackMessage =
                error.message || "Falha ao validar endpoint na Evolution API";

              return {
                key: probe.key,
                label: probe.label,
                pathTemplate: probe.pathTemplate,
                resolvedPath,
                status,
                available: status === "ok" || status === "validation_error",
                httpStatus: statusCode,
                message: extractEndpointValidationMessage(error.response?.data, fallbackMessage)
              };
            }

            return {
              key: probe.key,
              label: probe.label,
              pathTemplate: probe.pathTemplate,
              resolvedPath,
              status: "unexpected_error" as EndpointValidationStatus,
              available: false,
              httpStatus: null as number | null,
              message: error instanceof Error ? error.message : "Erro inesperado"
            };
          }
        })
      );

      const summary = {
        total: results.length,
        available: results.filter((entry) => entry.available).length,
        missingRoute: results.filter((entry) => entry.status === "missing_route").length,
        authError: results.filter((entry) => entry.status === "auth_error").length,
        providerError: results.filter((entry) => entry.status === "provider_error").length,
        networkError: results.filter((entry) => entry.status === "network_error").length
      };

      return {
        instanceName,
        generatedAt: new Date().toISOString(),
        baseUrl,
        timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS,
        endpoints: results,
        summary
      };
    });

    protectedApp.get("/tenant/whatsapp/qrcode", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const query = qrCodeQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({ message: "Query invalida" });
      }

      const tenant = await getTenantOrFail(request.authUser.tenantId);
      if (!tenant.whatsappInstance) {
        return reply.code(400).send({
          configured: false,
          message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
        });
      }

      try {
        const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);

        let qrCode: string | null = null;
        let pairingCode: string | null = null;
        let source = "none";

        if (query.data.force) {
          const connectResult = await client.connectInstance({
            instanceName: tenant.whatsappInstance
          });
          const extracted = extractQrAndPairing(connectResult);
          qrCode = extracted.qrCode;
          pairingCode = extracted.pairingCode;
          source = "connect";
        }

        if (!qrCode) {
          const instances = await client.fetchInstances();
          const extractedFromInstances = extractQrAndPairing(instances);
          qrCode = extractedFromInstances.qrCode;
          pairingCode = pairingCode ?? extractedFromInstances.pairingCode;
          source = "fetchInstances";
        }

        if (!qrCode) {
          qrCode = await getLatestQrCode(tenant.id, tenant.whatsappInstance);
          if (qrCode) {
            source = "cache";
          }
        }

        if (qrCode) {
          await setLatestQrCode(tenant.id, tenant.whatsappInstance, qrCode);
        }

        const connectionState = await client.getConnectionState(tenant.whatsappInstance);
        const connectionStateLabel = normalizeConnectionState(connectionState);
        let message: string | undefined;

        if (!qrCode) {
          if (connectionStateLabel === "open" || connectionStateLabel === "connected") {
            message =
              "Instancia ja conectada. Desconecte a sessao atual para gerar um novo QR Code.";
          } else if (connectionStateLabel === "connecting") {
            message =
              "Aguardando emissao do QR Code pela instancia. Tente atualizar novamente em alguns segundos.";
          } else {
            message =
              "QR Code ainda indisponivel para esta instancia. Tente conectar novamente.";
          }
        }

        return {
          configured: true,
          instanceName: tenant.whatsappInstance,
          qrCode,
          pairingCode,
          source,
          message,
          connectionState
        };
      } catch (error) {
        if (error instanceof EvolutionApiError) {
          return reply.code(error.statusCode).send({
            message: error.message,
            details: error.details
          });
        }
        throw error;
      }
    });

    protectedApp.post("/tenant/whatsapp/bootstrap", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const parsed = bootstrapWhatsAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenant = await getTenantOrFail(request.authUser.tenantId);
      const instanceName = resolveInstanceName(
        parsed.data.instanceName,
        tenant.whatsappInstance,
        tenant.slug
      );
      const currentChannels = resolveConfiguredChannelCount(tenant.whatsappInstance);
      const currentInstance = tenant.whatsappInstance?.trim() || null;
      const isReusingCurrentInstance = Boolean(currentInstance && currentInstance === instanceName);

      if (!isReusingCurrentInstance && currentChannels >= tenant.maxChannels) {
        return reply.code(409).send({
          message: "Limite de canais do plano atingido para este tenant.",
          details: {
            maxChannels: tenant.maxChannels,
            currentChannels
          }
        });
      }

      const tenantApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);

      const updatedTenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          whatsappInstance: instanceName,
          evolutionApiKey: tenantApiKey !== undefined ? tenantApiKey : undefined
        }
      });

      const webhookUrl = buildWebhookUrl(updatedTenant.slug);
      const webhookHeaders = buildWebhookHeaders();

      try {
        const client = createEvolutionClientOrThrow(updatedTenant.evolutionApiKey);
        let created = true;
        let createResult: Record<string, unknown> | null = null;

        try {
          createResult = await client.createInstance({
            instanceName,
            webhookUrl,
            number: parsed.data.number,
            webhookHeaders
          });
        } catch (error) {
          if (error instanceof EvolutionApiError && isInstanceAlreadyInUseError(error)) {
            created = false;
          } else {
            throw error;
          }
        }

        const webhookResult = await client.setWebhook({
          instanceName,
          webhookUrl,
          webhookHeaders
        });
        const connectResult = await client.connectInstance({
          instanceName,
          number: parsed.data.number
        });
        const connectionState = await client.getConnectionState(instanceName);

        return {
          success: true,
          instanceName,
          webhookUrl,
          created,
          createResult,
          webhookResult,
          connectResult,
          connectionState
        };
      } catch (error) {
        if (error instanceof EvolutionApiError) {
          return reply.code(error.statusCode).send({
            message: error.message,
            details: error.details
          });
        }
        throw error;
      }
    });

    protectedApp.post("/tenant/whatsapp/connect", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const parsed = connectWhatsAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenant = await getTenantOrFail(request.authUser.tenantId);
      if (!tenant.whatsappInstance) {
        return reply.code(400).send({
          message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
        });
      }

      try {
        const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
        const connectResult = await client.connectInstance({
          instanceName: tenant.whatsappInstance,
          number: parsed.data.number
        });
        const connectionState = await client.getConnectionState(tenant.whatsappInstance);

        return {
          success: true,
          instanceName: tenant.whatsappInstance,
          connectResult,
          mode: parsed.data.number ? "PAIRING_CODE" : "QRCODE",
          connectionState
        };
      } catch (error) {
        if (error instanceof EvolutionApiError) {
          return reply.code(error.statusCode).send({
            message: error.message,
            details: error.details
          });
        }
        throw error;
      }
    });

    protectedApp.post("/tenant/whatsapp/logout", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const tenant = await getTenantOrFail(request.authUser.tenantId);
      if (!tenant.whatsappInstance) {
        return reply.code(400).send({
          message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
        });
      }

      try {
        const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
        const logoutResult = await client.logoutInstance(tenant.whatsappInstance);
        const connectionState = await client.getConnectionState(tenant.whatsappInstance);

        return {
          success: true,
          instanceName: tenant.whatsappInstance,
          logoutResult,
          connectionState
        };
      } catch (error) {
        if (error instanceof EvolutionApiError) {
          return reply.code(error.statusCode).send({
            message: error.message,
            details: error.details
          });
        }
        throw error;
      }
    });
  });
}

