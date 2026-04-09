import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isPlatformSuperRoot, resolveCoreTenantById } from "../services/auth-context.js";
import { env } from "../config.js";
import { type CoreTenant, platformCoreClient } from "../services/core-client.js";

const sessionContextSchema = z.object({
  coreTenantId: z.string().min(1).optional(),
  clientId: z.number().int().positive().optional()
}).refine(
  (data) => Boolean(data.coreTenantId || data.clientId),
  { message: "Informe coreTenantId ou clientId" }
);

export async function sessionContextRoutes(app: FastifyInstance) {
  app.post("/session/context", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    if (!request.coreAccessToken) {
      return reply.code(401).send({
        message: "Sessao core ausente para atualizar o contexto operacional"
      });
    }

    if (!isPlatformSuperRoot(request.coreAccess)) {
      return reply.code(403).send({ message: "Apenas platform admins podem atualizar o contexto operacional" });
    }

    const parsed = sessionContextSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    try {
      let coreTenant: CoreTenant | null = null;
      let clientModuleCodes: string[] = [];

      if (parsed.data.coreTenantId) {
        coreTenant = await resolveCoreTenantById(parsed.data.coreTenantId, {
          accessToken: request.coreAccessToken
        });
      } else if (parsed.data.clientId) {
        const clients = await platformCoreClient.listAdminClients({
          limit: 500,
          accessToken: request.coreAccessToken
        });
        const matched = clients.find((entry) => entry.id === parsed.data.clientId);
        if (matched?.coreTenantId) {
          coreTenant = await resolveCoreTenantById(matched.coreTenantId, {
            accessToken: request.coreAccessToken
          });
          clientModuleCodes = (matched.modules ?? [])
            .map((entry) => String(entry.code ?? "").trim().toLowerCase())
            .filter(Boolean);
        }
      }

      if (!coreTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      if (clientModuleCodes.length > 0 && !clientModuleCodes.includes(env.CORE_ATENDIMENTO_MODULE_CODE.toLowerCase())) {
        return reply.code(403).send({
          message: "Cliente nao possui o modulo de atendimento ativo"
        });
      }

      return {
        token: request.coreAccessToken,
        sessionContext: {
          tenantId: coreTenant.id,
          tenantSlug: coreTenant.slug
        }
      };
    } catch (error) {
      request.log.error({ error }, "Falha ao atualizar contexto operacional");
      return reply.code(500).send({
        message: "Falha ao atualizar contexto operacional"
      });
    }
  });
}
