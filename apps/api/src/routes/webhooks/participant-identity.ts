function normalizeRawJid(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/g, "")
    .replace(/@c\.us$/g, "@s.whatsapp.net");
}

export function extractPhone(externalId: string) {
  const normalized = normalizeRawJid(externalId);
  const head = normalized.includes("@") ? normalized.split("@")[0] : normalized;
  const digits = head.replace(/\D/g, "");
  return digits.length > 0 ? digits : normalized;
}

export function normalizeMentionJid(value: string) {
  const normalized = normalizeRawJid(value);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("@")) {
    return normalized;
  }

  const digits = normalized.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

export function normalizeJidForCompare(jid: string | null | undefined) {
  const value = normalizeRawJid(jid);
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
