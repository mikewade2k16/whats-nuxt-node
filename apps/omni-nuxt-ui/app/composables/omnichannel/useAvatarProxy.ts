const WHATSAPP_AVATAR_PROXY_HOSTS = new Set([
  "pps.whatsapp.net",
  "mmg.whatsapp.net",
  "mmx.whatsapp.net",
  "lookaside.whatsapp.com"
]);

export function resolveAvatarSource(rawUrl: string | null | undefined) {
  const normalized = rawUrl?.trim() ?? "";
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("/api/avatar/whatsapp")) {
    return normalized;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return normalized;
  }

  if (!WHATSAPP_AVATAR_PROXY_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    return normalized;
  }

  const encodedUrl = encodeURIComponent(normalized);
  return `/api/avatar/whatsapp?url=${encodedUrl}`;
}
