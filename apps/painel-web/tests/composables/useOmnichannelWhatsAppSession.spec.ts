import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, legacyRoleRef } = vi.hoisted(() => {
  return {
    apiFetchMock: vi.fn(),
    legacyRoleRef: { value: "ADMIN" }
  };
});

mockNuxtImport("useApi", () => {
  return () => ({
    apiFetch: apiFetchMock
  });
});

mockNuxtImport("useAdminSession", () => {
  return () => ({
    legacyRole: legacyRoleRef
  });
});

import { useOmnichannelWhatsAppSession } from "~/composables/omnichannel/useOmnichannelWhatsAppSession";

function mountComposable() {
  const state: Record<string, any> = {};

  const wrapper = mount(
    defineComponent({
      setup() {
        Object.assign(state, useOmnichannelWhatsAppSession());
        return () => h("div");
      }
    })
  );

  return { wrapper, state };
}

describe("useOmnichannelWhatsAppSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    legacyRoleRef.value = "ADMIN";

    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/tenant/whatsapp/instances") {
        return {
          instances: [
            {
              id: "instance-1",
              instanceName: "root-20260409-6514",
              displayName: "Root",
              phoneNumber: null,
              isDefault: true,
              isActive: true,
              queueLabel: null,
              responsibleUserId: null,
              userScopePolicy: "MULTI_INSTANCE",
              assignedUserIds: []
            }
          ]
        };
      }

      if (path.startsWith("/tenant/whatsapp/status")) {
        return {
          configured: true,
          instanceId: "instance-1",
          instanceName: "root-20260409-6514",
          connectionState: {
            instance: {
              instanceName: "root-20260409-6514",
              state: "connecting"
            }
          }
        };
      }

      if (path.startsWith("/tenant/whatsapp/qrcode")) {
        if (path.includes("force=true")) {
          return {
            configured: true,
            instanceId: "instance-1",
            instanceName: "root-20260409-6514",
            qrCode: "data:image/png;base64,ABC123",
            pairingCode: null,
            source: "connect"
          };
        }

        return {
          configured: true,
          instanceId: "instance-1",
          instanceName: "root-20260409-6514",
          qrCode: null,
          pairingCode: null,
          source: "none",
          message: "Aguardando emissao do QR Code pela instancia..."
        };
      }

      if (path === "/tenant/whatsapp/bootstrap" && options?.method === "POST") {
        return {
          success: true,
          instanceId: "instance-1",
          instanceName: "root-20260409-6514"
        };
      }

      throw new Error(`Unexpected call: ${path}`);
    });
  });

  it("forca a leitura do QR logo apos o bootstrap", async () => {
    const { state, wrapper } = mountComposable();

    await state.activate();
    await flushPromises();

    await state.generateQrCode();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/tenant/whatsapp/bootstrap",
      expect.objectContaining({ method: "POST" })
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/tenant/whatsapp/qrcode?instanceId=instance-1&force=true"
    );
    expect(state.qrImageSrc.value).toBe("data:image/png;base64,ABC123");
    expect(state.infoMessage.value).toContain("QR Code atualizado");

    wrapper.unmount();
  });
});
