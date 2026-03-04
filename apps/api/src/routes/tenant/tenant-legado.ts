import type { FastifyInstance } from "fastify";
import { registerTenantAuditRoutes } from "./routes-audit.js";
import { registerClientRoutes } from "./routes-clients.js";
import { registerTenantCoreRoutes } from "./routes-core.js";
import { registerTenantWhatsAppRoutes } from "./routes-whatsapp.js";

export async function tenantRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    registerTenantCoreRoutes(protectedApp);
    registerClientRoutes(protectedApp);
    registerTenantAuditRoutes(protectedApp);
    registerTenantWhatsAppRoutes(protectedApp);
  });
}
