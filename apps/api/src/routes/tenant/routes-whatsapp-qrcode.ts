import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/guards.js";
import { EvolutionApiError } from "../../services/evolution-client.js";
import { getLatestQrCode, setLatestQrCode } from "../../services/whatsapp-qr-cache.js";
import {
  createEvolutionClientOrThrow,
  extractQrAndPairing,
  getTenantOrFail,
  normalizeConnectionState
} from "./helpers.js";
import { qrCodeQuerySchema } from "./schemas.js";

export function registerTenantWhatsAppQrCodeRoute(protectedApp: FastifyInstance) {
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
          message = "QR Code ainda indisponivel para esta instancia. Tente conectar novamente.";
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
}
