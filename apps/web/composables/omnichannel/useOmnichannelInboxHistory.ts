import { nextTick, type Ref } from "vue";
import type { Conversation, GroupParticipant, Message } from "~/types";
import type {
  GroupParticipantsResponse,
  MessagesPageResponse
} from "~/composables/omnichannel/useOmnichannelInboxShared";
import {
  MESSAGE_PAGE_SIZE,
  toArrayOrEmpty
} from "~/composables/omnichannel/useOmnichannelInboxShared";

export function useOmnichannelInboxHistory(options: {
  apiFetch: <T = unknown>(path: string, init?: Record<string, unknown>) => Promise<T>;
  conversations: Ref<Conversation[]>;
  messages: Ref<Message[]>;
  activeConversationId: Ref<string | null>;
  loadingConversations: Ref<boolean>;
  loadingMessages: Ref<boolean>;
  loadingOlderMessages: Ref<boolean>;
  loadingGroupParticipants: Ref<boolean>;
  hasMoreMessages: Ref<boolean>;
  chatBodyRef: Ref<HTMLElement | null>;
  mentionAlertState: Ref<Record<string, number>>;
  groupParticipantsByConversation: Record<string, GroupParticipant[]>;
  realtimeMessageHydrationLocks: Set<string>;
  groupParticipantsRefreshAtByConversation: Map<string, number>;
  sortConversations: () => void;
  bootstrapReadState: () => void;
  getReadAt: (conversationId: string) => number | null;
  getSelectConversation: () => ((conversationId: string) => Promise<void>) | null;
  normalizeMessage: (messageEntry: Message) => Message;
  mergeMessages: (...chunks: Message[][]) => Message[];
  updateConversationPreviewFromMessage: (messageEntry: Message) => void;
  messageNeedsMediaHydration: (messageEntry: Message) => boolean;
}) {
  async function fetchMessagesPage(conversationId: string, beforeId?: string) {
    const query = new URLSearchParams({
      limit: String(MESSAGE_PAGE_SIZE)
    });

    if (beforeId) {
      query.set("beforeId", beforeId);
    }

    return options.apiFetch<MessagesPageResponse>(`/conversations/${conversationId}/messages?${query.toString()}`);
  }

  async function fetchMessageById(conversationId: string, messageId: string) {
    return options.apiFetch<Message>(`/conversations/${conversationId}/messages/${messageId}`);
  }

  async function hydrateRealtimeMediaMessage(conversationId: string, messageId: string) {
    const key = `${conversationId}:${messageId}`;
    if (options.realtimeMessageHydrationLocks.has(key)) {
      return;
    }

    options.realtimeMessageHydrationLocks.add(key);
    const delays = [0, 350, 900, 1800];

    try {
      for (const delay of delays) {
        if (delay > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
        }

        try {
          const messageEntry = options.normalizeMessage(await fetchMessageById(conversationId, messageId));
          options.messages.value = options.mergeMessages(options.messages.value, [messageEntry]);
          options.updateConversationPreviewFromMessage(messageEntry);

          if (!options.messageNeedsMediaHydration(messageEntry)) {
            return;
          }
        } catch {
          // best-effort hydration for realtime payloads sanitized by the API.
        }
      }
    } finally {
      options.realtimeMessageHydrationLocks.delete(key);
    }
  }

  async function loadConversations() {
    options.loadingConversations.value = true;
    try {
      const response = await options.apiFetch<unknown>("/conversations");
      options.conversations.value = toArrayOrEmpty<Conversation>(response);
      const conversationIds = new Set(options.conversations.value.map((entry) => entry.id));
      options.mentionAlertState.value = Object.fromEntries(
        Object.entries(options.mentionAlertState.value).filter(([conversationId, count]) => {
          return Number(count) > 0 && conversationIds.has(conversationId);
        })
      );
      options.sortConversations();
      options.bootstrapReadState();

      if (!options.activeConversationId.value && options.conversations.value.length > 0) {
        const firstConversation = options.conversations.value[0];
        const selectConversation = options.getSelectConversation();
        if (firstConversation && selectConversation) {
          await selectConversation(firstConversation.id);
        }
      }
    } finally {
      options.loadingConversations.value = false;
    }
  }

  async function ensureUnreadBoundaryLoaded(conversationId: string) {
    const readAt = options.getReadAt(conversationId);
    if (!readAt) {
      return;
    }

    let guard = 0;

    while (
      options.hasMoreMessages.value &&
      options.messages.value.length > 0 &&
      Number(new Date(options.messages.value[0]?.createdAt ?? 0)) > readAt &&
      guard < 6
    ) {
      const oldestMessage = options.messages.value[0];
      if (!oldestMessage) {
        return;
      }

      const oldestId = oldestMessage.id;
      const response = await fetchMessagesPage(conversationId, oldestId);
      options.messages.value = options.mergeMessages(response.messages, options.messages.value);
      options.hasMoreMessages.value = response.hasMore;
      guard += 1;
    }
  }

  async function loadConversationMessages(conversationId: string) {
    options.loadingMessages.value = true;
    try {
      const response = await fetchMessagesPage(conversationId);
      options.messages.value = options.mergeMessages(response.messages);
      options.hasMoreMessages.value = response.hasMore;

      await ensureUnreadBoundaryLoaded(conversationId);
    } finally {
      options.loadingMessages.value = false;
    }
  }

  async function loadGroupParticipants(conversationId: string, force = false) {
    const conversationEntry = options.conversations.value.find((entry) => entry.id === conversationId);
    if (!conversationEntry?.externalId.endsWith("@g.us")) {
      options.groupParticipantsByConversation[conversationId] = [];
      return;
    }

    if (!force && options.groupParticipantsByConversation[conversationId]?.length) {
      return;
    }

    options.loadingGroupParticipants.value = true;
    try {
      const response = await options.apiFetch<GroupParticipantsResponse>(
        `/conversations/${conversationId}/group-participants`
      );
      options.groupParticipantsByConversation[conversationId] = response.participants ?? [];
    } catch {
      if (!options.groupParticipantsByConversation[conversationId]) {
        options.groupParticipantsByConversation[conversationId] = [];
      }
    } finally {
      options.loadingGroupParticipants.value = false;
    }
  }

  function shouldRefreshGroupParticipantsFromMessage(messageEntry: Message) {
    const conversationEntry = options.conversations.value.find((entry) => entry.id === messageEntry.conversationId);
    if (!conversationEntry || !conversationEntry.externalId.endsWith("@g.us")) {
      return false;
    }

    if (messageEntry.direction !== "INBOUND") {
      return false;
    }

    return true;
  }

  function scheduleGroupParticipantsRefresh(messageEntry: Message, force = false) {
    if (!shouldRefreshGroupParticipantsFromMessage(messageEntry)) {
      return;
    }

    const conversationId = messageEntry.conversationId;
    const now = Date.now();
    const lastRunAt = options.groupParticipantsRefreshAtByConversation.get(conversationId) ?? 0;

    if (!force && now - lastRunAt < 12_000) {
      return;
    }

    options.groupParticipantsRefreshAtByConversation.set(conversationId, now);
    void loadGroupParticipants(conversationId, true);
  }

  async function loadOlderMessages() {
    if (
      !options.activeConversationId.value ||
      !options.hasMoreMessages.value ||
      options.loadingOlderMessages.value ||
      !options.messages.value.length
    ) {
      return;
    }

    const container = options.chatBodyRef.value;
    if (!container) {
      return;
    }

    options.loadingOlderMessages.value = true;

    try {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;
      const oldestMessage = options.messages.value[0];
      if (!oldestMessage) {
        return;
      }

      const oldestMessageId = oldestMessage.id;

      const response = await fetchMessagesPage(options.activeConversationId.value, oldestMessageId);
      options.messages.value = options.mergeMessages(response.messages, options.messages.value);
      options.hasMoreMessages.value = response.hasMore;

      await nextTick();

      const nextHeight = container.scrollHeight;
      const diff = nextHeight - previousHeight;
      container.scrollTop = previousTop + diff;
    } finally {
      options.loadingOlderMessages.value = false;
    }
  }

  return {
    fetchMessagesPage,
    hydrateRealtimeMediaMessage,
    loadConversations,
    loadConversationMessages,
    loadGroupParticipants,
    loadOlderMessages,
    scheduleGroupParticipantsRefresh
  };
}
