import { getRequestHeaders, getRequestURL, readRawBody, type H3Event } from "h3";
import { getCoreSessionToken } from "~~/server/utils/core-session-cookie";
import { fetchInternalUpstream, resolveInternalTargetUrl } from "~~/server/utils/internal-upstream";
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
  event: H3Event,
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
  } else {
    const cookieToken = getCoreSessionToken(event);
    if (cookieToken) {
      headers.set("authorization", cookieToken.startsWith("Bearer ") ? cookieToken : `Bearer ${cookieToken}`);
    }
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
  const targetPath = getTargetPath(pathParam);
  const normalizedPath = targetPath ? `/${targetPath}` : "";
  return resolveInternalTargetUrl(baseUrl, normalizedPath, search);
}

function resolveUpstreamTimeoutMs(pathParam: string | string[] | undefined) {
  const targetPath = getTargetPath(pathParam).trim().toLowerCase();
  if (!targetPath) {
    return undefined;
  }

  if (
    targetPath === "conversations/sync-open" ||
    /conversations\/[^/]+\/messages\/sync-history$/.test(targetPath)
  ) {
    return 120_000;
  }

  return undefined;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const url = getRequestURL(event);
  const method = event.method.toUpperCase();
  const requestHeaders = getRequestHeaders(event);
  const headers = copyRequestHeaders(requestHeaders);
  applyCoreAuthorizationHeader(event, requestHeaders, headers);
  applyForwardedHeaders(event, headers);

  const targetUrl = resolveTargetUrl(config.apiInternalBase, event.context.params?.path, url.search);
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs(event.context.params?.path);

  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRawBody(event, false);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchInternalUpstream({
      event,
      targetUrl,
      fetchInit: {
        method,
        headers,
        body
      },
      timeoutMs: upstreamTimeoutMs,
      statusMessage: "Falha ao conectar no backend",
      fallbackMessage: "Erro de rede no proxy"
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    throw createError({
      statusCode: 502,
      statusMessage: "Falha ao conectar no backend",
      data: sanitizeTransportErrorData(event, error instanceof Error ? error.message : "Erro de rede no proxy")
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
        return sanitizeUpstreamPayload(event, upstreamResponse.status, parsed, "Falha no backend");
      }
      return parsed;
    } catch {
      throw createError({
        statusCode: 502,
        statusMessage: "Resposta invalida do backend",
        data: sanitizeTransportErrorData(event, "Resposta JSON invalida do backend")
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
