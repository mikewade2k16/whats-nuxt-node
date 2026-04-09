import { storeToRefs } from "pinia";
import type { AuthUser } from "~/types";
import type { CoreAuthUser, CoreMeResponse } from "~/types/core";
import {
  buildSessionUserFromCore,
  extractFetchStatusCode,
  isAdminSessionInvalidError,
  mapCoreUserToSessionRole,
  msUntilSessionExpiry,
  resolveSessionTenantSlug
} from "~/utils/admin-session";

interface AdminSessionPayload {
  token?: string | null;
  user?: Partial<AuthUser> | null;
  coreUser: CoreAuthUser;
  coreAccessToken?: string | null;
  expiresAt?: string | null;
  persistent?: boolean | null;
}

interface RememberedAdminSessionResponse {
  ok: boolean;
  reason?: string | null;
  session?: {
    accessToken?: string | null;
    user?: CoreAuthUser | null;
  };
}

const SESSION_VALIDATION_INTERVAL_MS = 60_000;

let sessionExpiryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let lastSessionValidationAt = 0;
let pendingSessionValidation: Promise<boolean> | null = null;
let pendingRememberedSessionRestore: Promise<boolean> | null = null;
let rememberedSessionRestoreUnavailable = false;
let redirectingToLogin = false;

function clearSessionExpiryTimer() {
  if (sessionExpiryTimer !== null) {
    clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
  }
}

function normalizeSessionToken(value: unknown) {
	return String(value ?? "").trim();
}

function clearLegacyAdminShadowSnapshot() {
  if (!import.meta.client) {
    return;
  }

  localStorage.removeItem("admin:compat:token");
  localStorage.removeItem("admin:compat:user");
  localStorage.removeItem("admin:compat:expires-at");
  sessionStorage.removeItem("admin:compat:token");
  sessionStorage.removeItem("admin:compat:user");
  sessionStorage.removeItem("admin:compat:expires-at");
}

export function useAdminSession() {
  const coreAuthStore = useCoreAuthStore();
  const sessionSimulation = useSessionSimulationStore();

  coreAuthStore.hydrate();

  const coreAuthRefs = storeToRefs(coreAuthStore);
  const user = computed<AuthUser | null>(() => buildSessionUserFromCore(coreAuthRefs.user.value));
  const token = computed(() => coreAuthRefs.token.value || null);
  const sessionExpiresAt = computed(() => coreAuthRefs.sessionExpiresAt.value || null);

  const legacyRole = computed(() => {
    if (coreAuthRefs.user.value) {
      return mapCoreUserToSessionRole(coreAuthRefs.user.value);
    }

    return null;
  });

  const tenantSlug = computed(() => {
    const resolved = resolveSessionTenantSlug(coreAuthRefs.user.value, user.value);
    return resolved || null;
  });

  const isSessionExpired = computed(() => Boolean(coreAuthRefs.isSessionExpired.value));
  const hasSessionMismatch = computed(() => false);

  const isAuthenticated = computed(() => (
    Boolean(token.value && user.value && coreAuthRefs.user.value)
    && !isSessionExpired.value
  ));

  function scheduleSessionExpiry() {
    clearSessionExpiryTimer();

    if (!import.meta.client) {
      return;
    }

    const ttlMs = msUntilSessionExpiry(sessionExpiresAt.value);
    if (!Number.isFinite(ttlMs)) {
      return;
    }

    if (ttlMs <= 0) {
      void invalidateSession({ redirectToLogin: true });
      return;
    }

    sessionExpiryTimer = globalThis.setTimeout(() => {
      void invalidateSession({ redirectToLogin: true });
    }, ttlMs);
  }

  async function restoreRememberedSession() {
    if (!import.meta.client) {
      return false;
    }

    if (isAuthenticated.value) {
      return true;
    }

    if (rememberedSessionRestoreUnavailable) {
      return false;
    }

    if (pendingRememberedSessionRestore) {
      return pendingRememberedSessionRestore;
    }

    pendingRememberedSessionRestore = (async () => {
      try {
        const response = await $fetch<RememberedAdminSessionResponse>("/api/admin/auth/session", {
          timeout: 10_000
        });

        if (!response?.ok) {
          rememberedSessionRestoreUnavailable = true;
          clearSession();
          return false;
        }

        const accessToken = normalizeSessionToken(response.session?.accessToken);
        const coreUser = response.session?.user ?? null;
        if (!accessToken || !coreUser) {
          rememberedSessionRestoreUnavailable = true;
          clearSession();
          return false;
        }

        setSession({
          token: accessToken,
          coreAccessToken: accessToken,
          coreUser,
          expiresAt: null
        });

        return true;
      } catch (error) {
        const statusCode = extractFetchStatusCode(error);
        if (statusCode === 401 || statusCode === 403) {
          rememberedSessionRestoreUnavailable = true;
          clearSession();
          return false;
        }

        console.warn("[admin-session] remembered session restore skipped due to transient error", error);
        return false;
      } finally {
        pendingRememberedSessionRestore = null;
      }
    })();

    return pendingRememberedSessionRestore;
  }

  function buildLoginRedirectPath() {
    if (!import.meta.client) {
      return null;
    }

    const currentPath = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
    if (!currentPath.startsWith("/admin") || currentPath.startsWith("/admin/login")) {
      return null;
    }

    return currentPath;
  }

  async function redirectToLogin() {
    if (!import.meta.client || redirectingToLogin) {
      return;
    }

    redirectingToLogin = true;
    try {
      const redirectPath = buildLoginRedirectPath();
      await navigateTo({
        path: "/admin/login",
        query: redirectPath ? { redirect: redirectPath } : undefined
      }, { replace: true });
    } finally {
      redirectingToLogin = false;
    }
  }

  function hydrate() {
    coreAuthStore.hydrate();
    clearLegacyAdminShadowSnapshot();

    if (isSessionExpired.value) {
      clearSession();
      return;
    }

    scheduleSessionExpiry();
  }

  function clearSession() {
    clearSessionExpiryTimer();
    lastSessionValidationAt = 0;
    coreAuthStore.clearSession();
    clearLegacyAdminShadowSnapshot();
    sessionSimulation.reset();
  }

  async function invalidateSession(options: { redirectToLogin?: boolean } = {}) {
    clearSession();

    if (options.redirectToLogin !== false) {
      await redirectToLogin();
    }
  }

  async function logout() {
    const accessToken = String(coreAuthRefs.token.value || "").trim();

    try {
      await $fetch("/api/core-bff/core/auth/logout", {
        method: "POST",
        headers: accessToken
          ? {
              "x-core-token": accessToken
            }
          : undefined,
        timeout: 10_000
      });
    } catch {
      // best-effort revoke; local cleanup still wins
    }

    await invalidateSession({ redirectToLogin: true });
  }

  async function validateSession(options: { force?: boolean; redirectToLogin?: boolean } = {}) {
    hydrate();

    if (!import.meta.client) {
      return true;
    }

    if (!isAuthenticated.value) {
      const restored = await restoreRememberedSession();
      if (restored) {
        return true;
      }

      if (options.redirectToLogin !== false) {
        await redirectToLogin();
      }
      return false;
    }

    const accessToken = String(coreAuthRefs.token.value || "").trim();
    if (!accessToken) {
      await invalidateSession({ redirectToLogin: options.redirectToLogin !== false });
      return false;
    }

    if (!options.force && Date.now() - lastSessionValidationAt < SESSION_VALIDATION_INTERVAL_MS) {
      return true;
    }

    if (pendingSessionValidation) {
      return pendingSessionValidation;
    }

    pendingSessionValidation = (async () => {
      try {
        await $fetch("/api/core-bff/core/auth/me", {
          headers: {
            "x-core-token": accessToken
          },
          timeout: 10_000
        });

        lastSessionValidationAt = Date.now();
        scheduleSessionExpiry();
        return true;
      } catch (error) {
        if (isAdminSessionInvalidError(error)) {
          await invalidateSession({ redirectToLogin: options.redirectToLogin !== false });
          return false;
        }

        console.warn("[admin-session] session validation skipped due to transient error", error);
        return true;
      } finally {
        pendingSessionValidation = null;
      }
    })();

    return pendingSessionValidation;
  }

  async function syncSessionFromToken(options: {
    accessToken?: string | null;
    sessionContext?: Partial<AuthUser> | null;
    expiresAt?: string | null;
    redirectToLogin?: boolean;
  }) {
    const accessToken = normalizeSessionToken(options.accessToken);
    if (!accessToken) {
      await invalidateSession({ redirectToLogin: options.redirectToLogin !== false });
      return null;
    }

    try {
      const response = await $fetch<CoreMeResponse>("/api/core-bff/core/auth/me", {
        headers: {
          "x-core-token": accessToken
        },
        timeout: 10_000
      });

      setSession({
        token: accessToken,
        user: options.sessionContext ?? null,
        coreAccessToken: accessToken,
        coreUser: response.user,
        expiresAt: options.expiresAt ?? null
      });

      return response.user;
    } catch (error) {
      if (isAdminSessionInvalidError(error)) {
        await invalidateSession({ redirectToLogin: options.redirectToLogin !== false });
      }
      throw error;
    }
  }

  function setSession(payload: AdminSessionPayload) {
    const accessToken = normalizeSessionToken(payload.coreAccessToken ?? payload.token);
    if (!accessToken || !payload.coreUser) {
      clearSession();
      return;
    }

    rememberedSessionRestoreUnavailable = false;

    const sessionOptions = payload.persistent === null || payload.persistent === undefined
      ? {}
      : { persistent: payload.persistent };

    coreAuthStore.setSession(accessToken, payload.coreUser, payload.expiresAt ?? null, sessionOptions);
    clearLegacyAdminShadowSnapshot();
    lastSessionValidationAt = Date.now();
    scheduleSessionExpiry();
  }

  return {
    token,
    user,
    sessionExpiresAt,
    hydrated: coreAuthRefs.hydrated,
    coreToken: coreAuthRefs.token,
    coreUser: coreAuthRefs.user,
    legacyRole,
    tenantSlug,
    coreHydrated: coreAuthRefs.hydrated,
    isSessionExpired,
    isAuthenticated,
    hasSessionMismatch,
    hydrate,
    restoreRememberedSession,
    validateSession,
    syncSessionFromToken,
    setSession,
    clearSession,
    invalidateSession,
    logout
  };
}
