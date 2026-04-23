import type { FastifyInstance } from "fastify";
import axios from "axios";
import { env } from "../../config.js";
import { requireAdminOrSupervisor } from "../../lib/guards.js";
import {
  type EndpointValidationStatus,
  buildEndpointProbes,
  classifyEndpointValidationStatus,
  extractEndpointValidationMessage,
  getTenantOrFail,
  resolveInstanceName,
  resolvePathTemplate,
  stripTrailingSlash
} from "./helpers.js";
import { validateWhatsAppEndpointsSchema } from "./schemas.js";
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";

export function registerTenantWhatsAppValidateRoute(protectedApp: FastifyInstance) {
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
    const selectedInstance = parsed.data.instanceId
      ? await resolveTenantInstanceById({
          tenantId: tenant.id,
          instanceId: parsed.data.instanceId,
          includeInactive: true
        })
      : null;
    const instanceName = resolveInstanceName(
      parsed.data.instanceName,
      selectedInstance?.instanceName ?? tenant.whatsappInstance,
      tenant.slug
    );

    if (!env.EVOLUTION_BASE_URL) {
      return reply.code(400).send({
        message: "EVOLUTION_BASE_URL nao configurada no ambiente"
      });
    }

    const apiKey = env.EVOLUTION_API_KEY;
    if (!apiKey) {
      return reply.code(400).send({
        message: "Nenhuma API key global da Evolution configurada no ambiente"
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
            const fallbackMessage = error.message || "Falha ao validar endpoint na Evolution API";

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
}
