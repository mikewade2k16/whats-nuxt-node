import { defineStore } from "pinia";
import type { CoreAuthUser } from "~/types/core";
import { isSessionExpired as hasExpiredSession, resolveSessionExpiresAt } from "~/utils/admin-session";
import {
  type AdminSessionPersistenceMode,
  clearAdminSessionSnapshot,
  getAdminSessionPersistenceMode,
  persistAdminSessionSnapshot,
  readAdminSessionSnapshot
} from "~/utils/admin-session-persistence";

const TOKEN_KEY = "core:token";
const USER_KEY = "core:user";
const EXPIRES_AT_KEY = "core:expires-at";

const STORAGE_KEYS = {
  tokenKey: TOKEN_KEY,
  userKey: USER_KEY,
  expiresAtKey: EXPIRES_AT_KEY
} as const;

function loadUserFromStorage(rawUser: string | null) {
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as CoreAuthUser;
  } catch {
    return null;
  }
}

function debugCoreAuth(message: string, details?: Record<string, unknown>) {
  if (!import.meta.dev || !import.meta.client) {
    return;
  }

  console.info("[core-auth-debug]", message, details ?? {});
}

export const useCoreAuthStore = defineStore("core-auth", () => {
  const token = ref<string | null>(null);
  const user = ref<CoreAuthUser | null>(null);
  const sessionExpiresAt = ref<string | null>(null);
  const persistenceMode = ref<AdminSessionPersistenceMode>(getAdminSessionPersistenceMode());
  const hydrated = ref(false);

  const isSessionExpired = computed(() => hasExpiredSession(sessionExpiresAt.value));
  const isAuthenticated = computed(() => Boolean(token.value && user.value) && !isSessionExpired.value);
  const isPersistentSession = computed(() => persistenceMode.value === "persistent");

  function hydrate() {
    if (!import.meta.client || hydrated.value) {
      return;
    }

    const snapshot = readAdminSessionSnapshot(STORAGE_KEYS);
    persistenceMode.value = snapshot.mode;
    token.value = snapshot.token;
    user.value = loadUserFromStorage(snapshot.userRaw);
    sessionExpiresAt.value = resolveSessionExpiresAt(snapshot.expiresAt, token.value);
    hydrated.value = true;
    debugCoreAuth("hydrate", {
      hasToken: Boolean(token.value),
      hasUser: Boolean(user.value),
      expiresAt: sessionExpiresAt.value
    });

    if ((token.value && !sessionExpiresAt.value) || isSessionExpired.value) {
      clearSession();
      return;
    }

    persist();
  }

  function persist() {
    if (!import.meta.client) {
      return;
    }

    persistAdminSessionSnapshot(STORAGE_KEYS, {
      token: token.value,
      userRaw: user.value ? JSON.stringify(user.value) : null,
      expiresAt: sessionExpiresAt.value
    }, persistenceMode.value);
  }

  function setSession(
    nextToken: string,
    nextUser: CoreAuthUser,
    nextExpiresAt?: string | null,
    options: { persistent?: boolean } = {}
  ) {
    token.value = nextToken;
    user.value = nextUser;
    sessionExpiresAt.value = resolveSessionExpiresAt(nextExpiresAt, nextToken);
    persistenceMode.value = options.persistent === true
      ? "persistent"
      : options.persistent === false
        ? "session"
        : persistenceMode.value;
    hydrated.value = true;
    debugCoreAuth("setSession", {
      hasToken: Boolean(nextToken),
      userId: nextUser.id,
      expiresAt: sessionExpiresAt.value,
      mode: persistenceMode.value
    });

    if (!sessionExpiresAt.value || isSessionExpired.value) {
      clearSession();
      return;
    }

    persist();
  }

  function clearSession() {
    debugCoreAuth("clearSession", {
      hasToken: Boolean(token.value),
      hasUser: Boolean(user.value),
      expiresAt: sessionExpiresAt.value
    });
    token.value = null;
    user.value = null;
    sessionExpiresAt.value = null;
    hydrated.value = true;
    clearAdminSessionSnapshot(STORAGE_KEYS);
  }

  return {
    token,
    user,
    sessionExpiresAt,
    persistenceMode,
    hydrated,
    isSessionExpired,
    isPersistentSession,
    isAuthenticated,
    hydrate,
    setSession,
    clearSession
  };
});
