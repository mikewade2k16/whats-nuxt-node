import { env } from "../../config.js";
import { EvolutionClient } from "../../services/evolution-client.js";
import { extractPhone, isWeakDisplayName } from "./participant-identity.js";

export function sanitizeDirectConversationName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.endsWith("@s.whatsapp.net") ||
    normalized.endsWith("@g.us") ||
    normalized.endsWith("@lid")
  ) {
    return null;
  }

  return normalized;
}

export function createEvolutionClient(_tenantApiKey?: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    return null;
  }

  const apiKey = env.EVOLUTION_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}

export function resolveDirectConversationName(params: {
  fromMe: boolean;
  senderName: string | null;
  existingConversationName: string | null;
  existingConversationPhone: string | null;
  remoteJid: string;
  incomingLooksLikeTenantUser: boolean;
}) {
  const fromExisting = sanitizeDirectConversationName(params.existingConversationName);
  const fromIncoming = sanitizeDirectConversationName(params.senderName);
  const fallbackPhone = params.existingConversationPhone ?? extractPhone(params.remoteJid);

  if (params.fromMe) {
    return fromExisting ?? fallbackPhone ?? "Contato";
  }

  if (params.incomingLooksLikeTenantUser) {
    return fromExisting ?? fallbackPhone ?? "Contato";
  }

  if (fromExisting && !isWeakDisplayName(fromExisting)) {
    return fromExisting;
  }

  return fromIncoming ?? fromExisting ?? fallbackPhone ?? "Contato";
}
