export function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
}

export function normalizePairingText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return null;
  }

  if (trimmed.length > 64) {
    return null;
  }

  if (!/^[A-Za-z0-9\-_.@:+/]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function normalizeConnectionState(source: unknown) {
  const state = (source as { instance?: { state?: unknown } } | null)?.instance?.state;

  if (typeof state !== "string") {
    return "unknown";
  }

  return state.trim().toLowerCase();
}

export function extractQrAndPairing(
  source: unknown
): { qrCode: string | null; pairingCode: string | null } {
  const queue: unknown[] = [source];
  let qrCode: string | null = null;
  let pairingCode: string | null = null;
  let depth = 0;

  while (queue.length > 0 && depth < 1000) {
    depth += 1;
    const current = queue.shift();

    if (typeof current === "string") {
      if (!qrCode) {
        qrCode = normalizeQrDataUrl(current);
      }
      if (!pairingCode) {
        pairingCode = normalizePairingText(current);
      }
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    const obj = current as Record<string, unknown>;
    const prioritizedKeys = ["base64", "qrcode", "qr", "code", "pairingCode"];

    for (const key of prioritizedKeys) {
      const value = obj[key];
      if (typeof value === "string") {
        if (!qrCode && (key === "base64" || key === "qrcode" || key === "qr")) {
          qrCode = normalizeQrDataUrl(value);
        }
        if (!pairingCode && (key === "code" || key === "pairingCode")) {
          pairingCode = normalizePairingText(value);
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return { qrCode, pairingCode };
}
