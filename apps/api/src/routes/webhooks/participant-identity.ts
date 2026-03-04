export function extractPhone(externalId: string) {
  const digits = externalId.replace(/\D/g, "");
  return digits.length > 0 ? digits : externalId;
}

export function normalizeMentionJid(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

export function normalizeJidForCompare(jid: string | null | undefined) {
  const value = jid?.trim().toLowerCase();
  if (!value) {
    return null;
  }

  return value;
}

export function isSameParticipant(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeJidForCompare(left);
  const b = normalizeJidForCompare(right);
  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  const aDigits = extractPhone(a);
  const bDigits = extractPhone(b);
  return Boolean(aDigits && bDigits && aDigits === bDigits);
}

export function isWeakDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return true;
  }

  if (normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@g.us") || normalized.endsWith("@lid")) {
    return true;
  }

  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7;
}
