import { io, type Socket } from "socket.io-client";
import { nextTick, type Ref } from "vue";
import type { Conversation, Message } from "~/types";
import {
  asRecord,
  isNearBottom
} from "~/composables/omnichannel/useOmnichannelInboxShared";

export function useOmnichannelInboxRealtime(options: {
  publicApiBase: string;
  token: Ref<string | null>;
  conversations: Ref<Conversation[]>;
  messages: Ref<Message[]>;
  activeConversationId: Ref<string | null>;
  chatBodyRef: Ref<HTMLElement | null>;
  loadConversations: () => Promise<void>;
  loadWhatsAppStatus: () => Promise<void>;
  upsertConversation: (conversationEntry: Conversation) => void;
  normalizeMessage: (messageEntry: Message) => Message;
  mergeMessages: (...chunks: Message[][]) => Message[];
  updateConversationPreviewFromMessage: (messageEntry: Message) => void;
  scheduleGroupParticipantsRefresh: (messageEntry: Message, force?: boolean) => void;
  shouldFlagMentionAlert: (messageEntry: Message) => boolean;
  incrementMentionAlert: (conversationId: string, amount?: number) => void;
  scrollToBottom: () => void;
  markConversationAsRead: (messageEntry?: Message) => void;
  messageNeedsMediaHydration: (messageEntry: Message) => boolean;
  hydrateRealtimeMediaMessage: (conversationId: string, messageId: string) => Promise<void>;
  scheduleStickyDateRefresh: () => void;
}) {
  let socket: Socket | null = null;
  let whatsappStatusPollTimer: ReturnType<typeof setInterval> | null = null;

  function connectSocket() {
    if (!options.token.value || socket) {
      return;
    }

    socket = io(options.publicApiBase, {
      transports: ["websocket"],
      auth: {
        token: options.token.value
      }
    });

    socket.on("conversation.updated", (payload: Conversation) => {
      options.upsertConversation(payload);
    });

    socket.on("message.created", async (payload: Message) => {
      const normalizedPayload = options.normalizeMessage(payload);
      options.updateConversationPreviewFromMessage(normalizedPayload);
      options.scheduleGroupParticipantsRefresh(normalizedPayload);
      const hasMentionAlert = options.shouldFlagMentionAlert(normalizedPayload);

      if (normalizedPayload.conversationId === options.activeConversationId.value) {
        const shouldStickToBottom = isNearBottom(options.chatBodyRef.value);

        options.messages.value = options.mergeMessages(options.messages.value, [normalizedPayload]);
        await nextTick();

        if (normalizedPayload.direction === "OUTBOUND" || shouldStickToBottom) {
          options.scrollToBottom();
        }

        if (normalizedPayload.direction === "OUTBOUND" || shouldStickToBottom) {
          options.markConversationAsRead(normalizedPayload);
        }

        if (hasMentionAlert && !shouldStickToBottom) {
          options.incrementMentionAlert(normalizedPayload.conversationId);
        }

        if (options.messageNeedsMediaHydration(normalizedPayload)) {
          void options.hydrateRealtimeMediaMessage(normalizedPayload.conversationId, normalizedPayload.id);
        }

        options.scheduleStickyDateRefresh();
        return;
      }

      if (!options.conversations.value.find((entry) => entry.id === normalizedPayload.conversationId)) {
        await options.loadConversations();
      }

      if (hasMentionAlert) {
        options.incrementMentionAlert(normalizedPayload.conversationId);
      }
    });

    socket.on("message.updated", (payload: Partial<Message> & { id: string }) => {
      const payloadRecord = asRecord(payload);
      const messageId = payloadRecord && typeof payloadRecord.id === "string" ? payloadRecord.id : "";
      if (!messageId) {
        return;
      }

      const messageIndex = options.messages.value.findIndex((entry) => entry.id === messageId);
      let mergedMessage: Message | null = null;

      if (messageIndex >= 0) {
        mergedMessage = options.normalizeMessage({
          ...options.messages.value[messageIndex],
          ...payload
        } as Message);
        options.messages.value[messageIndex] = mergedMessage;
      }

      const isFullMessagePayload =
        payloadRecord !== null &&
        typeof payloadRecord.conversationId === "string" &&
        payloadRecord.conversationId.trim().length > 0 &&
        typeof payloadRecord.direction === "string" &&
        typeof payloadRecord.createdAt === "string";

      if (isFullMessagePayload) {
        const normalizedPayload = options.normalizeMessage(payload as Message);
        options.scheduleGroupParticipantsRefresh(normalizedPayload);
        if (normalizedPayload.conversationId === options.activeConversationId.value) {
          options.messages.value = options.mergeMessages(options.messages.value, [normalizedPayload]);
        }

        options.updateConversationPreviewFromMessage(normalizedPayload);

        if (options.messageNeedsMediaHydration(normalizedPayload)) {
          void options.hydrateRealtimeMediaMessage(normalizedPayload.conversationId, normalizedPayload.id);
        }

        if (
          options.shouldFlagMentionAlert(normalizedPayload) &&
          normalizedPayload.conversationId !== options.activeConversationId.value
        ) {
          options.incrementMentionAlert(normalizedPayload.conversationId);
        }

        return;
      }

      if (mergedMessage) {
        options.updateConversationPreviewFromMessage(mergedMessage);

        if (
          mergedMessage.conversationId === options.activeConversationId.value &&
          options.messageNeedsMediaHydration(mergedMessage)
        ) {
          void options.hydrateRealtimeMediaMessage(mergedMessage.conversationId, mergedMessage.id);
        }
      }

      for (const conversationEntry of options.conversations.value) {
        if (conversationEntry.lastMessage?.id !== messageId) {
          continue;
        }

        if (payload.status) {
          conversationEntry.lastMessage.status = payload.status;
        }

        if (typeof payload.content === "string" && payload.content.trim().length > 0) {
          conversationEntry.lastMessage.content = payload.content;
        }

        if (typeof payload.mediaUrl === "string" && payload.mediaUrl.trim().length > 0) {
          conversationEntry.lastMessage.mediaUrl = payload.mediaUrl;
        }

        break;
      }
    });
  }

  function disconnectSocket() {
    if (!socket) {
      return;
    }

    socket.disconnect();
    socket = null;
  }

  function stopWhatsAppStatusPolling() {
    if (!whatsappStatusPollTimer) {
      return;
    }

    clearInterval(whatsappStatusPollTimer);
    whatsappStatusPollTimer = null;
  }

  function startWhatsAppStatusPolling() {
    stopWhatsAppStatusPolling();
    whatsappStatusPollTimer = setInterval(() => {
      void options.loadWhatsAppStatus();
    }, 15_000);
  }

  return {
    connectSocket,
    disconnectSocket,
    startWhatsAppStatusPolling,
    stopWhatsAppStatusPolling
  };
}
