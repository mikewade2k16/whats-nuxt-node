const MESSAGE_WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "editedMessage"
];

const SUPPORTED_MESSAGE_PAYLOAD_KEYS = new Set([
  "conversation",
  "extendedTextMessage",
  "reactionMessage",
  "contactMessage",
  "contactsArrayMessage",
  "stickerMessage",
  "imageMessage",
  "audioMessage",
  "videoMessage",
  "documentMessage",
  ...MESSAGE_WRAPPER_KEYS
]);

const IGNORED_UNSUPPORTED_MESSAGE_KEYS = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo"
]);

const UNSUPPORTED_MESSAGE_LABELS: Record<string, string> = {
  stickerMessage: "figurinha",
  reactionMessage: "reacao",
  pollCreationMessage: "enquete",
  pollUpdateMessage: "voto de enquete",
  contactMessage: "contato",
  contactsArrayMessage: "contatos",
  locationMessage: "localizacao",
  liveLocationMessage: "localizacao ao vivo",
  listMessage: "lista interativa",
  buttonsMessage: "botoes interativos",
  templateMessage: "template",
  orderMessage: "pedido",
  productMessage: "produto",
  eventMessage: "evento",
  call: "chamada",
  unknown: "tipo desconhecido"
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeUnsupportedTypeKey(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "unknown";
  }

  return normalized;
}

export function unsupportedTypeLabel(typeKey: string) {
  return UNSUPPORTED_MESSAGE_LABELS[typeKey] ?? typeKey.replace(/Message$/i, "").toLowerCase();
}

export function unsupportedTypePlaceholder(typeKey: string) {
  return `[conteudo nao suportado: ${unsupportedTypeLabel(typeKey)}]`;
}

export function shouldIgnoreUnsupportedType(typeKey: string) {
  return IGNORED_UNSUPPORTED_MESSAGE_KEYS.has(typeKey);
}

export function unwrapMessagePayload(payload: Record<string, unknown>) {
  let current = payload;
  let depth = 0;

  while (depth < 8) {
    depth += 1;
    let advanced = false;

    for (const key of MESSAGE_WRAPPER_KEYS) {
      const wrapper = asRecord(current[key]);
      const nested = wrapper ? asRecord(wrapper.message) : null;
      if (nested && Object.keys(nested).length > 0) {
        current = nested;
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      break;
    }
  }

  return current;
}

export function detectUnsupportedMessageType(messagePayload: Record<string, unknown>) {
  const entries = Object.entries(messagePayload);
  for (const [key, value] of entries) {
    if (SUPPORTED_MESSAGE_PAYLOAD_KEYS.has(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }

    return normalizeUnsupportedTypeKey(key);
  }

  return null;
}
