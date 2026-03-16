import { getQuery } from "h3";

const ALLOWED_GIF_HOSTS = new Set([
  "media.tenor.com",
  "c.tenor.com",
  "tenor.googleapis.com",
  "www.tenor.com"
]);

function resolveMediaUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_GIF_HOSTS.has(host)) {
    return null;
  }

  return parsed.toString();
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const mediaUrl = resolveMediaUrl(query.url);

  if (!mediaUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: "URL de GIF invalida",
      data: {
        message: "Informe uma URL valida de media do provider configurado."
      }
    });
  }

  const response = await fetch(mediaUrl, {
    method: "GET",
    headers: {
      Accept: "video/mp4,image/gif,*/*"
    }
  });

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Falha ao baixar GIF",
      data: {
        message: `Provider retornou status ${response.status}.`
      }
    });
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();

  setHeader(event, "content-type", contentType);
  setHeader(event, "cache-control", "public, max-age=3600");

  return Buffer.from(arrayBuffer);
});
