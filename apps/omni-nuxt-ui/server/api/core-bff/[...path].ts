import { getRequestHeaders, getRequestURL, readRawBody, type H3Event } from "h3";
import { enforceRateLimit, resolveRateLimitClientKey } from "~~/server/utils/rate-limit";
import { sanitizeTransportErrorData, sanitizeUpstreamPayload } from "~~/server/utils/safe-error";
import { resolveTrustedEventClientIp } from "~~/server/utils/trusted-proxy";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "expect"
]);

const FORWARDED_BINARY_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "cache-control",
  "etag",
  "last-modified"
];

function getTargetPath(pathParam: string | string[] | undefined) {
  if (!pathParam) {
    return "";
  }

  if (Array.isArray(pathParam)) {
    return pathParam.join("/");
  }

  return pathParam;
}

function copyRequestHeaders(source: Record<string, string | string[] | undefined>) {
  const headers = new Headers();

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.toLowerCase();
    if (!rawValue || HOP_BY_HOP_HEADERS.has(key)) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      headers.set(key, rawValue.join(","));
      continue;
    }

    headers.set(key, rawValue);
  }

  return headers;
}

function applyCoreAuthorizationHeader(
  source: Record<string, string | string[] | undefined>,
  headers: Headers
) {
  const authorization = headers.get("authorization")?.trim();
  if (authorization) {
    headers.delete("x-core-token");
    return;
  }

  const rawCoreToken = source["x-core-token"];
  const coreToken = Array.isArray(rawCoreToken)
    ? String(rawCoreToken[0] ?? "").trim()
    : String(rawCoreToken ?? "").trim();

  if (coreToken) {
    headers.set("authorization", coreToken.startsWith("Bearer ") ? coreToken : `Bearer ${coreToken}`);
  }

  headers.delete("x-core-token");
}

function applyForwardedHeaders(event: H3Event, headers: Headers) {
  const requestIp = resolveTrustedEventClientIp(event) || "unknown";
  headers.set("x-forwarded-for", requestIp);
  headers.set("x-forwarded-proto", getRequestURL(event).protocol.replace(/:$/, "") || "http");
  headers.set("x-forwarded-host", getRequestURL(event).host);
}

function resolveTargetUrl(baseUrl: string, pathParam: string | string[] | undefined, search: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const targetPath = getTargetPath(pathParam);
  const normalizedPath = targetPath ? `/${targetPath}` : "";
  return `${normalizedBase}${normalizedPath}${search}`;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const url = getRequestURL(event);
  const method = event.method.toUpperCase();
  const requestHeaders = getRequestHeaders(event);
  const headers = copyRequestHeaders(requestHeaders);
  applyCoreAuthorizationHeader(requestHeaders, headers);
  applyForwardedHeaders(event, headers);
  const targetPath = getTargetPath(event.context.params?.path).toLowerCase();

  if (method === "POST" && targetPath === "core/auth/login") {
    await enforceRateLimit(event, {
      scope: "core-bff.auth.login",
      key: resolveRateLimitClientKey(event),
      max: 10,
      windowMs: 5 * 60_000,
      blockMs: 15 * 60_000,
      message: "Muitas tentativas de login. Aguarde antes de tentar novamente."
    });
  }

  const targetUrl = resolveTargetUrl(config.coreApiInternalBase, event.context.params?.path, url.search);

  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRawBody(event, false);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body
    });
  } catch (error: unknown) {
    throw createError({
      statusCode: 502,
      statusMessage: "Falha ao conectar no backend core",
      data: sanitizeTransportErrorData(event, error instanceof Error ? error.message : "Erro de rede no proxy core")
    });
  }

  setResponseStatus(event, upstreamResponse.status, upstreamResponse.statusText);
  const contentType = upstreamResponse.headers.get("content-type")?.toLowerCase() ?? "";
  const isJsonResponse = contentType.includes("json");

  if (isJsonResponse) {
    const rawContentType = upstreamResponse.headers.get("content-type");
    if (rawContentType) {
      setHeader(event, "content-type", rawContentType);
    }

    const payload = await upstreamResponse.text();
    if (!payload.length) {
      return null;
    }

    try {
      const parsed = JSON.parse(payload);
      if (!upstreamResponse.ok) {
        return sanitizeUpstreamPayload(event, upstreamResponse.status, parsed, "Falha no backend core");
      }
      return parsed;
    } catch {
      throw createError({
        statusCode: 502,
        statusMessage: "Resposta invalida do backend core",
        data: sanitizeTransportErrorData(event, "Resposta JSON invalida do backend core")
      });
    }
  }

  for (const headerName of FORWARDED_BINARY_HEADERS) {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      setHeader(event, headerName, headerValue);
    }
  }

  const payload = Buffer.from(await upstreamResponse.arrayBuffer());
  if (!payload.length) {
    return null;
  }

  return payload;
});
