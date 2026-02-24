import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, navigateToMock, tokenRef, userRef, clearSessionMock, ioMock, socketMock } = vi.hoisted(() => {
  const socket = {
    on: vi.fn(),
    disconnect: vi.fn()
  };

  return {
    apiFetchMock: vi.fn(),
    navigateToMock: vi.fn(),
    tokenRef: { value: "jwt-token" },
    userRef: {
      value: {
        id: "user-admin",
        tenantId: "tenant-1",
        tenantSlug: "demo",
        email: "admin@demo.local",
        name: "Admin Demo",
        role: "ADMIN"
      }
    },
    clearSessionMock: vi.fn(),
    ioMock: vi.fn(() => socket),
    socketMock: socket
  };
});

vi.mock("socket.io-client", () => {
  return {
    io: ioMock
  };
});

mockNuxtImport("useRuntimeConfig", () => {
  return () => ({
    public: {
      apiBase: "http://localhost:4000"
    }
  });
});

mockNuxtImport("useApi", () => {
  return () => ({
    apiFetch: apiFetchMock
  });
});

mockNuxtImport("useAuth", () => {
  return () => ({
    token: tokenRef,
    user: userRef,
    clearSession: clearSessionMock
  });
});

mockNuxtImport("navigateTo", () => navigateToMock);

import { useOmnichannelInbox } from "~/composables/omnichannel/useOmnichannelInbox";

function mountComposable() {
  const state: Record<string, any> = {};

  const wrapper = mount(
    defineComponent({
      setup() {
        Object.assign(state, useOmnichannelInbox());
        return () => h("div");
      }
    })
  );

  return { wrapper, state };
}

describe("useOmnichannelInbox", () => {
  beforeEach(() => {
    const conversations = [
      {
        id: "c1",
        channel: "WHATSAPP",
        status: "OPEN",
        externalId: "5511999990001@s.whatsapp.net",
        contactName: "Carlos Silva",
        contactAvatarUrl: null,
        contactPhone: "5511999990001",
        assignedToId: null,
        createdAt: "2026-02-24T10:00:00.000Z",
        updatedAt: "2026-02-24T10:00:00.000Z",
        lastMessageAt: "2026-02-24T10:10:00.000Z",
        lastMessage: {
          id: "m1",
          content: "Bom dia",
          direction: "INBOUND",
          status: "SENT",
          createdAt: "2026-02-24T10:10:00.000Z"
        }
      },
      {
        id: "c2",
        channel: "WHATSAPP",
        status: "OPEN",
        externalId: "5511999990002@s.whatsapp.net",
        contactName: "Maria Souza",
        contactAvatarUrl: null,
        contactPhone: "5511999990002",
        assignedToId: null,
        createdAt: "2026-02-24T09:00:00.000Z",
        updatedAt: "2026-02-24T09:00:00.000Z",
        lastMessageAt: "2026-02-24T09:10:00.000Z",
        lastMessage: {
          id: "m2",
          content: "Quero suporte",
          direction: "INBOUND",
          status: "SENT",
          createdAt: "2026-02-24T09:10:00.000Z"
        }
      }
    ];

    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
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

      if (path === "/conversations") {
        return conversations;
      }

      if (path.startsWith("/conversations/c1/messages?")) {
        return {
          conversationId: "c1",
          messages: [
            {
              id: "m1",
              tenantId: "tenant-1",
              conversationId: "c1",
              direction: "INBOUND",
              senderName: "Carlos Silva",
              senderAvatarUrl: null,
              content: "Bom dia",
              status: "SENT",
              externalMessageId: "ext-1",
              createdAt: "2026-02-24T10:10:00.000Z",
              updatedAt: "2026-02-24T10:10:00.000Z"
            }
          ],
          hasMore: false
        };
      }

      if (path === "/conversations/c1/messages" && options?.method === "POST") {
        return {
          id: "m-out-1",
          tenantId: "tenant-1",
          conversationId: "c1",
          direction: "OUTBOUND",
          senderName: "Atendente",
          senderAvatarUrl: null,
          content: String(options.body?.content ?? ""),
          status: "SENT",
          externalMessageId: "ext-out-1",
          createdAt: "2026-02-24T10:11:00.000Z",
          updatedAt: "2026-02-24T10:11:00.000Z"
        };
      }

      throw new Error(`Unexpected call: ${path}`);
    });
  });

  it("filtra conversas por texto de busca", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    expect(state.filteredConversations.value.length).toBe(2);

    state.updateSearch("maria");
    await nextTick();

    expect(state.filteredConversations.value.length).toBe(1);
    expect(state.filteredConversations.value[0].id).toBe("c2");

    wrapper.unmount();
  });

  it("nao envia mensagem quando draft esta vazio", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    const postCallsBefore = apiFetchMock.mock.calls.filter(
      (call) => call[0] === "/conversations/c1/messages" && call[1]?.method === "POST"
    ).length;

    state.updateDraft("   ");
    await state.sendMessage();

    const postCallsAfter = apiFetchMock.mock.calls.filter(
      (call) => call[0] === "/conversations/c1/messages" && call[1]?.method === "POST"
    ).length;

    expect(postCallsAfter).toBe(postCallsBefore);

    wrapper.unmount();
  });

  it("envia mensagem valida e limpa o draft", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    state.updateDraft("Mensagem de teste");
    await state.sendMessage();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/conversations/c1/messages",
      expect.objectContaining({ method: "POST" })
    );
    expect(state.draft.value).toBe("");

    wrapper.unmount();
  });
});
