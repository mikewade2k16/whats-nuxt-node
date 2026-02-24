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
});
