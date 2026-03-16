import type { FastifyInstance } from "fastify";
import { EvolutionApiError } from "../../services/evolution-client.js";
import {
  buildWebhookUrl,
  createEvolutionClientOrThrow,
  getTenantOrFail
} from "./helpers.js";
import { whatsappStatusQuerySchema } from "./schemas.js";
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";

interface WhatsAppStatusPayload {
  configured: true;
  instanceName: string;
  webhookUrl: string;
  connectionState: Record<string, unknown>;
  webhook: Record<string, unknown> | null;
  message?: string;
}

interface StatusCacheEntry {
  cachedAt: number;
  expiresAt: number;
  payload: WhatsAppStatusPayload;
}

const STATUS_CACHE_TTL_MS = 5_000;
const STATUS_STALE_MAX_AGE_MS = 60_000;
const statusCacheByKey = new Map<string, StatusCacheEntry>();
const statusInFlightByKey = new Map<string, Promise<WhatsAppStatusPayload>>();

function buildStatusCacheKey(tenantId: string, instanceName: string, includeWebhook: boolean) {
  return `${tenantId}:${instanceName}:${includeWebhook ? "with-webhook" : "state-only"}`;
}

function getCachedStatus(key: string, now = Date.now()) {
  const cached = statusCacheByKey.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt > now) {
    return cached;
  }

  return null;
}

function setCachedStatus(key: string, payload: WhatsAppStatusPayload, now = Date.now()) {
  statusCacheByKey.set(key, {
    cachedAt: now,
    expiresAt: now + STATUS_CACHE_TTL_MS,
    payload
  });
}

export function registerTenantWhatsAppStatusRoute(protectedApp: FastifyInstance) {
  protectedApp.get("/tenant/whatsapp/status", async (request, reply) => {
    const query = whatsappStatusQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: "Query invalida" });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: query.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return {
        configured: false,
        message: "Tenant ainda nao possui instancia WhatsApp configurada"
      };
    }

    const includeWebhook = query.data.includeWebhook;
    const force = query.data.force;
    const instanceName = instance.instanceName;
    const cacheKey = buildStatusCacheKey(tenant.id, instanceName, includeWebhook);
    const now = Date.now();

    if (!force) {
      const cached = getCachedStatus(cacheKey, now);
      if (cached) {
        return cached.payload;
      }
    }

    const inFlight = statusInFlightByKey.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = (async (): Promise<WhatsAppStatusPayload> => {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const connectionState = await client.getConnectionState(instanceName);
      let webhook: Record<string, unknown> | null = null;

      if (includeWebhook) {
        webhook = await client.findWebhook(instanceName);
      }

      const payload: WhatsAppStatusPayload = {
        configured: true,
        instanceName,
        webhookUrl: buildWebhookUrl(tenant.slug),
        connectionState,
        webhook
      };

      setCachedStatus(cacheKey, payload);
      return payload;
    })();

    statusInFlightByKey.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } catch (error) {
      const cached = statusCacheByKey.get(cacheKey);
      if (cached && now - cached.cachedAt <= STATUS_STALE_MAX_AGE_MS) {
        return {
          ...cached.payload,
          message: "Status temporariamente indisponivel na Evolution. Mantendo ultimo estado conhecido."
        };
      }

      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }

      throw error;
    } finally {
      if (statusInFlightByKey.get(cacheKey) === requestPromise) {
        statusInFlightByKey.delete(cacheKey);
      }
    }
  });
}
