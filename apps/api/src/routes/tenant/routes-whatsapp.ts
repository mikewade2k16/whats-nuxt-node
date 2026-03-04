import type { FastifyInstance } from "fastify";
import { registerTenantWhatsAppQrCodeRoute } from "./routes-whatsapp-qrcode.js";
import { registerTenantWhatsAppSessionRoutes } from "./routes-whatsapp-session.js";
import { registerTenantWhatsAppStatusRoute } from "./routes-whatsapp-status.js";
import { registerTenantWhatsAppValidateRoute } from "./routes-whatsapp-validate.js";

export function registerTenantWhatsAppRoutes(protectedApp: FastifyInstance) {
  registerTenantWhatsAppStatusRoute(protectedApp);
  registerTenantWhatsAppValidateRoute(protectedApp);
  registerTenantWhatsAppQrCodeRoute(protectedApp);
  registerTenantWhatsAppSessionRoutes(protectedApp);
}
