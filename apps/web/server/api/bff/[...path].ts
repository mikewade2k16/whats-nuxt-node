import { getRequestHeaders, getRequestURL, readRawBody } from "h3";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "content-length",
  "transfer-encoding",
  "upgrade"
]);

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

  const targetUrl = resolveTargetUrl(config.apiInternalBase, event.context.params?.path, url.search);

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
      statusMessage: "Falha ao conectar no backend",
      data: {
        message: error instanceof Error ? error.message : "Erro de rede no proxy"
      }
    });
  }

  setResponseStatus(event, upstreamResponse.status, upstreamResponse.statusText);

  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    setHeader(event, "content-type", contentType);
  }

  const payload = await upstreamResponse.text();
  if (!payload.length) {
    return null;
  }

  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(payload);
    } catch {
      return {
        message: "Resposta JSON invalida do backend",
        raw: payload
      };
    }
  }

  return payload;
});
