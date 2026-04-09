import type { AuthUser, UserRole } from "~/types";
import type { CoreAuthUser } from "~/types/core";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function mapCoreUserToSessionRole(coreUser: CoreAuthUser | null | undefined): UserRole {
  if (coreUser?.isPlatformAdmin) {
    return "ADMIN";
  }

  const level = normalizeText(coreUser?.level).toLowerCase();
  if (level === "admin") {
    return "ADMIN";
  }
  if (level === "manager") {
    return "SUPERVISOR";
  }

  const moduleCodes = Array.isArray(coreUser?.moduleCodes)
    ? coreUser.moduleCodes.map((entry) => normalizeText(entry).toLowerCase()).filter(Boolean)
    : [];
  if (Boolean(coreUser?.atendimentoAccess) || moduleCodes.includes("atendimento")) {
    return "AGENT";
  }

  return "VIEWER";
}

export function resolveSessionTenantSlug(
  coreUser: CoreAuthUser | null | undefined,
  fallbackUser?: Partial<AuthUser> | null
) {
  return normalizeText(coreUser?.tenantSlug || fallbackUser?.tenantSlug);
}

export function canManageAdminSessions(coreUser: CoreAuthUser | null | undefined) {
  if (coreUser?.isPlatformAdmin) {
    return true;
  }

  return normalizeText(coreUser?.userType).toLowerCase() === "admin"
    && normalizeText(coreUser?.level).toLowerCase() === "admin"
    && Boolean(normalizeText(coreUser?.tenantId));
}

export function buildSessionUserFromCore(
  coreUser: CoreAuthUser | null | undefined,
  fallbackUser?: Partial<AuthUser> | null
): AuthUser | null {
  if (!coreUser) {
    return null;
  }

  const id = normalizeText(coreUser.id || fallbackUser?.id);
  const email = normalizeText(coreUser.email || fallbackUser?.email).toLowerCase();
  const name = normalizeText(coreUser.name || fallbackUser?.name);
  if (!id || !email || !name) {
    return null;
  }

  return {
    id,
    tenantId: normalizeText(coreUser.tenantId || fallbackUser?.tenantId),
    tenantSlug: resolveSessionTenantSlug(coreUser, fallbackUser),
    email,
    name,
    nick: normalizeText(coreUser.nick ?? fallbackUser?.nick ?? "") || null,
    profileImage: normalizeText(coreUser.profileImage ?? fallbackUser?.profileImage ?? "") || null,
    role: mapCoreUserToSessionRole(coreUser)
  };
}

function decodeBase64Url(value: string) {
  const normalized = normalizeText(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }

  return "";
}

function decodeJwtPayload(rawToken: string) {
  const parts = normalizeText(rawToken).split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const decoded = decodeBase64Url(parts[1] || "");
    if (!decoded) {
      return null;
    }

    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function resolveSessionExpiresAt(rawExpiresAt: unknown, rawToken?: string | null) {
  const directValue = normalizeText(rawExpiresAt);
  if (directValue) {
    const parsedDirect = Date.parse(directValue);
    if (Number.isFinite(parsedDirect)) {
      return new Date(parsedDirect).toISOString();
    }
  }

  const payload = decodeJwtPayload(String(rawToken ?? ""));
  const expCandidate = Number(payload?.exp ?? 0);
  if (Number.isFinite(expCandidate) && expCandidate > 0) {
    return new Date(expCandidate * 1_000).toISOString();
  }

  return null;
}

export function isSessionExpired(expiresAt: unknown) {
  const normalized = normalizeText(expiresAt);
  if (!normalized) {
    return false;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return parsed <= Date.now();
}

export function msUntilSessionExpiry(expiresAt: unknown) {
  const normalized = normalizeText(expiresAt);
  if (!normalized) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed - Date.now();
}

export function extractFetchStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return 0;
  }

  if ("statusCode" in error) {
    const candidate = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(candidate) ? candidate : 0;
  }

  if ("status" in error) {
    const candidate = Number((error as { status?: unknown }).status);
    return Number.isFinite(candidate) ? candidate : 0;
  }

  return 0;
}

export function extractFetchErrorReason(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) {
    return "";
  }

  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "";
  }

  return normalizeText((data as { reason?: unknown }).reason).toLowerCase();
}

export function isAdminSessionInvalidError(error: unknown) {
  const statusCode = extractFetchStatusCode(error);
  if (statusCode === 401) {
    return true;
  }

  return statusCode === 403 && extractFetchErrorReason(error) === "login-required";
}