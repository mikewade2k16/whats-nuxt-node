import { env } from "../../config.js";
import type { IncomingWebhookPayload } from "./webhook-contracts.js";

export const MESSAGE_CREATE_EVENTS = new Set(["MESSAGES_UPSERT"]);
export const MESSAGE_UPDATE_EVENTS = new Set(["MESSAGES_UPDATE"]);

export function normalizeEventName(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

export function parseEventName(payload: IncomingWebhookPayload, pathEventName?: string) {
  const rawEvent =
    (payload.event as string | undefined) ??
    (payload.type as string | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.event as string | undefined) ??
    pathEventName;

  return rawEvent ? normalizeEventName(rawEvent) : "";
}

export function extractInstanceName(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return (
    (payload.instance as string | undefined) ??
    (payload.instanceName as string | undefined) ??
    (data.instance as string | undefined) ??
    (data.instanceName as string | undefined) ??
    ""
  );
}

export function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  return `data:image/png;base64,${trimmed}`;
}

export function extractQrCode(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const qrcode = (data.qrcode ?? {}) as Record<string, unknown>;

  const candidates = [
    payload.base64,
    payload.qrcode,
    data.base64,
    data.qrcode,
    qrcode.base64,
    qrcode.code,
    (data.pairingCode as string | undefined) ?? (payload.pairingCode as string | undefined)
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeQrDataUrl(candidate);
    }
  }

  return null;
}

export function shouldValidateWebhookToken() {
  const token = env.EVOLUTION_WEBHOOK_TOKEN?.trim();
  if (!token) {
    return false;
  }

  if (/^change-this-|^example-|^your-/i.test(token)) {
    return false;
  }

  return true;
}
