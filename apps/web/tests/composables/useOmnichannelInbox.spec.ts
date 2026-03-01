import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, navigateToMock, tokenRef, userRef, clearSessionMock, ioMock, socketMock, nuxtFetchMock } = vi.hoisted(() => {
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
    socketMock: socket,
    nuxtFetchMock: vi.fn(async () => ({}))
  };
});

vi.stubGlobal("$fetch", nuxtFetchMock);

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
    nuxtFetchMock.mockReset();
    nuxtFetchMock.mockResolvedValue({});

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

      if (path === "/conversations/c1/messages/m-media-1") {
        return {
          id: "m-media-1",
          tenantId: "tenant-1",
          conversationId: "c1",
          direction: "INBOUND",
          messageType: "IMAGE",
          senderName: "Carlos Silva",
          senderAvatarUrl: null,
          content: "[imagem]",
          mediaUrl: "data:image/jpeg;base64,aGVsbG8=",
          mediaMimeType: "image/jpeg",
          mediaFileName: "foto.jpg",
          mediaFileSizeBytes: 12345,
          mediaCaption: null,
          mediaDurationSeconds: null,
          metadataJson: { hasMediaUrl: true },
          status: "SENT",
          externalMessageId: "ext-media-1",
          createdAt: "2026-02-24T10:12:00.000Z",
          updatedAt: "2026-02-24T10:12:01.000Z"
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

  it("envia mencoes em grupo com metadataJson.mentions", async () => {
    apiFetchMock.mockImplementation(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === "/users") {
        return [];
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

      if (path === "/conversations") {
        return [
          {
            id: "g1",
            channel: "WHATSAPP",
            status: "OPEN",
            externalId: "120363000000000000@g.us",
            contactName: "Grupo Demo",
            contactAvatarUrl: null,
            contactPhone: null,
            assignedToId: null,
            createdAt: "2026-02-24T10:00:00.000Z",
            updatedAt: "2026-02-24T10:00:00.000Z",
            lastMessageAt: "2026-02-24T10:10:00.000Z",
            lastMessage: {
              id: "gm1",
              content: "Bom dia grupo",
              direction: "INBOUND",
              status: "SENT",
              createdAt: "2026-02-24T10:10:00.000Z"
            }
          }
        ];
      }

      if (path.startsWith("/conversations/g1/messages?")) {
        return {
          conversationId: "g1",
          messages: [],
          hasMore: false
        };
      }

      if (path === "/conversations/g1/messages" && options?.method === "POST") {
        return {
          id: "gm-out-1",
          tenantId: "tenant-1",
          conversationId: "g1",
          direction: "OUTBOUND",
          senderName: "Admin Demo",
          senderAvatarUrl: null,
          content: String(options.body?.content ?? ""),
          status: "SENT",
          externalMessageId: "ext-gm-out-1",
          createdAt: "2026-02-24T10:11:00.000Z",
          updatedAt: "2026-02-24T10:11:00.000Z"
        };
      }

      return {};
    });

    const { state, wrapper } = mountComposable();
    await flushPromises();

    state.updateDraft("@1234567890 conferir mencao");
    await state.sendMessage({
      mentionedJids: ["5511912345678@s.whatsapp.net"]
    });
    await flushPromises();

    const postCall = apiFetchMock.mock.calls.find(
      (call) => call[0] === "/conversations/g1/messages" && call[1]?.method === "POST"
    );
    expect(postCall).toBeTruthy();

    const body = postCall?.[1]?.body as Record<string, unknown>;
    const metadata = body?.metadataJson as Record<string, unknown>;
    const mentions = metadata?.mentions as Record<string, unknown>;
    const mentioned = Array.isArray(mentions?.mentioned) ? mentions.mentioned : [];

    expect(mentions?.everyOne).toBe(false);
    expect(mentioned).toContain("1234567890@s.whatsapp.net");
    expect(mentioned).toContain("5511912345678@s.whatsapp.net");

    wrapper.unmount();
  });

  it("hidrata midia quando message.updated chega sem mediaUrl no realtime", async () => {
    const { state, wrapper } = mountComposable();
    await flushPromises();

    const updatedHandlerCall = socketMock.on.mock.calls.find((call) => call[0] === "message.updated");
    expect(updatedHandlerCall).toBeTruthy();

    const updatedHandler = updatedHandlerCall?.[1] as ((payload: Record<string, unknown>) => void);
    updatedHandler({
      id: "m-media-1",
      tenantId: "tenant-1",
      conversationId: "c1",
      direction: "INBOUND",
      messageType: "IMAGE",
      senderName: "Carlos Silva",
      senderAvatarUrl: null,
      content: "[imagem]",
      mediaUrl: null,
      mediaMimeType: "image/jpeg",
      mediaFileName: "foto.jpg",
      mediaFileSizeBytes: 12345,
      mediaCaption: null,
      mediaDurationSeconds: null,
      metadataJson: { hasMediaUrl: true },
      status: "SENT",
      externalMessageId: "ext-media-1",
      createdAt: "2026-02-24T10:12:00.000Z",
      updatedAt: "2026-02-24T10:12:00.000Z"
    });

    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith("/conversations/c1/messages/m-media-1");

    const mediaMessageItem = state.messageRenderItems.value.find((entry: any) => {
      return entry.kind === "message" && entry.message.id === "m-media-1";
    });

    expect(mediaMessageItem).toBeTruthy();
    expect(mediaMessageItem.message.mediaUrl).toBe("data:image/jpeg;base64,aGVsbG8=");

    wrapper.unmount();
  });

  it("sinaliza conversa com alerta de mencao quando chega inbound de grupo", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/users") {
        return [];
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

      if (path === "/conversations") {
        return [
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
            lastMessage: null
          },
          {
            id: "g1",
            channel: "WHATSAPP",
            status: "OPEN",
            externalId: "120363000000000000@g.us",
            contactName: "Grupo Demo",
            contactAvatarUrl: null,
            contactPhone: null,
            assignedToId: null,
            createdAt: "2026-02-24T10:00:00.000Z",
            updatedAt: "2026-02-24T10:00:00.000Z",
            lastMessageAt: "2026-02-24T10:09:00.000Z",
            lastMessage: null
          }
        ];
      }

      if (path.startsWith("/conversations/c1/messages?")) {
        return {
          conversationId: "c1",
          messages: [],
          hasMore: false
        };
      }

      throw new Error(`Unexpected call: ${path}`);
    });

    const { state, wrapper } = mountComposable();
    await flushPromises();

    const createdHandlerCall = socketMock.on.mock.calls.find((call) => call[0] === "message.created");
    expect(createdHandlerCall).toBeTruthy();
    const createdHandler = createdHandlerCall?.[1] as (payload: Record<string, unknown>) => Promise<void>;

    await createdHandler({
      id: "g-msg-1",
      tenantId: "tenant-1",
      conversationId: "g1",
      direction: "INBOUND",
      messageType: "TEXT",
      senderName: "Participante 1",
      senderAvatarUrl: null,
      content: "@agente verifica isso",
      metadataJson: {
        mentions: {
          everyOne: false,
          mentioned: ["5511999990001@s.whatsapp.net"]
        }
      },
      status: "SENT",
      externalMessageId: "ext-g-msg-1",
      createdAt: "2026-02-24T10:12:00.000Z",
      updatedAt: "2026-02-24T10:12:00.000Z"
    });

    expect(state.mentionConversationIds.value).toContain("g1");
    expect(state.mentionConversationCounts.value.g1).toBe(1);

    await createdHandler({
      id: "g-msg-2",
      tenantId: "tenant-1",
      conversationId: "g1",
      direction: "INBOUND",
      messageType: "TEXT",
      senderName: "Participante 2",
      senderAvatarUrl: null,
      content: "@agente ping 2",
      metadataJson: {
        mentions: {
          everyOne: false,
          mentioned: ["5511999990001@s.whatsapp.net"]
        }
      },
      status: "SENT",
      externalMessageId: "ext-g-msg-2",
      createdAt: "2026-02-24T10:13:00.000Z",
      updatedAt: "2026-02-24T10:13:00.000Z"
    });

    expect(state.mentionConversationCounts.value.g1).toBe(2);

    wrapper.unmount();
  });
});
