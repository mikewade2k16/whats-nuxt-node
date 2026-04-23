import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoreAuthStore } from "~/stores/core-auth";
import { useSessionSimulationStore } from "~/stores/session-simulation";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

describe("useSessionSimulationStore.refreshClientOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal("$fetch", fetchMock);

    const coreAuth = useCoreAuthStore();
    coreAuth.setSession(
      "header.payload.signature",
      {
        id: "user-1",
        name: "Admin Demo",
        email: "admin@demo-core.local",
        isPlatformAdmin: false,
        tenantId: "tenant-demo",
        clientId: 7,
        clientName: "Cliente Demo",
        level: "manager",
        userType: "client",
        moduleCodes: ["fila-atendimento", "core_panel"],
        atendimentoAccess: true
      },
      "2099-01-01T00:00:00.000Z"
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("compartilha a mesma promise concorrente e so conclui depois da hidratacao", async () => {
    let resolveFetch: ((value: {
      status: string;
      data: {
        id: string;
        email: string;
        userType: string;
        level: string;
        clientId: number;
        clientName: string;
        tenantId: string;
        nick: string;
        storeName: string;
        profileImage: string;
        preferences: string;
        moduleCodes: string[];
        atendimentoAccess: boolean;
      };
    }) => void) | null = null;

    fetchMock.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    const firstRefresh = sessionSimulation.refreshClientOptions();
    const secondRefresh = sessionSimulation.refreshClientOptions();

    expect(firstRefresh).toBeTruthy();
    expect(secondRefresh).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionSimulation.modulesHydrated).toBe(false);
    expect(sessionSimulation.lastClientOptionsSyncAt).toBe("");

    let secondRefreshSettled = false;
    void secondRefresh?.then(() => {
      secondRefreshSettled = true;
    });

    await Promise.resolve();
    expect(secondRefreshSettled).toBe(false);

    resolveFetch?.({
      status: "success",
      data: {
        id: "user-1",
        email: "admin@demo-core.local",
        userType: "client",
        level: "manager",
        clientId: 7,
        clientName: "Cliente Demo",
        tenantId: "tenant-demo",
        nick: "Demo",
        storeName: "Loja Centro",
        profileImage: "https://cdn.demo.local/profile.png",
        preferences: "{}",
        moduleCodes: ["atendimento", "fila-atendimento", "core_panel"],
        atendimentoAccess: true
      }
    });

    await firstRefresh;
    await secondRefresh;

    expect(secondRefreshSettled).toBe(true);
    expect(sessionSimulation.modulesHydrated).toBe(true);
    expect(sessionSimulation.lastClientOptionsSyncAt).not.toBe("");
    expect(sessionSimulation.profileClientId).toBe(7);
    expect(sessionSimulation.profileModuleCodes).toEqual(["atendimento", "fila-atendimento", "core_panel"]);
    expect(sessionSimulation.profileNick).toBe("Demo");
    expect(sessionSimulation.profileStoreName).toBe("Loja Centro");
    expect(sessionSimulation.activeClientLabel).toBe("Cliente Demo");
    expect(sessionSimulation.activeClientCoreTenantId).toBe("tenant-demo");
    expect(sessionSimulation.profileAtendimentoAccess).toBe(true);
    expect(sessionSimulation.effectiveAtendimentoAccess).toBe(true);
    expect(sessionSimulation.hasModule("fila-atendimento")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/profile/summary", {
      headers: {
        "x-core-token": "header.payload.signature"
      }
    });
  });

  it("so considera atendimentoAccess quando o cliente possui o modulo atendimento", async () => {
    fetchMock.mockResolvedValue({
      status: "success",
      data: {
        id: "user-1",
        email: "admin@demo-core.local",
        userType: "client",
        level: "manager",
        clientId: 7,
        clientName: "Cliente Demo",
        tenantId: "tenant-demo",
        nick: "Demo",
        storeName: "Loja Centro",
        profileImage: "",
        preferences: "{}",
        moduleCodes: ["fila-atendimento", "core_panel"],
        atendimentoAccess: true
      }
    });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();

    expect(sessionSimulation.profileAtendimentoAccess).toBe(false);
    expect(sessionSimulation.effectiveAtendimentoAccess).toBe(false);
    expect(sessionSimulation.activeClientModuleCodes).toEqual(["fila-atendimento", "core_panel"]);
  });

  it("nao repete summary/clientes quando o contexto ja esta sincronizado", async () => {
    fetchMock.mockResolvedValue({
      status: "success",
      data: {
        id: "user-1",
        email: "admin@demo-core.local",
        userType: "client",
        level: "manager",
        clientId: 7,
        clientName: "Cliente Demo",
        tenantId: "tenant-demo",
        nick: "Demo",
        storeName: "Loja Centro",
        profileImage: "",
        preferences: "{}",
        moduleCodes: ["fila-atendimento", "core_panel"],
        atendimentoAccess: false
      }
    });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionSimulation.clientOptionsSynced).toBe(true);

    await sessionSimulation.refreshClientOptions();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await sessionSimulation.refreshClientOptions({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sincroniza fallback e preserva auth quando summary falha de forma transitoria", async () => {
    const coreAuth = useCoreAuthStore();
    fetchMock.mockRejectedValueOnce({ statusCode: 503, statusMessage: "Service unavailable" });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();

    expect(coreAuth.token).toBe("header.payload.signature");
    expect(sessionSimulation.clientOptionsSynced).toBe(true);
    expect(sessionSimulation.effectiveClientId).toBe(7);
    expect(sessionSimulation.activeClientCoreTenantId).toBe("tenant-demo");
    expect(sessionSimulation.activeClientModuleCodes).toEqual(["fila-atendimento", "core_panel"]);
  });

  it("nao concede modulo para usuario sem cliente apos a sincronizacao", async () => {
    fetchMock.mockResolvedValue({
      status: "success",
      data: {
        id: "user-1",
        email: "admin@demo-core.local",
        userType: "client",
        level: "manager",
        clientId: null,
        clientName: "",
        tenantId: "",
        nick: "Demo",
        storeName: "",
        profileImage: "",
        preferences: "{}",
        moduleCodes: ["fila-atendimento", "core_panel"],
        atendimentoAccess: false
      }
    });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();

    expect(sessionSimulation.clientOptionsSynced).toBe(true);
    expect(sessionSimulation.effectiveClientId).toBe(0);
    expect(sessionSimulation.activeClientModuleCodes).toEqual([]);
    expect(sessionSimulation.hasModule("fila-atendimento")).toBe(false);
  });

  it("nao envia cabecalhos de simulacao ao listar clientes de root admin e preserva o fallback canonico", async () => {
    const coreAuth = useCoreAuthStore();
    coreAuth.setSession(
      "header.payload.signature",
      {
        id: "root-1",
        name: "Root Demo",
        email: "root@demo-core.local",
        isPlatformAdmin: true,
        tenantId: "",
        clientId: null,
        clientName: "",
        level: "admin",
        userType: "admin",
        moduleCodes: ["core_panel", "fila-atendimento"],
        atendimentoAccess: false
      },
      "2099-01-01T00:00:00.000Z"
    );

    fetchMock
      .mockResolvedValueOnce({
        status: "success",
        data: {
          id: "root-1",
          email: "root@demo-core.local",
          userType: "admin",
          level: "admin",
          clientId: null,
          clientName: "",
          tenantId: "",
          nick: "Root",
          storeName: "",
          profileImage: "",
          preferences: "{}",
          moduleCodes: ["core_panel", "fila-atendimento"],
          atendimentoAccess: false,
          isPlatformAdmin: true
        }
      })
      .mockResolvedValueOnce({
        status: "success",
        data: [
          {
            id: 106,
            name: "crow (Admin)",
            coreTenantId: "tenant-root",
            modules: [
              { code: "core_panel" },
              { code: "fila-atendimento" }
            ]
          },
          {
            id: 205,
            name: "Loja Demo",
            coreTenantId: "tenant-demo",
            modules: [
              { code: "fila-atendimento" }
            ]
          }
        ]
      });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/clients", {
      query: {
        page: 1,
        limit: 120,
        status: "active"
      },
      headers: {
        "x-core-token": "header.payload.signature"
      }
    });
    expect(sessionSimulation.clientId).toBe(106);
    expect(sessionSimulation.activeClientLabel).toBe("crow (Admin)");
  });

  it("preserva sync concluido quando uma lista secundaria de clientes vem vazia", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: "success",
        data: {
          id: "user-1",
          email: "admin@demo-core.local",
          userType: "client",
          level: "manager",
          clientId: 7,
          clientName: "Cliente Demo",
          tenantId: "tenant-demo",
          nick: "Demo",
          storeName: "",
          profileImage: "",
          preferences: "{}",
          moduleCodes: ["fila-atendimento", "core_panel"],
          atendimentoAccess: false
        }
      });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();
    expect(sessionSimulation.clientOptionsSynced).toBe(true);

    sessionSimulation.replaceClientOptions([]);

    expect(sessionSimulation.clientOptionsSynced).toBe(true);
    expect(sessionSimulation.modulesHydrated).toBe(true);
    expect(sessionSimulation.clientOptions).toHaveLength(1);
    expect(sessionSimulation.clientOptions[0]?.value).toBe(7);
  });

  it("preserva a sessao e sincroniza fallback quando a listagem root de clientes falha", async () => {
    const coreAuth = useCoreAuthStore();
    coreAuth.setSession(
      "header.payload.signature",
      {
        id: "root-1",
        name: "Root Demo",
        email: "root@demo-core.local",
        isPlatformAdmin: true,
        tenantId: "",
        clientId: null,
        clientName: "",
        level: "admin",
        userType: "admin",
        moduleCodes: ["core_panel", "fila-atendimento"],
        atendimentoAccess: false
      },
      "2099-01-01T00:00:00.000Z"
    );

    fetchMock
      .mockResolvedValueOnce({
        status: "success",
        data: {
          id: "root-1",
          email: "root@demo-core.local",
          userType: "admin",
          level: "admin",
          clientId: null,
          clientName: "",
          tenantId: "",
          nick: "Root",
          storeName: "",
          profileImage: "",
          preferences: "{}",
          moduleCodes: ["core_panel", "fila-atendimento"],
          atendimentoAccess: false,
          isPlatformAdmin: true
        }
      })
      .mockRejectedValueOnce({ statusCode: 403, statusMessage: "Forbidden" });

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.initialize();

    await sessionSimulation.refreshClientOptions();

    expect(coreAuth.token).toBe("header.payload.signature");
    expect(coreAuth.user?.email).toBe("root@demo-core.local");
    expect(sessionSimulation.lastClientOptionsSyncAt).not.toBe("");
    expect(sessionSimulation.modulesHydrated).toBe(true);
    expect(sessionSimulation.clientId).toBe(106);
    expect(sessionSimulation.hasModule("fila-atendimento")).toBe(true);
  });
});
