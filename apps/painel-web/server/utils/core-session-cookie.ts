import { deleteCookie, getCookie, type H3Event, setCookie } from "h3";

const CORE_SESSION_COOKIE = "omni_core_session";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function resolveCookieSecureFlag(event: H3Event) {
  const forwardedProto = normalizeText(event.node.req.headers["x-forwarded-proto"]);
  if (forwardedProto.toLowerCase() === "https") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

function resolveCookieMaxAge(expiresAt: unknown) {
  const parsed = Date.parse(normalizeText(expiresAt));
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const ttlSeconds = Math.floor((parsed - Date.now()) / 1_000);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return undefined;
  }

  return Math.max(60, ttlSeconds);
}

export function getCoreSessionToken(event: H3Event) {
  return normalizeText(getCookie(event, CORE_SESSION_COOKIE));
}

export function setCoreSessionToken(
  event: H3Event,
  accessToken: unknown,
  expiresAt?: unknown,
  options: { persistent?: boolean } = {}
) {
  const token = normalizeText(accessToken);
  if (!token) {
    clearCoreSessionToken(event);
    return;
  }

  const maxAge = options.persistent === false ? undefined : resolveCookieMaxAge(expiresAt);

  setCookie(event, CORE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: resolveCookieSecureFlag(event),
    path: "/",
    ...(maxAge ? { maxAge } : {})
  });
}

export function clearCoreSessionToken(event: H3Event) {
  deleteCookie(event, CORE_SESSION_COOKIE, {
    path: "/"
  });
}
