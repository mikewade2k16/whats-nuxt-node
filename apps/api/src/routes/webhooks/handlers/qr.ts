import type { IncomingWebhookPayload } from "../shared.js";
import { extractQrCode } from "../shared.js";
import { setLatestQrCode } from "../../../services/whatsapp-qr-cache.js";

interface HandleQrWebhookParams {
  tenantId: string;
  instanceName: string;
  eventName: string;
  payload: IncomingWebhookPayload;
}

export async function handleQrWebhook(params: HandleQrWebhookParams) {
  const qrCode = extractQrCode(params.payload);

  if (qrCode) {
    await setLatestQrCode(params.tenantId, params.instanceName, qrCode);
  }

  return {
    statusCode: 202,
    body: {
      status: "ok",
      event: params.eventName,
      hasQrCode: Boolean(qrCode)
    }
  };
}
