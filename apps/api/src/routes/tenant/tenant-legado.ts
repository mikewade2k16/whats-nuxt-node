import type { FastifyInstance } from "fastify";
import { requireAtendimentoModuleAccess } from "../../lib/guards.js";
import { registerTenantAuditRoutes } from "./routes-audit.js";
import { registerClientRoutes } from "./routes-clients.js";
import { registerTenantCoreRoutes } from "./routes-core.js";
import { registerTenantWhatsAppRoutes } from "./routes-whatsapp.js";

export async function tenantRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);
    protectedApp.addHook("preHandler", async (request, reply) => {
      const allowed = await requireAtendimentoModuleAccess(request, reply);
      if (!allowed) {
        return reply;
      }
    });

    registerTenantCoreRoutes(protectedApp);
    registerClientRoutes(protectedApp);
    registerTenantAuditRoutes(protectedApp);
    registerTenantWhatsAppRoutes(protectedApp);
  });
}
