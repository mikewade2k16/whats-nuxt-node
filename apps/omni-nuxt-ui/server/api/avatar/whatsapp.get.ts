import { getQuery, setHeader, setResponseStatus } from "h3";

const ALLOWED_AVATAR_HOSTS = new Set([
  "pps.whatsapp.net",
  "mmg.whatsapp.net",
  "mmx.whatsapp.net",
  "lookaside.whatsapp.com"
]);

const NO_CONTENT_CACHE = "public, max-age=120";
const SUCCESS_CACHE = "public, max-age=300, stale-while-revalidate=600";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawUrl = typeof query.url === "string" ? query.url.trim() : "";

  if (!rawUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: "Parametro url e obrigatorio"
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Parametro url invalido"
    });
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage: "Protocolo nao suportado"
    });
  }

  if (!ALLOWED_AVATAR_HOSTS.has(targetUrl.hostname.toLowerCase())) {
    throw createError({
      statusCode: 403,
      statusMessage: "Host de avatar nao permitido"
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });
  } catch {
    setResponseStatus(event, 204);
    setHeader(event, "cache-control", NO_CONTENT_CACHE);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    setResponseStatus(event, 204);
    setHeader(event, "cache-control", NO_CONTENT_CACHE);
    return null;
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  if (!payload.length) {
    setResponseStatus(event, 204);
    setHeader(event, "cache-control", NO_CONTENT_CACHE);
    return null;
  }

  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  setHeader(event, "content-type", contentType);
  setHeader(event, "content-length", String(payload.length));
  setHeader(event, "cache-control", SUCCESS_CACHE);
  return payload;
});
