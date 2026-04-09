export type AdminSessionPersistenceMode = "persistent" | "session";

export interface AdminSessionStorageKeys {
  tokenKey: string;
  userKey: string;
  expiresAtKey: string;
}

export interface AdminSessionStorageSnapshot {
  token: string | null;
  userRaw: string | null;
  expiresAt: string | null;
  mode: AdminSessionPersistenceMode;
}

const SESSION_PERSISTENCE_KEY = "admin:session:persistence";
const REMEMBERED_LOGIN_EMAIL_KEY = "admin:login:remembered-email";

function canUseWebStorage() {
  return typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.sessionStorage !== "undefined";
}

function normalizeMode(value: unknown): AdminSessionPersistenceMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "persistent" || normalized === "session") {
    return normalized;
  }

  return null;
}

function normalizeRememberedLoginEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function getAdminSessionPersistenceMode(): AdminSessionPersistenceMode {
  if (!canUseWebStorage()) {
    return "session";
  }

  return normalizeMode(window.localStorage.getItem(SESSION_PERSISTENCE_KEY)) || "session";
}

export function isPersistentAdminSessionPreferred() {
  return getAdminSessionPersistenceMode() === "persistent";
}

export function getRememberedAdminLoginEmail() {
  if (!canUseWebStorage()) {
    return "";
  }

  return normalizeRememberedLoginEmail(window.localStorage.getItem(REMEMBERED_LOGIN_EMAIL_KEY));
}

export function persistRememberedAdminLoginEmail(value: unknown) {
  if (!canUseWebStorage()) {
    return;
  }

  const normalized = normalizeRememberedLoginEmail(value);
  if (!normalized) {
    window.localStorage.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
    return;
  }

  window.localStorage.setItem(REMEMBERED_LOGIN_EMAIL_KEY, normalized);
}

export function clearRememberedAdminLoginEmail() {
  if (!canUseWebStorage()) {
    return;
  }

  window.localStorage.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
}

export function readAdminSessionSnapshot(keys: AdminSessionStorageKeys): AdminSessionStorageSnapshot {
  const preferredMode = getAdminSessionPersistenceMode();
  clearAdminSessionSnapshot(keys);

  return {
    token: null,
    userRaw: null,
    expiresAt: null,
    mode: preferredMode
  };
}

export function persistAdminSessionSnapshot(
  keys: AdminSessionStorageKeys,
  values: {
    token: string | null;
    userRaw: string | null;
    expiresAt: string | null;
  },
  mode: AdminSessionPersistenceMode
) {
  if (!canUseWebStorage()) {
    return;
  }

  window.localStorage.setItem(SESSION_PERSISTENCE_KEY, mode);
  void values;
  clearAdminSessionSnapshot(keys);
}

export function clearAdminSessionSnapshot(keys: AdminSessionStorageKeys) {
  if (!canUseWebStorage()) {
    return;
  }

  window.localStorage.removeItem(keys.tokenKey);
  window.localStorage.removeItem(keys.userKey);
  window.localStorage.removeItem(keys.expiresAtKey);
  window.sessionStorage.removeItem(keys.tokenKey);
  window.sessionStorage.removeItem(keys.userKey);
  window.sessionStorage.removeItem(keys.expiresAtKey);
}
