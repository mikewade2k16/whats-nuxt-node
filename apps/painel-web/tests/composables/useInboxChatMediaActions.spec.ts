import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useSessionSimulationStore } from "~/stores/session-simulation";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

import { useInboxChatMediaActions } from "~/composables/omnichannel/useInboxChatMediaActions";

describe("useInboxChatMediaActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());

    const sessionSimulation = useSessionSimulationStore();
    sessionSimulation.profileIsPlatformAdmin = true;
    sessionSimulation.profileUserType = "admin";
    sessionSimulation.profileUserLevel = "admin";
    sessionSimulation.userType = "admin";
    sessionSimulation.userLevel = "admin";
    sessionSimulation.clientId = 4;
    sessionSimulation.profileClientId = 1;

    fetchMock.mockResolvedValue(new Response(new Blob(["preview"], { type: "image/jpeg" }), {
      status: 200
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn()
    });
  });

  it("propaga os headers do shell para o proxy de midia", async () => {
    const actions = useInboxChatMediaActions({
      getToken: () => "core-token",
      getSelectedTenantSlug: () => "tenant-demo",
      resolveMessageType: () => "IMAGE"
    });

    await actions.requestImagePreview({
      id: "msg-1",
      conversationId: "conv-1",
      mediaUrl: null,
      mediaMimeType: "image/jpeg",
      mediaFileName: "foto.jpg",
      metadataJson: null
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/conversations/conv-1/messages/msg-1/media?disposition=inline",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers)
      })
    );

    const [, requestOptions] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(requestOptions.headers.get("authorization")).toBe("Bearer core-token");
    expect(requestOptions.headers.get("x-selected-tenant-slug")).toBe("tenant-demo");
    expect(requestOptions.headers.get("x-client-id")).toBe("4");
    expect(requestOptions.headers.get("x-user-type")).toBe("admin");
    expect(requestOptions.headers.get("x-user-level")).toBe("admin");
  });
});
