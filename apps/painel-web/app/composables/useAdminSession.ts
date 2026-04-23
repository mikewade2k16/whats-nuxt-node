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
const MAX_TIMEOUT_MS = 2_147_483_647;

let sessionExpiryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let lastSessionValidationAt = 0;
let pendingSessionValidation: Promise<boolean> | null = null;
let pendingRememberedSessionRestore: Promise<boolean> | null = null;
let rememberedSessionRestoreUnavailable = false;
let redirectingToLogin = false;
let sessionStateRevision = 0;

function debugAdminSession(message: string, details?: Record<string, unknown>) {
  if (!import.meta.dev || !import.meta.client) {
    return;
  }

  const debugState = (window as typeof window & {
    __adminAuthDebug?: {
      events: Array<Record<string, unknown>>;
      lastClearSessionStack?: string;
    };
  });
  debugState.__adminAuthDebug ??= { events: [] };
  debugState.__adminAuthDebug.events.push({
    ts: Date.now(),
    message,
    ...(details ?? {})
  });

  console.info("[admin-session-debug]", message, details ?? {});
}

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

  function bumpSessionStateRevision() {
    sessionStateRevision += 1;
    return sessionStateRevision;
  }

  function isCurrentSessionRevision(expectedRevision: number | null | undefined) {
    return expectedRevision === null
      || expectedRevision === undefined
      || expectedRevision === sessionStateRevision;
  }

  function getCurrentSessionToken() {
    return normalizeSessionToken(coreAuthRefs.token.value);
  }

  function isCurrentSessionSnapshot(snapshot: {
    revision?: number | null;
    accessToken?: string | null;
  }) {
    if (!isCurrentSessionRevision(snapshot.revision)) {
      return false;
    }

    if (snapshot.accessToken !== undefined) {
      return normalizeSessionToken(snapshot.accessToken) === getCurrentSessionToken();
    }

    return true;
  }

  function scheduleSessionExpiry(expectedRevision: number | null = sessionStateRevision) {
    clearSessionExpiryTimer();

    if (!import.meta.client) {
      return;
    }

    const ttlMs = msUntilSessionExpiry(sessionExpiresAt.value);
    if (!Number.isFinite(ttlMs)) {
      return;
    }

    if (ttlMs <= 0) {
      if (!isCurrentSessionRevision(expectedRevision) || msUntilSessionExpiry(sessionExpiresAt.value) > 0) {
        debugAdminSession("scheduleSessionExpiry:skip-immediate", {
          expectedRevision,
          currentRevision: sessionStateRevision,
          expiresAt: sessionExpiresAt.value
        });
        return;
      }

      void invalidateSession({
        redirectToLogin: true,
        expectedRevision,
        reason: "scheduleSessionExpiry:immediate-expiry"
      });
      return;
    }

    const nextTimeoutMs = Math.min(ttlMs, MAX_TIMEOUT_MS);
    sessionExpiryTimer = globalThis.setTimeout(() => {
      if (!isCurrentSessionRevision(expectedRevision)) {
        debugAdminSession("scheduleSessionExpiry:skip-stale-timer", {
          expectedRevision,
          currentRevision: sessionStateRevision,
          expiresAt: sessionExpiresAt.value
        });
        return;
      }

      const remainingMs = msUntilSessionExpiry(sessionExpiresAt.value);
      if (remainingMs > 0) {
        scheduleSessionExpiry(expectedRevision);
        return;
      }

      void invalidateSession({
        redirectToLogin: true,
        expectedRevision,
        reason: "scheduleSessionExpiry:timer-expired"
      });
    }, nextTimeoutMs);
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
      const restoreRevision = sessionStateRevision;
      debugAdminSession("restoreRememberedSession:start", {
        path: window.location.pathname,
        isAuthenticated: isAuthenticated.value,
        restoreRevision
      });

      try {
        const response = await $fetch<RememberedAdminSessionResponse>("/api/admin/auth/session", {
          timeout: 10_000
        });

        if (!isCurrentSessionRevision(restoreRevision) && isAuthenticated.value) {
          debugAdminSession("restoreRememberedSession:stale-response", {
            restoreRevision,
            currentRevision: sessionStateRevision
          });
          return true;
        }

        if (!response?.ok) {
          rememberedSessionRestoreUnavailable = true;
          debugAdminSession("restoreRememberedSession:empty", {
            reason: response?.reason ?? null,
            restoreRevision
          });
          if (!isCurrentSessionRevision(restoreRevision)) {
            return isAuthenticated.value;
          }
          clearSession();
          return false;
        }

        const accessToken = normalizeSessionToken(response.session?.accessToken);
        const coreUser = response.session?.user ?? null;
        if (!accessToken || !coreUser) {
          rememberedSessionRestoreUnavailable = true;
          debugAdminSession("restoreRememberedSession:invalid-payload", {
            hasAccessToken: Boolean(accessToken),
            hasCoreUser: Boolean(coreUser),
            restoreRevision
          });
          if (!isCurrentSessionRevision(restoreRevision)) {
            return isAuthenticated.value;
          }
          clearSession();
          return false;
        }

        if (!isCurrentSessionRevision(restoreRevision) && isAuthenticated.value) {
          debugAdminSession("restoreRememberedSession:skip-set-session", {
            restoreRevision,
            currentRevision: sessionStateRevision
          });
          return true;
        }

        setSession({
          token: accessToken,
          coreAccessToken: accessToken,
          coreUser,
          expiresAt: null
        });
        debugAdminSession("restoreRememberedSession:done", {
          path: window.location.pathname,
          isAuthenticated: isAuthenticated.value,
          expiresAt: sessionExpiresAt.value
        });

        return true;
      } catch (error) {
        const statusCode = extractFetchStatusCode(error);
        if (statusCode === 401 || statusCode === 403) {
          rememberedSessionRestoreUnavailable = true;
          debugAdminSession("restoreRememberedSession:invalid-status", {
            statusCode,
            restoreRevision
          });
          if (!isCurrentSessionRevision(restoreRevision)) {
            return isAuthenticated.value;
          }
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

    debugAdminSession("redirectToLogin", {
      path: window.location.pathname,
      search: window.location.search
    });
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
    const stack = new Error().stack ?? "";
    debugAdminSession("clearSession", {
      path: import.meta.client ? window.location.pathname : null,
      stack
    });
    if (import.meta.dev && import.meta.client) {
      const debugState = window as typeof window & {
        __adminAuthDebug?: {
          events: Array<Record<string, unknown>>;
          lastClearSessionStack?: string;
        };
      };
      debugState.__adminAuthDebug ??= { events: [] };
      debugState.__adminAuthDebug.lastClearSessionStack = stack;
    }
    clearSessionExpiryTimer();
    lastSessionValidationAt = 0;
    bumpSessionStateRevision();
    coreAuthStore.clearSession();
    clearLegacyAdminShadowSnapshot();
    sessionSimulation.reset();
  }

  async function invalidateSession(options: {
    redirectToLogin?: boolean;
    expectedRevision?: number | null;
    expectedAccessToken?: string | null;
    reason?: string;
  } = {}) {
    if (!isCurrentSessionSnapshot({
      revision: options.expectedRevision,
      accessToken: options.expectedAccessToken
    })) {
      debugAdminSession("invalidateSession:skip-stale", {
        reason: options.reason ?? null,
        expectedRevision: options.expectedRevision ?? null,
        currentRevision: sessionStateRevision,
        expectedAccessToken: normalizeSessionToken(options.expectedAccessToken),
        currentAccessToken: getCurrentSessionToken()
      });
      return;
    }

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
    const validationRevision = sessionStateRevision;
    if (!accessToken) {
      await invalidateSession({
        redirectToLogin: options.redirectToLogin !== false,
        expectedRevision: validationRevision,
        reason: "validateSession:missing-token"
      });
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

        if (!isCurrentSessionSnapshot({
          revision: validationRevision,
          accessToken
        })) {
          debugAdminSession("validateSession:skip-stale-success", {
            validationRevision,
            currentRevision: sessionStateRevision
          });
          return isAuthenticated.value;
        }

        lastSessionValidationAt = Date.now();
        scheduleSessionExpiry(validationRevision);
        return true;
      } catch (error) {
        if (isAdminSessionInvalidError(error)) {
          await invalidateSession({
            redirectToLogin: options.redirectToLogin !== false,
            expectedRevision: validationRevision,
            expectedAccessToken: accessToken,
            reason: "validateSession:invalid"
          });
          return isCurrentSessionSnapshot({
            revision: validationRevision,
            accessToken
          })
            ? false
            : isAuthenticated.value;
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
    const syncRevision = sessionStateRevision;
    if (!accessToken) {
      await invalidateSession({
        redirectToLogin: options.redirectToLogin !== false,
        expectedRevision: syncRevision,
        reason: "syncSessionFromToken:missing-token"
      });
      return null;
    }

    try {
      const response = await $fetch<CoreMeResponse>("/api/core-bff/core/auth/me", {
        headers: {
          "x-core-token": accessToken
        },
        timeout: 10_000
      });

      if (!isCurrentSessionSnapshot({
        revision: syncRevision,
        accessToken
      }) && isAuthenticated.value) {
        debugAdminSession("syncSessionFromToken:skip-stale-success", {
          syncRevision,
          currentRevision: sessionStateRevision
        });
        return coreAuthRefs.user.value;
      }

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
        await invalidateSession({
          redirectToLogin: options.redirectToLogin !== false,
          expectedRevision: syncRevision,
          expectedAccessToken: accessToken,
          reason: "syncSessionFromToken:invalid"
        });
      }
      throw error;
    }
  }

  function setSession(payload: AdminSessionPayload) {
    const accessToken = normalizeSessionToken(payload.coreAccessToken ?? payload.token);
    if (!accessToken || !payload.coreUser) {
      debugAdminSession("setSession:missing-payload", {
        hasAccessToken: Boolean(accessToken),
        hasCoreUser: Boolean(payload.coreUser)
      });
      clearSession();
      return;
    }

    rememberedSessionRestoreUnavailable = false;

    const sessionOptions = payload.persistent === null || payload.persistent === undefined
      ? {}
      : { persistent: payload.persistent };

    const nextRevision = bumpSessionStateRevision();
    coreAuthStore.setSession(accessToken, payload.coreUser, payload.expiresAt ?? null, sessionOptions);
    clearLegacyAdminShadowSnapshot();
    lastSessionValidationAt = Date.now();
    scheduleSessionExpiry(nextRevision);
    debugAdminSession("setSession:done", {
      path: import.meta.client ? window.location.pathname : null,
      isAuthenticated: isAuthenticated.value,
      expiresAt: sessionExpiresAt.value,
      sessionRevision: nextRevision
    });
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
