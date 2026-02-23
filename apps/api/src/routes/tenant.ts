import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { requireAdmin } from "../lib/guards.js";
import { EvolutionApiError, EvolutionClient } from "../services/evolution-client.js";
import { getLatestQrCode, setLatestQrCode } from "../services/whatsapp-qr-cache.js";

const updateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  whatsappInstance: z.string().min(2).max(80).optional(),
  evolutionApiKey: z.string().max(255).optional()
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

function canReadSensitiveConfig(role: "ADMIN" | "AGENT") {
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
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          id: true,
          slug: true,
          name: true,
          whatsappInstance: true,
          evolutionApiKey: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const instanceName = tenant.whatsappInstance;
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsappInstance: instanceName,
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

      const updated = await prisma.tenant.update({
        where: { id: request.authUser.tenantId },
        data: {
          name: parsed.data.name,
          whatsappInstance: parsed.data.whatsappInstance,
          evolutionApiKey
        },
        select: {
          id: true,
          slug: true,
          name: true,
          whatsappInstance: true,
          evolutionApiKey: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        whatsappInstance: updated.whatsappInstance,
        hasEvolutionApiKey: Boolean(updated.evolutionApiKey || env.EVOLUTION_API_KEY),
        webhookUrl: buildWebhookUrl(updated.slug),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
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

        return {
          configured: true,
          instanceName: tenant.whatsappInstance,
          qrCode,
          pairingCode,
          source,
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
  });
}
