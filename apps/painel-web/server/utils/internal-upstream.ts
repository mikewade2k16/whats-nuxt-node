import { readFileSync } from "node:fs";
import { createError, type H3Event } from "h3";
import { sanitizeTransportErrorData } from "~~/server/utils/safe-error";

const DEFAULT_INTERNAL_UPSTREAM_TIMEOUT_MS = 6_000;
const INTERNAL_FALLBACK_HOSTS = ["host.docker.internal", "127.0.0.1"];

interface InternalUpstreamFetchOptions {
  event: H3Event
  targetUrl: string
  fetchInit: RequestInit
  timeoutMs?: number
  statusMessage: string
  fallbackMessage: string
}

function normalizeBaseUrl(value: unknown) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function resolveInternalUpstreamTimeoutMs(event: H3Event, override?: number) {
  if (Number.isFinite(override) && Number(override) > 0) {
    return Math.max(1_000, Math.trunc(Number(override)));
  }

  const config = useRuntimeConfig(event) as Record<string, unknown>;
  const raw = Number(config.internalUpstreamTimeoutMs ?? DEFAULT_INTERNAL_UPSTREAM_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1_000) {
    return DEFAULT_INTERNAL_UPSTREAM_TIMEOUT_MS;
  }

  return Math.trunc(raw);
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

function isLikelyDockerServiceHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized || isLoopbackHostname(normalized)) {
    return false;
  }

  return !normalized.includes(".");
}

function decodeGatewayHexIp(raw: string) {
  if (!/^[0-9a-f]{8}$/i.test(raw)) {
    return "";
  }

  const octets: number[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    octets.unshift(Number.parseInt(raw.slice(index, index + 2), 16));
  }

  return octets.join(".");
}

let cachedDockerGatewayIp = "";
let dockerGatewayIpResolved = false;

function resolveDockerGatewayIp() {
  if (dockerGatewayIpResolved) {
    return cachedDockerGatewayIp;
  }

  dockerGatewayIpResolved = true;

  try {
    const rawRoutes = readFileSync("/proc/net/route", "utf-8");
    const lines = rawRoutes.split(/\r?\n/).slice(1);
    for (const line of lines) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 3) {
        continue;
      }

      const destination = String(columns[1] ?? "").trim().toUpperCase();
      const gateway = String(columns[2] ?? "").trim();
      if (destination !== "00000000") {
        continue;
      }

      const decoded = decodeGatewayHexIp(gateway);
      if (decoded && !isLoopbackHostname(decoded)) {
        cachedDockerGatewayIp = decoded;
        break;
      }
    }
  } catch {
    cachedDockerGatewayIp = "";
  }

  return cachedDockerGatewayIp;
}

function buildInternalUpstreamCandidates(targetUrl: string) {
  const normalizedTarget = normalizeBaseUrl(targetUrl);
  if (!normalizedTarget) {
    return [];
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedTarget);
  } catch {
    return [normalizedTarget];
  }

  const candidates = [parsed.toString()];
  if (isLikelyDockerServiceHostname(parsed.hostname)) {
    const fallbackHosts = [...INTERNAL_FALLBACK_HOSTS];
    const dockerGatewayIp = resolveDockerGatewayIp();
    if (dockerGatewayIp) {
      fallbackHosts.unshift(dockerGatewayIp);
    }

    for (const fallbackHost of fallbackHosts) {
      const next = new URL(parsed.toString());
      next.hostname = fallbackHost;
      candidates.push(next.toString());
    }
  }

  return Array.from(new Set(candidates));
}

function resolveTransportErrorMessage(error: unknown, timeoutMs: number) {
  if (error && typeof error === "object") {
    const timedOut =
      "name" in error && String((error as { name?: unknown }).name ?? "").trim().toLowerCase() === "timeouterror";
    if (timedOut) {
      return `timeout apos ${timeoutMs}ms`;
    }

    const cause = "cause" in error ? (error as { cause?: unknown }).cause : null;
    if (cause && typeof cause === "object") {
      const code = "code" in cause ? String((cause as { code?: unknown }).code ?? "").trim() : "";
      const message = "message" in cause ? String((cause as { message?: unknown }).message ?? "").trim() : "";
      if (code && message) {
        return `${code}: ${message}`;
      }
      if (message) {
        return message;
      }
      if (code) {
        return code;
      }
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }

  return "fetch failed";
}

export function resolveInternalTargetUrl(baseUrl: string, path: string, search = "") {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = String(path ?? "").trim();
  return `${normalizedBase}${normalizedPath}${search}`;
}

export async function fetchInternalUpstream(options: InternalUpstreamFetchOptions) {
  const timeoutMs = resolveInternalUpstreamTimeoutMs(options.event, options.timeoutMs);
  const candidates = buildInternalUpstreamCandidates(options.targetUrl);
  const attempts: string[] = [];

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new Error(`timeout apos ${timeoutMs}ms`)), timeoutMs);

    try {
      return await fetch(candidate, {
        ...options.fetchInit,
        signal: controller.signal
      });
    } catch (error: unknown) {
      attempts.push(`${candidate} -> ${resolveTransportErrorMessage(error, timeoutMs)}`);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw createError({
    statusCode: 502,
    statusMessage: options.statusMessage,
    data: sanitizeTransportErrorData(
      options.event,
      attempts.join(" | ") || options.fallbackMessage
    )
  });
}
