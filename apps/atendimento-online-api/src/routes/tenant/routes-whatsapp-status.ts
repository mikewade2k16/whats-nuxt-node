import type { FastifyInstance } from "fastify";
import { EvolutionApiError } from "../../services/evolution-client.js";
import {
  buildWebhookHeaders,
  buildWebhookUrl,
  createEvolutionClientOrThrow,
  getTenantOrFail
} from "./helpers.js";
import { whatsappStatusQuerySchema } from "./schemas.js";
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";

interface WhatsAppStatusPayload {
  configured: boolean;
  instanceId?: string;
  instanceName?: string;
  webhookUrl?: string;
  connectionState?: Record<string, unknown>;
  webhook?: Record<string, unknown> | null;
  message?: string;
  providerUnavailable?: boolean;
  degraded?: boolean;
  webhookRepaired?: boolean;
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

function buildMissingEvolutionInstancePayload(params: {
  tenantSlug: string;
  instanceId: string;
  instanceName: string;
}) {
  return {
    configured: false,
    instanceId: params.instanceId,
    instanceName: params.instanceName,
    webhookUrl: buildWebhookUrl(params.tenantSlug),
    message: "Instancia cadastrada no tenant, mas ainda nao existe na Evolution. Abra o Admin e clique em Configurar WhatsApp."
  } satisfies WhatsAppStatusPayload;
}

function buildProviderUnavailableStatusPayload(params: {
  tenantSlug: string;
  instanceId: string;
  instanceName: string;
  message: string;
}) {
  return {
    configured: true,
    instanceId: params.instanceId,
    instanceName: params.instanceName,
    webhookUrl: buildWebhookUrl(params.tenantSlug),
    webhook: null,
    providerUnavailable: true,
    degraded: true,
    connectionState: {
      instance: {
        state: "provider_unavailable"
      }
    },
    message: params.message
  } satisfies WhatsAppStatusPayload;
}

function normalizeWebhookUrl(value: unknown) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function extractWebhookUrl(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "";
  }

  const directCandidates = [
    payload.url,
    payload.webhookUrl
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeWebhookUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const webhook = payload.webhook;
  if (webhook && typeof webhook === "object") {
    return normalizeWebhookUrl((webhook as Record<string, unknown>).url);
  }

  return "";
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
      includeInactive: false
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
      let connectionState: Record<string, unknown>;
      try {
        connectionState = await client.getConnectionState(instanceName);
      } catch (error) {
        if (error instanceof EvolutionApiError && error.statusCode === 404) {
          return buildMissingEvolutionInstancePayload({
            tenantSlug: tenant.slug,
            instanceId: instance.id,
            instanceName
          });
        }

        throw error;
      }

      let webhook: Record<string, unknown> | null = null;
      let webhookRepaired = false;
      const expectedWebhookUrl = buildWebhookUrl(tenant.slug);

      if (includeWebhook) {
        try {
          webhook = await client.findWebhook(instanceName);

          const currentWebhookUrl = extractWebhookUrl(webhook);
          if (currentWebhookUrl !== normalizeWebhookUrl(expectedWebhookUrl)) {
            const webhookHeaders = buildWebhookHeaders();
            const repairedWebhook = await client.setWebhook({
              instanceName,
              webhookUrl: expectedWebhookUrl,
              webhookHeaders
            });

            webhookRepaired = true;
            webhook = await client.findWebhook(instanceName).catch(() => repairedWebhook);
          }
        } catch (error) {
          if (!(error instanceof EvolutionApiError) || error.statusCode !== 404) {
            throw error;
          }
        }
      }

      const payload: WhatsAppStatusPayload = {
        configured: true,
        instanceId: instance.id,
        instanceName,
        webhookUrl: expectedWebhookUrl,
        connectionState,
        webhook,
        webhookRepaired
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
          providerUnavailable: true,
          degraded: true,
          connectionState: cached.payload.connectionState ?? {
            instance: {
              state: "provider_unavailable"
            }
          },
          message: "Status temporariamente indisponivel na Evolution. Mantendo ultimo estado conhecido."
        };
      }

      if (error instanceof EvolutionApiError) {
        return buildProviderUnavailableStatusPayload({
          tenantSlug: tenant.slug,
          instanceId: instance.id,
          instanceName,
          message: error.message
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
