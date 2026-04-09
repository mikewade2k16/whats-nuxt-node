import { isIP } from "node:net";
import { env } from "../../config.js";

export function isBlockedIpv4Address(hostname: string) {
  const parts = hostname.split(".").map((entry) => Number(entry));
  if (parts.length !== 4 || parts.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }

  return false;
}

export function isBlockedIpv6Address(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "::1") {
    return true;
  }

  return normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

export function isBlockedMediaProxyHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isBlockedIpv4Address(normalized);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6Address(normalized);
  }

  return false;
}

export function normalizeSandboxDestination(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.endsWith("@g.us") || trimmed.endsWith("@broadcast")) {
    return trimmed;
  }

  const [left, suffix] = trimmed.split("@");
  if (suffix === "s.whatsapp.net") {
    const digits = left.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }

  return `${digits}@s.whatsapp.net`;
}

export function buildSandboxCandidates(value: string | null | undefined) {
  const set = new Set<string>();
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return set;
  }

  set.add(trimmed);

  const normalized = normalizeSandboxDestination(trimmed);
  if (normalized) {
    set.add(normalized);
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    set.add(digits);
    set.add(`${digits}@s.whatsapp.net`);
  }

  return set;
}

const SANDBOX_ALLOWLIST_RAW_VALUES = env.SANDBOX_ALLOWLIST
  .split(/[,\n;]+/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const SANDBOX_ALLOWLIST_ALL = SANDBOX_ALLOWLIST_RAW_VALUES.some((entry) => entry === "*");

const SANDBOX_ALLOWLIST_SET = (() => {
  const set = new Set<string>();
  for (const entry of SANDBOX_ALLOWLIST_RAW_VALUES) {
    for (const candidate of buildSandboxCandidates(entry)) {
      set.add(candidate);
    }
  }
  return set;
})();

export function isSandboxDestinationAllowed(externalId: string) {
  if (!env.SANDBOX_ENABLED) {
    return true;
  }

  if (SANDBOX_ALLOWLIST_ALL) {
    return true;
  }

  if (SANDBOX_ALLOWLIST_SET.size === 0) {
    return false;
  }

  const candidates = buildSandboxCandidates(externalId);
  for (const candidate of candidates) {
    if (SANDBOX_ALLOWLIST_SET.has(candidate)) {
      return true;
    }
  }

  return false;
}

export function resolveSandboxTestExternalId() {
  const normalized = normalizeSandboxDestination(env.SANDBOX_TEST_EXTERNAL_ID);
  if (normalized) {
    return normalized;
  }

  return "5511999999999@s.whatsapp.net";
}


