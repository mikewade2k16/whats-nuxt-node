import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, navigateToMock, userRef } = vi.hoisted(() => {
  return {
    apiFetchMock: vi.fn(),
    navigateToMock: vi.fn(),
    userRef: {
      value: {
        id: "user-admin",
        tenantId: "tenant-1",
        tenantSlug: "demo",
        email: "admin@demo.local",
        name: "Admin Demo",
        role: "ADMIN"
      }
    }
  };
});

mockNuxtImport("useApi", () => {
  return () => ({
    apiFetch: apiFetchMock
  });
});

mockNuxtImport("useAuth", () => {
  return () => ({
    user: userRef
  });
});

mockNuxtImport("navigateTo", () => navigateToMock);

import { useOmnichannelAdmin } from "~/composables/omnichannel/useOmnichannelAdmin";

function mountComposable() {
  const state: Record<string, any> = {};

  const wrapper = mount(
    defineComponent({
      setup() {
        Object.assign(state, useOmnichannelAdmin());
        return () => h("div");
      }
    })
  );

  return { wrapper, state };
}

describe("useOmnichannelAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    userRef.value = {
      id: "user-admin",
      tenantId: "tenant-1",
      tenantSlug: "demo",
      email: "admin@demo.local",
      name: "Admin Demo",
      role: "ADMIN"
    };

    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === "/tenant" && options?.method === "PATCH") {
        return {
          id: "tenant-1",
          slug: "demo",
          name: String(options?.body?.name ?? "Tenant Demo"),
          whatsappInstance: String(options?.body?.whatsappInstance ?? "demo-instance"),
          maxChannels: Number(options?.body?.maxChannels ?? 1),
          maxUsers: Number(options?.body?.maxUsers ?? 5),
          retentionDays: Number(options?.body?.retentionDays ?? 15),
          maxUploadMb: Number(options?.body?.maxUploadMb ?? 500),
          currentChannels: 1,
          currentUsers: 1,
          hasEvolutionApiKey: true,
          webhookUrl: "http://api:4000/webhooks/evolution/demo",
          createdAt: "2026-02-24T00:00:00.000Z",
          updatedAt: "2026-02-24T00:00:00.000Z",
          canViewSensitive: true,
          evolutionApiKey: String(options?.body?.evolutionApiKey ?? "key")
        };
      }

      if (path === "/tenant") {
        return {
          id: "tenant-1",
          slug: "demo",
          name: "Tenant Demo",
          whatsappInstance: "demo-instance",
          maxChannels: 1,
          maxUsers: 5,
          retentionDays: 15,
          maxUploadMb: 500,
          currentChannels: 1,
          currentUsers: 1,
          hasEvolutionApiKey: true,
          webhookUrl: "http://api:4000/webhooks/evolution/demo",
          createdAt: "2026-02-24T00:00:00.000Z",
          updatedAt: "2026-02-24T00:00:00.000Z",
          canViewSensitive: true,
          evolutionApiKey: "key"
        };
      }

      if (path === "/users" && options?.method === "POST") {
        return {
          id: "new-user",
          tenantId: "tenant-1",
          email: String(options?.body?.email ?? "agent@demo.local"),
          name: String(options?.body?.name ?? "Novo Agente"),
          role: String(options?.body?.role ?? "AGENT"),
          createdAt: "2026-02-24T00:00:00.000Z",
          updatedAt: "2026-02-24T00:00:00.000Z"
        };
      }

      if (path === "/users") {
        return [
          {
            id: "agent-1",
            tenantId: "tenant-1",
            email: "agent@demo.local",
            name: "Agente Demo",
            role: "AGENT",
            createdAt: "2026-02-24T00:00:00.000Z",
            updatedAt: "2026-02-24T00:00:00.000Z"
          }
        ];
      }

      if (path === "/tenant/whatsapp/status") {
        return {
          configured: true,
          instanceName: "demo-instance",
          webhookUrl: "http://api:4000/webhooks/evolution/demo",
          connectionState: {
            instance: {
              instanceName: "demo-instance",
              state: "open"
            }
          }
        };
      }

      if (path.startsWith("/tenant/whatsapp/qrcode")) {
        return {
          configured: true,
          instanceName: "demo-instance",
          qrCode: "data:image/png;base64,ABC",
          pairingCode: null,
          source: "fetchInstances"
        };
      }

      if (path === "/tenant/whatsapp/bootstrap") {
        return {
          success: true,
          instanceName: "demo-instance",
          connectResult: { count: 0 }
        };
      }

      if (path === "/tenant/whatsapp/connect") {
        return {
          success: true,
          instanceName: "demo-instance",
          connectResult: { pairingCode: "PAIR-123" }
        };
      }

      if (path.startsWith("/tenant/metrics/failures")) {
        return {
          generatedAt: "2026-02-26T00:00:00.000Z",
          windowDays: 7,
          since: "2026-02-19T00:00:00.000Z",
          failedTotal: 0,
          failedByType: [],
          dailySeries: [],
          recentFailures: []
        };
      }

      if (path === "/tenant/whatsapp/validate-endpoints") {
        return {
          instanceName: "demo-instance",
          generatedAt: "2026-02-27T00:00:00.000Z",
          baseUrl: "http://evolution:8080",
          timeoutMs: 90000,
          endpoints: [
            {
              key: "text",
              label: "sendText",
              pathTemplate: "/message/sendText/:instance",
              resolvedPath: "/message/sendText/demo-instance",
              status: "validation_error",
              available: true,
              httpStatus: 400,
              message: "probe"
            }
          ],
          summary: {
            total: 1,
            available: 1,
            missingRoute: 0,
            authError: 0,
            providerError: 0,
            networkError: 0
          }
        };
      }

      throw new Error(`Unexpected call: ${path}`);
    });
  });

  it("exibe erro e nao chama connect sem numero no pairing code", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    const connectCallsBefore = apiFetchMock.mock.calls.filter((call) => call[0] === "/tenant/whatsapp/connect").length;

    state.whatsappForm.number = "";
    await state.generatePairingCode();

    const connectCallsAfter = apiFetchMock.mock.calls.filter((call) => call[0] === "/tenant/whatsapp/connect").length;

    expect(state.errorMessage.value).toContain("Informe um numero");
    expect(connectCallsAfter).toBe(connectCallsBefore);

    wrapper.unmount();
  });

  it("executa bootstrap e atualiza mensagem de sucesso", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    state.whatsappForm.instanceName = "demo-instance";
    await state.bootstrapWhatsApp();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/tenant/whatsapp/bootstrap",
      expect.objectContaining({ method: "POST" })
    );
    expect(state.infoMessage.value).toContain("Instancia iniciada");

    wrapper.unmount();
  });

  it("carrega e salva limites de plano do tenant", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    expect(state.tenantForm.maxChannels).toBe(1);
    expect(state.tenantForm.maxUsers).toBe(5);
    expect(state.tenantForm.retentionDays).toBe(15);
    expect(state.tenantForm.maxUploadMb).toBe(500);

    state.tenantForm.maxChannels = 2;
    state.tenantForm.maxUsers = 8;
    state.tenantForm.retentionDays = 30;
    state.tenantForm.maxUploadMb = 700;
    await state.saveTenant();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/tenant",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          maxChannels: 2,
          maxUsers: 8,
          retentionDays: 30,
          maxUploadMb: 700
        })
      })
    );
    expect(state.tenant.value?.maxChannels).toBe(2);
    expect(state.tenant.value?.maxUsers).toBe(8);
    expect(state.tenant.value?.retentionDays).toBe(30);
    expect(state.tenant.value?.maxUploadMb).toBe(700);

    wrapper.unmount();
  });

  it("redireciona para inbox quando usuario nao e admin", async () => {
    userRef.value = {
      id: "user-agent",
      tenantId: "tenant-1",
      tenantSlug: "demo",
      email: "agent@demo.local",
      name: "Agent Demo",
      role: "AGENT"
    };

    const { wrapper } = mountComposable();
    await flushPromises();

    expect(navigateToMock).toHaveBeenCalledWith("/");

    wrapper.unmount();
  });

  it("permite supervisor acessar admin em modo leitura", async () => {
    userRef.value = {
      id: "user-supervisor",
      tenantId: "tenant-1",
      tenantSlug: "demo",
      email: "supervisor@demo.local",
      name: "Supervisor Demo",
      role: "SUPERVISOR"
    };

    const { state, wrapper } = mountComposable();
    await flushPromises();

    expect(state.canManageTenant.value).toBe(false);
    expect(state.canViewOpsDashboard.value).toBe(true);
    expect(navigateToMock).not.toHaveBeenCalledWith("/");

    wrapper.unmount();
  });
});
