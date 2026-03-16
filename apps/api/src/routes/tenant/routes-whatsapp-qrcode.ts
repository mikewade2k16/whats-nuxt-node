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
import { resolveTenantInstanceById } from "../../services/whatsapp-instances.js";

const FORCE_CONNECT_COOLDOWN_MS = 90_000;
const lastForcedConnectAtByInstance = new Map<string, number>();

function buildConnectGuardKey(tenantId: string, instanceName: string) {
  return `${tenantId}:${instanceName}`;
}

function canAttemptForcedConnect(params: {
  tenantId: string;
  instanceName: string;
  state: string;
}) {
  if (params.state === "open" || params.state === "connected") {
    return {
      allowed: false,
      reason: "already_connected" as const
    };
  }

  const key = buildConnectGuardKey(params.tenantId, params.instanceName);
  const now = Date.now();
  const lastAttemptAt = lastForcedConnectAtByInstance.get(key) ?? 0;

  if (now - lastAttemptAt < FORCE_CONNECT_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: "cooldown" as const
    };
  }

  lastForcedConnectAtByInstance.set(key, now);
  return {
    allowed: true,
    reason: null
  };
}

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
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: query.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(400).send({
        configured: false,
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const instanceName = instance.instanceName;
      const connectionStateBefore = await client.getConnectionState(instanceName);
      const stateBefore = normalizeConnectionState(connectionStateBefore);

      let qrCode: string | null = null;
      let pairingCode: string | null = null;
      let source = "none";
      let forceConnectTriggered = false;
      let forceConnectSkippedReason: "already_connected" | "cooldown" | null = null;

      if (query.data.force) {
        const connectGuard = canAttemptForcedConnect({
          tenantId: tenant.id,
          instanceName,
          state: stateBefore
        });

        if (connectGuard.allowed) {
          const connectResult = await client.connectInstance({
            instanceName
          });
          const extracted = extractQrAndPairing(connectResult);
          qrCode = extracted.qrCode;
          pairingCode = extracted.pairingCode;
          source = "connect";
          forceConnectTriggered = true;
        } else {
          forceConnectSkippedReason = connectGuard.reason;
        }
      }

      if (!qrCode) {
        const instances = await client.fetchInstances();
        const extractedFromInstances = extractQrAndPairing(instances);
        qrCode = extractedFromInstances.qrCode;
        pairingCode = pairingCode ?? extractedFromInstances.pairingCode;
        source = "fetchInstances";
      }

      if (!qrCode) {
        qrCode = await getLatestQrCode(tenant.id, instanceName);
        if (qrCode) {
          source = "cache";
        }
      }

      if (qrCode) {
        await setLatestQrCode(tenant.id, instanceName, qrCode);
      }

      const connectionState = forceConnectTriggered
        ? await client.getConnectionState(instanceName)
        : connectionStateBefore;
      const connectionStateLabel = normalizeConnectionState(connectionState);
      let message: string | undefined;

      if (!qrCode) {
        if (connectionStateLabel === "open" || connectionStateLabel === "connected") {
          message =
            "Instancia ja conectada. Desconecte a sessao atual para gerar um novo QR Code.";
        } else if (forceConnectSkippedReason === "cooldown") {
          message =
            "Aguardando estabilizacao da conexao. Tente gerar QR novamente em alguns segundos.";
        } else if (connectionStateLabel === "connecting") {
          message =
            "Aguardando emissao do QR Code pela instancia. Tente atualizar novamente em alguns segundos.";
        } else {
          message = "QR Code ainda indisponivel para esta instancia. Tente conectar novamente.";
        }
      }

      return {
        configured: true,
        instanceName,
        qrCode,
        pairingCode,
        source,
        message,
        connectionState,
        forceConnectTriggered,
        forceConnectSkippedReason
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
