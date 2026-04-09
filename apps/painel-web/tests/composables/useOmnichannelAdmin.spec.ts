import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, coreUserRef, legacyRoleRef, navigateToMock, syncSessionFromTokenMock, tenantSlugRef, userRef } = vi.hoisted(() => {
  return {
    apiFetchMock: vi.fn(),
    coreUserRef: {
      value: {
        id: "core-user-admin",
        tenantId: "tenant-1",
        tenantSlug: "demo",
        clientName: "Tenant Demo",
        email: "admin@demo.local",
        name: "Admin Demo",
        isPlatformAdmin: false,
        level: "admin",
        userType: "admin"
      }
    },
    legacyRoleRef: { value: "ADMIN" },
    navigateToMock: vi.fn(),
    syncSessionFromTokenMock: vi.fn(),
    tenantSlugRef: { value: "demo" },
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

mockNuxtImport("useAdminSession", () => {
  return () => ({
    user: userRef,
    coreUser: coreUserRef,
    legacyRole: legacyRoleRef,
    tenantSlug: tenantSlugRef,
    syncSessionFromToken: syncSessionFromTokenMock
  });
});

mockNuxtImport("navigateTo", () => navigateToMock);

import { useOmnichannelAdmin } from "~/composables/omnichannel/useOmnichannelAdmin";

function applyAdminIdentity(role: "ADMIN" | "SUPERVISOR" | "AGENT") {
  legacyRoleRef.value = role;
  userRef.value = {
    id: `user-${role.toLowerCase()}`,
    tenantId: "tenant-1",
    tenantSlug: "demo",
    email: `${role.toLowerCase()}@demo.local`,
    name: `${role.charAt(0)}${role.slice(1).toLowerCase()} Demo`,
    role
  };

  coreUserRef.value = {
    id: `core-${role.toLowerCase()}`,
    tenantId: "tenant-1",
    tenantSlug: "demo",
    clientName: "Tenant Demo",
    email: `${role.toLowerCase()}@demo.local`,
    name: `${role.charAt(0)}${role.slice(1).toLowerCase()} Demo`,
    isPlatformAdmin: false,
    level: role === "SUPERVISOR" ? "manager" : role === "ADMIN" ? "admin" : "marketing",
    userType: "admin"
  };
}

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

function buildTenantResponse(overrides: Record<string, unknown> = {}) {
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
    webhookUrl: "http://atendimento-online-api:4000/webhooks/evolution/demo",
    createdAt: "2026-02-24T00:00:00.000Z",
    updatedAt: "2026-02-24T00:00:00.000Z",
    canViewSensitive: true,
    evolutionApiKey: "key",
    whatsappInstances: [],
    ...overrides
  };
}

describe("useOmnichannelAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    applyAdminIdentity("ADMIN");
    tenantSlugRef.value = "demo";

    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === "/tenant" && options?.method === "PATCH") {
        return buildTenantResponse({
          name: String(options?.body?.name ?? "Tenant Demo"),
          whatsappInstance: String(options?.body?.whatsappInstance ?? "demo-instance"),
          maxChannels: Number(options?.body?.maxChannels ?? 1),
          maxUsers: Number(options?.body?.maxUsers ?? 5),
          retentionDays: Number(options?.body?.retentionDays ?? 15),
          maxUploadMb: Number(options?.body?.maxUploadMb ?? 500),
          evolutionApiKey: String(options?.body?.evolutionApiKey ?? "key")
        });
      }

      if (path === "/tenant") {
        return buildTenantResponse();
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
          webhookUrl: "http://atendimento-online-api:4000/webhooks/evolution/demo",
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

      if (path.startsWith("/tenant/metrics/http-endpoints")) {
        return {
          generatedAt: "2026-02-27T00:00:00.000Z",
          windowMinutes: 60,
          totalRequests: 0,
          items: []
        };
      }

      if (path === "/tenant/whatsapp/validate-endpoints") {
        return {
          instanceName: "demo-instance",
          generatedAt: "2026-02-27T00:00:00.000Z",
          baseUrl: "http://whatsapp-evolution-gateway:8080",
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

      if (path === "/tenant/whatsapp/instances") {
        return {
          instances: [],
          users: []
        };
      }

      if (path === "/clients") {
        return [
          {
            id: "tenant-1",
            slug: "demo",
            name: "Tenant Demo",
            maxChannels: 1,
            maxUsers: 5,
            retentionDays: 15,
            maxUploadMb: 500,
            evolutionApiKey: "key",
            createdAt: "2026-02-24T00:00:00.000Z",
            updatedAt: "2026-02-24T00:00:00.000Z"
          }
        ];
      }

      if (path === "/clients/tenant-1/users") {
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

  it("redireciona para inbox quando usuario nao pode ver o painel operacional", async () => {
    applyAdminIdentity("AGENT");

    const { wrapper } = mountComposable();
    await flushPromises();

    expect(navigateToMock).toHaveBeenCalledWith("/admin/omnichannel/inbox");

    wrapper.unmount();
  });

  it("permite supervisor acessar admin em modo leitura", async () => {
    applyAdminIdentity("SUPERVISOR");

    const { state, wrapper } = mountComposable();
    await flushPromises();

    expect(state.canManageTenant.value).toBe(false);
    expect(state.canViewOpsDashboard.value).toBe(true);
    expect(navigateToMock).not.toHaveBeenCalledWith("/admin/omnichannel/inbox");

    wrapper.unmount();
  });
});
