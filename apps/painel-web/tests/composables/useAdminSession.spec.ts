import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "~/composables/useAdminSession";
import type { CoreAuthUser } from "~/types/core";

const { fetchMock, navigateToMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  navigateToMock: vi.fn()
}));

function buildCoreUser(overrides: Partial<CoreAuthUser> = {}): CoreAuthUser {
  return {
    id: "user-1",
    name: "Admin Demo",
    email: "admin@demo.local",
    isPlatformAdmin: false,
    tenantId: "tenant-demo",
    tenantSlug: "tenant-demo",
    clientId: 7,
    clientName: "Cliente Demo",
    level: "admin",
    userType: "admin",
    moduleCodes: ["core_panel"],
    atendimentoAccess: false,
    ...overrides
  };
}

describe("useAdminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal("$fetch", fetchMock);
    vi.stubGlobal("navigateTo", navigateToMock);
    navigateToMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("ignora callback de expiracao antigo quando uma nova sessao assume o shell", async () => {
    const scheduledCallbacks: Array<() => void> = [];
    const setTimeoutMock = vi.fn((callback: TimerHandler) => {
      scheduledCallbacks.push(typeof callback === "function" ? callback as () => void : () => {});
      return scheduledCallbacks.length;
    });
    const clearTimeoutMock = vi.fn();

    vi.stubGlobal("setTimeout", setTimeoutMock);
    vi.stubGlobal("clearTimeout", clearTimeoutMock);

    const session = useAdminSession();

    session.setSession({
      token: "old-token",
      coreAccessToken: "old-token",
      coreUser: buildCoreUser(),
      expiresAt: new Date(Date.now() + 1_000).toISOString()
    });

    session.setSession({
      token: "new-token",
      coreAccessToken: "new-token",
      coreUser: buildCoreUser({ id: "user-2", email: "new@demo.local" }),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(scheduledCallbacks).toHaveLength(2);
    expect(session.coreToken.value).toBe("new-token");

    scheduledCallbacks[0]?.();
    await Promise.resolve();

    expect(session.coreToken.value).toBe("new-token");
    expect(session.isAuthenticated.value).toBe(true);
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("quebra expiracoes longas em timeouts seguros para nao estourar o limite do browser", () => {
    const setTimeoutMock = vi.fn(() => 1);
    const clearTimeoutMock = vi.fn();

    vi.stubGlobal("setTimeout", setTimeoutMock);
    vi.stubGlobal("clearTimeout", clearTimeoutMock);

    const session = useAdminSession();

    session.setSession({
      token: "long-lived-token",
      coreAccessToken: "long-lived-token",
      coreUser: buildCoreUser(),
      expiresAt: "2026-05-23T15:28:50.000Z"
    });

    expect(setTimeoutMock).toHaveBeenCalledTimes(1);
    expect(setTimeoutMock.mock.calls[0]?.[1]).toBe(2_147_483_647);
  });

  it("nao invalida a sessao atual quando uma validacao antiga falha depois de um novo login", async () => {
    let rejectValidation: ((reason?: unknown) => void) | null = null;
    fetchMock.mockImplementation(() => new Promise((_, reject) => {
      rejectValidation = reject;
    }));

    const session = useAdminSession();

    session.setSession({
      token: "old-token",
      coreAccessToken: "old-token",
      coreUser: buildCoreUser(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    const validationPromise = session.validateSession({ force: true, redirectToLogin: true });

    session.setSession({
      token: "new-token",
      coreAccessToken: "new-token",
      coreUser: buildCoreUser({ id: "user-2", email: "new@demo.local" }),
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    });

    rejectValidation?.({
      statusCode: 401,
      data: {
        reason: "login-required"
      }
    });

    await expect(validationPromise).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/core-bff/core/auth/me", {
      headers: {
        "x-core-token": "old-token"
      },
      timeout: 10_000
    });
    expect(session.coreToken.value).toBe("new-token");
    expect(session.isAuthenticated.value).toBe(true);
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("ignora restore pendente quando o usuario ja abriu uma nova sessao manualmente", async () => {
    let resolveRestore: ((value: { ok: boolean; reason?: string | null }) => void) | null = null;
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      resolveRestore = resolve as typeof resolveRestore;
    }));

    const session = useAdminSession();

    const restorePromise = session.restoreRememberedSession();

    session.setSession({
      token: "manual-token",
      coreAccessToken: "manual-token",
      coreUser: buildCoreUser({ id: "user-3", email: "manual@demo.local" }),
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    });

    resolveRestore?.({
      ok: false,
      reason: "remembered-session-invalid"
    });

    await expect(restorePromise).resolves.toBe(true);
    expect(session.coreToken.value).toBe("manual-token");
    expect(session.isAuthenticated.value).toBe(true);
    expect(navigateToMock).not.toHaveBeenCalled();
  });
});
