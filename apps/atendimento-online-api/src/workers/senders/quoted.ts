function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isLikelyInternalMessageId(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("temp-")) {
    return true;
  }

  return /^c[a-z0-9]{20,}$/i.test(normalized);
}

function resolveQuotedMessageId(reply: Record<string, unknown>) {
  const explicitExternalId =
    typeof reply.externalMessageId === "string" ? reply.externalMessageId.trim() : "";
  if (explicitExternalId) {
    return explicitExternalId;
  }

  const legacyMessageId = typeof reply.messageId === "string" ? reply.messageId.trim() : "";
  if (!legacyMessageId || isLikelyInternalMessageId(legacyMessageId)) {
    return null;
  }

  return legacyMessageId;
}

export function extractQuoted(metadataJson: unknown, remoteJid: string | null) {
  const metadata = asRecord(metadataJson);
  const reply = metadata ? asRecord(metadata.reply) : null;
  if (!reply || !remoteJid) {
    return null;
  }

  const stanzaId = resolveQuotedMessageId(reply);
  if (!stanzaId) {
    return null;
  }

  return {
    key: {
      id: stanzaId
    }
  };
}
