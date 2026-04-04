import type { FastifyInstance } from "fastify";
import { registerTenantWhatsAppQrCodeRoute } from "./routes-whatsapp-qrcode.js";
import { registerTenantWhatsAppSessionRoutes } from "./routes-whatsapp-session.js";
import { registerTenantWhatsAppStatusRoute } from "./routes-whatsapp-status.js";
import { registerTenantWhatsAppValidateRoute } from "./routes-whatsapp-validate.js";
import { registerTenantWhatsAppInstancesRoutes } from "./routes-whatsapp-instances.js";
import { registerAtendimentoUsersRoutes } from "./routes-atendimento-users.js";

export function registerTenantWhatsAppRoutes(protectedApp: FastifyInstance) {
  registerTenantWhatsAppInstancesRoutes(protectedApp);
  registerAtendimentoUsersRoutes(protectedApp);
  registerTenantWhatsAppStatusRoute(protectedApp);
  registerTenantWhatsAppValidateRoute(protectedApp);
  registerTenantWhatsAppQrCodeRoute(protectedApp);
  registerTenantWhatsAppSessionRoutes(protectedApp);
}
