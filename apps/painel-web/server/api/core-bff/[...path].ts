import { getRequestHeaders, getRequestURL, readRawBody, type H3Event } from "h3";
import { clearCoreSessionToken, getCoreSessionToken, setCoreSessionToken } from "~~/server/utils/core-session-cookie";
import { fetchInternalUpstream, resolveInternalTargetUrl } from "~~/server/utils/internal-upstream";
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

function decodeRawBodyToText(body: Awaited<ReturnType<typeof readRawBody>>) {
  if (typeof body === "string") {
    return body;
  }

  if (!body) {
    return "";
  }

  return Buffer.from(body).toString("utf-8");
}

function resolveRememberLoginFromBody(rawBodyText: string) {
  if (!rawBodyText.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawBodyText) as Record<string, unknown>;
    return parsed.rememberLogin === true;
  } catch {
    return false;
  }
}

function buildUpstreamBody(
  method: string,
  targetPath: string,
  body: Awaited<ReturnType<typeof readRawBody>>,
  rawBodyText: string
) {
  if (body === undefined || method !== "POST" || targetPath !== "core/auth/login") {
    return body;
  }

  if (!rawBodyText.trim()) {
    return body;
  }

  try {
    const parsed = JSON.parse(rawBodyText) as Record<string, unknown>;
    delete parsed.rememberLogin;
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function sanitizeLoginProxyHeaders(headers: Headers) {
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("x-core-token");
  headers.set("accept", "application/json");
  if (!headers.get("content-type")) {
    headers.set("content-type", "application/json");
  }
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

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const url = getRequestURL(event);
  const method = event.method.toUpperCase();
  const requestHeaders = getRequestHeaders(event);
  const headers = copyRequestHeaders(requestHeaders);
  applyCoreAuthorizationHeader(event, requestHeaders, headers);
  applyForwardedHeaders(event, headers);
  const targetPath = getTargetPath(event.context.params?.path).toLowerCase();
  if (method === "POST" && targetPath === "core/auth/login") {
    sanitizeLoginProxyHeaders(headers);
  }

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
  const rawBodyText = decodeRawBodyToText(body);
  const shouldRememberLogin = method === "POST" && targetPath === "core/auth/login"
    ? resolveRememberLoginFromBody(rawBodyText)
    : false;
  const upstreamBody = buildUpstreamBody(method, targetPath, body, rawBodyText);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchInternalUpstream({
      event,
      targetUrl,
      fetchInit: {
        method,
        headers,
        body: upstreamBody
      },
      statusMessage: "Falha ao conectar no backend core",
      fallbackMessage: "Erro de rede no proxy core"
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

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
      if (method === "POST" && targetPath === "core/auth/login") {
        if (upstreamResponse.ok) {
          setCoreSessionToken(
            event,
            (parsed as Record<string, unknown>).accessToken,
            (parsed as Record<string, unknown>).expiresAt,
            { persistent: shouldRememberLogin }
          );
        } else {
          clearCoreSessionToken(event);
        }
      }

      if (method === "POST" && targetPath === "core/auth/logout") {
        clearCoreSessionToken(event);
      }

      if (!upstreamResponse.ok && targetPath === "core/auth/me" && upstreamResponse.status === 401) {
        clearCoreSessionToken(event);
      }

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
