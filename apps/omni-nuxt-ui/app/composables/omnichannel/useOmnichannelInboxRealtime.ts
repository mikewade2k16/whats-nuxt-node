import { io, type Socket } from "socket.io-client";
import { nextTick, type Ref } from "vue";
import type { Conversation, Message } from "~/types";
import {
  asRecord,
  isNearBottom
} from "~/composables/omnichannel/useOmnichannelInboxShared";

export type RealtimeConnectionState = "disconnected" | "connecting" | "connected" | "module_denied" | "auth_error";

export function useOmnichannelInboxRealtime(options: {
  publicApiBase: string;
  token: Ref<string | null>;
  conversations: Ref<Conversation[]>;
  messages: Ref<Message[]>;
  activeConversationId: Ref<string | null>;
  visibleMessagesConversationId: Ref<string | null>;
  selectedInstanceId: Ref<string>;
  chatBodyRef: Ref<HTMLElement | null>;
  loadConversations: () => Promise<void>;
  refreshConversationMessages: (conversationId: string) => Promise<void>;
  loadWhatsAppStatus: () => Promise<void>;
  upsertConversation: (conversationEntry: Conversation) => void;
  normalizeMessage: (messageEntry: Message) => Message;
  mergeMessages: (...chunks: Message[][]) => Message[];
  updateConversationPreviewFromMessage: (messageEntry: Message) => void;
  updateConversationCacheFromMessage: (messageEntry: Message) => void;
  scheduleGroupParticipantsRefresh: (messageEntry: Message, force?: boolean) => void;
  shouldFlagMentionAlert: (messageEntry: Message) => boolean;
  incrementMentionAlert: (conversationId: string, amount?: number) => void;
  scrollToBottom: () => void;
  markConversationAsRead: (messageEntry?: Message) => void;
  messageNeedsMediaHydration: (messageEntry: Message) => boolean;
  hydrateRealtimeMediaMessage: (conversationId: string, messageId: string) => Promise<void>;
  scheduleStickyDateRefresh: () => void;
  enforceMessageWindow?: () => void;
}) {
  let socket: Socket | null = null;
  let socketManuallyClosed = false;
  const realtimeConnectionState = ref<RealtimeConnectionState>("disconnected");
  let reconnectSyncInFlight = false;
  let conversationsRefreshInFlight: Promise<void> | null = null;
  let lastConversationsRefreshAt = 0;
  let whatsappStatusPollTimer: ReturnType<typeof setTimeout> | null = null;
  let whatsappStatusPollingActive = false;
  let whatsappStatusPollingInFlight = false;
  let staleFallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
  let staleFallbackPollingActive = false;
  let staleFallbackPollingInFlight = false;
  let connectedHeartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let connectedHeartbeatActive = false;
  let visibilityChangeHandler: (() => void) | null = null;
  const WHATSAPP_STATUS_POLL_INTERVAL_MS = 45_000;
  const CONVERSATIONS_REFRESH_COOLDOWN_MS = 5_000;
  const STALE_FALLBACK_POLL_INTERVAL_MS = 20_000;
  const STALE_FALLBACK_POLL_START_DELAY_MS = 4_000;
  const CONNECTED_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
  const PAGE_VISIBILITY_STALE_THRESHOLD_MS = 5 * 60_000;

  function conversationMatchesSelectedInstance(conversation: {
    id: string;
    instanceId?: string | null;
  }) {
    const selectedInstanceId = options.selectedInstanceId.value;
    if (!selectedInstanceId || selectedInstanceId === "all") {
      return true;
    }

    return conversation.instanceId === selectedInstanceId;
  }

  function clearWhatsAppStatusPollTimer() {
    if (!whatsappStatusPollTimer) {
      return;
    }

    clearTimeout(whatsappStatusPollTimer);
    whatsappStatusPollTimer = null;
  }

  function scheduleWhatsAppStatusPoll(delay = WHATSAPP_STATUS_POLL_INTERVAL_MS) {
    if (!whatsappStatusPollingActive) {
      return;
    }

    clearWhatsAppStatusPollTimer();
    whatsappStatusPollTimer = setTimeout(() => {
      void runWhatsAppStatusPollCycle();
    }, delay);
  }

  async function runWhatsAppStatusPollCycle() {
    if (!whatsappStatusPollingActive) {
      return;
    }

    if (import.meta.client && document.visibilityState === "hidden") {
      scheduleWhatsAppStatusPoll();
      return;
    }

    if (whatsappStatusPollingInFlight) {
      scheduleWhatsAppStatusPoll();
      return;
    }

    whatsappStatusPollingInFlight = true;
    try {
      await options.loadWhatsAppStatus();
    } finally {
      whatsappStatusPollingInFlight = false;
      scheduleWhatsAppStatusPoll();
    }
  }

  function clearStaleFallbackPollTimer() {
    if (!staleFallbackPollTimer) {
      return;
    }

    clearTimeout(staleFallbackPollTimer);
    staleFallbackPollTimer = null;
  }

  function scheduleStaleFallbackPoll(delay = STALE_FALLBACK_POLL_INTERVAL_MS) {
    if (!staleFallbackPollingActive) {
      return;
    }

    clearStaleFallbackPollTimer();
    staleFallbackPollTimer = setTimeout(() => {
      void runStaleFallbackPollCycle();
    }, delay);
  }

  async function runStaleFallbackPollCycle() {
    if (!staleFallbackPollingActive) {
      return;
    }

    if (import.meta.client && document.visibilityState === "hidden") {
      scheduleStaleFallbackPoll();
      return;
    }

    if (staleFallbackPollingInFlight) {
      scheduleStaleFallbackPoll();
      return;
    }

    staleFallbackPollingInFlight = true;
    try {
      await refreshConversationsFromRealtime({
        force: true,
        reloadActive: true
      });
    } finally {
      staleFallbackPollingInFlight = false;
      scheduleStaleFallbackPoll();
    }
  }

  function startStaleFallbackPolling() {
    if (staleFallbackPollingActive) {
      return;
    }

    staleFallbackPollingActive = true;
    scheduleStaleFallbackPoll(STALE_FALLBACK_POLL_START_DELAY_MS);
  }

  function stopStaleFallbackPolling() {
    staleFallbackPollingActive = false;
    staleFallbackPollingInFlight = false;
    clearStaleFallbackPollTimer();
  }

  async function refreshConversationsFromRealtime(optionsArg: { force?: boolean; reloadActive?: boolean } = {}) {
    const force = optionsArg.force ?? false;
    const reloadActive = optionsArg.reloadActive ?? false;
    const now = Date.now();

    if (conversationsRefreshInFlight) {
      await conversationsRefreshInFlight;
      return;
    }

    if (!force && now - lastConversationsRefreshAt < CONVERSATIONS_REFRESH_COOLDOWN_MS) {
      return;
    }

    const request = (async () => {
      await options.loadConversations();

      if (!reloadActive) {
        return;
      }

      const activeConversationId = options.activeConversationId.value;
      if (activeConversationId) {
        await options.refreshConversationMessages(activeConversationId);
      }
    })();

    conversationsRefreshInFlight = request;
    try {
      await request;
    } finally {
      lastConversationsRefreshAt = Date.now();
      if (conversationsRefreshInFlight === request) {
        conversationsRefreshInFlight = null;
      }
    }
  }

  function clearConnectedHeartbeatTimer() {
    if (!connectedHeartbeatTimer) return;
    clearTimeout(connectedHeartbeatTimer);
    connectedHeartbeatTimer = null;
  }

  function scheduleConnectedHeartbeat() {
    if (!connectedHeartbeatActive) return;
    clearConnectedHeartbeatTimer();
    connectedHeartbeatTimer = setTimeout(() => {
      void runConnectedHeartbeatCycle();
    }, CONNECTED_HEARTBEAT_INTERVAL_MS);
  }

  async function runConnectedHeartbeatCycle() {
    if (!connectedHeartbeatActive) return;

    if (import.meta.client && document.visibilityState === "hidden") {
      scheduleConnectedHeartbeat();
      return;
    }

    const reloadActive = Boolean(options.activeConversationId.value);
    await refreshConversationsFromRealtime({ force: true, reloadActive });
    scheduleConnectedHeartbeat();
  }

  function startConnectedHeartbeat() {
    connectedHeartbeatActive = true;
    scheduleConnectedHeartbeat();
  }

  function stopConnectedHeartbeat() {
    connectedHeartbeatActive = false;
    clearConnectedHeartbeatTimer();
  }

  function handleVisibilityChange() {
    if (!import.meta.client || document.visibilityState !== "visible") return;
    const timeSinceLastSync = Date.now() - lastConversationsRefreshAt;
    if (timeSinceLastSync < PAGE_VISIBILITY_STALE_THRESHOLD_MS) return;
    const reloadActive = Boolean(options.activeConversationId.value);
    void refreshConversationsFromRealtime({ force: true, reloadActive });
  }

  function addVisibilityChangeListener() {
    if (!import.meta.client) return;
    removeVisibilityChangeListener();
    visibilityChangeHandler = handleVisibilityChange;
    document.addEventListener("visibilitychange", visibilityChangeHandler);
  }

  function removeVisibilityChangeListener() {
    if (!visibilityChangeHandler) return;
    document.removeEventListener("visibilitychange", visibilityChangeHandler);
    visibilityChangeHandler = null;
  }

  function connectSocket() {
    if (!options.token.value || socket) {
      return;
    }

    socketManuallyClosed = false;
    realtimeConnectionState.value = "connecting";

    socket = io(options.publicApiBase, {
      transports: ["websocket"],
      auth: {
        token: options.token.value
      }
    });

    socket.on("connect", () => {
      realtimeConnectionState.value = "connected";
      stopStaleFallbackPolling();
      startConnectedHeartbeat();
      addVisibilityChangeListener();

      if (reconnectSyncInFlight) {
        return;
      }

      reconnectSyncInFlight = true;
      void (async () => {
        await refreshConversationsFromRealtime({
          force: true,
          reloadActive: true
        });
      })().finally(() => {
        reconnectSyncInFlight = false;
      });
    });

    socket.on("connect_error", (error) => {
      if (socketManuallyClosed) {
        return;
      }

      const errorMessage = error?.message ?? "";
      if (errorMessage === "ModuleAccessDenied") {
        realtimeConnectionState.value = "module_denied";
        socket?.disconnect();
        socket = null;
        startStaleFallbackPolling();
        return;
      }

      if (errorMessage === "Unauthorized") {
        realtimeConnectionState.value = "auth_error";
        startStaleFallbackPolling();
        return;
      }

      realtimeConnectionState.value = "disconnected";
      startStaleFallbackPolling();
    });

    socket.on("disconnect", () => {
      if (socketManuallyClosed) {
        return;
      }

      realtimeConnectionState.value = "disconnected";
      stopConnectedHeartbeat();
      removeVisibilityChangeListener();
      startStaleFallbackPolling();
    });

    socket.on("conversation.updated", (payload: Conversation) => {
      if (!conversationMatchesSelectedInstance(payload)) {
        const existingConversation = options.conversations.value.find((entry) => entry.id === payload.id);
        if (existingConversation) {
          options.conversations.value = options.conversations.value.filter((entry) => entry.id !== payload.id);
          if (options.activeConversationId.value === payload.id) {
            options.activeConversationId.value = null;
            options.messages.value = [];
          }
        }
        return;
      }

      options.upsertConversation(payload);
    });

    socket.on("message.created", async (payload: Message) => {
      const payloadRecord = asRecord(payload);
      const correlationId =
        payloadRecord && typeof payloadRecord.correlationId === "string"
          ? payloadRecord.correlationId.trim()
          : "";
      const isHistoryBackfillEvent = correlationId.startsWith("sync-history:");
      const normalizedPayload = options.normalizeMessage(payload);

      if (isHistoryBackfillEvent) {
        return;
      }

      options.updateConversationPreviewFromMessage(normalizedPayload);
      options.scheduleGroupParticipantsRefresh(normalizedPayload);
      const hasMentionAlert = options.shouldFlagMentionAlert(normalizedPayload);
      const isVisibleActiveConversation =
        normalizedPayload.conversationId === options.activeConversationId.value &&
        options.visibleMessagesConversationId.value === normalizedPayload.conversationId;

      if (isVisibleActiveConversation) {
        const shouldStickToBottom = isNearBottom(options.chatBodyRef.value);

        options.messages.value = options.mergeMessages(options.messages.value, [normalizedPayload]);
        if (options.enforceMessageWindow) {
          options.enforceMessageWindow();
        }
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

      options.updateConversationCacheFromMessage(normalizedPayload);

      if (!options.conversations.value.find((entry) => entry.id === normalizedPayload.conversationId)) {
        await refreshConversationsFromRealtime();
      }

      if (hasMentionAlert) {
        options.incrementMentionAlert(normalizedPayload.conversationId);
      }
    });

    socket.on("message.updated", (payload: Partial<Message> & { id: string }) => {
      const payloadRecord = asRecord(payload);
      const messageId = payloadRecord && typeof payloadRecord.id === "string" ? payloadRecord.id : "";
      const correlationId =
        payloadRecord && typeof payloadRecord.correlationId === "string"
          ? payloadRecord.correlationId.trim()
          : "";
      const isHistoryBackfillEvent = correlationId.startsWith("sync-history:");
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
        const isVisibleActiveConversation =
          normalizedPayload.conversationId === options.activeConversationId.value &&
          options.visibleMessagesConversationId.value === normalizedPayload.conversationId;
        options.scheduleGroupParticipantsRefresh(normalizedPayload);
        if (isVisibleActiveConversation) {
          options.messages.value = options.mergeMessages(options.messages.value, [normalizedPayload]);
        }

        options.updateConversationCacheFromMessage(normalizedPayload);

        if (!isHistoryBackfillEvent) {
          options.updateConversationPreviewFromMessage(normalizedPayload);
        }

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

      if (mergedMessage && !isHistoryBackfillEvent) {
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
    socketManuallyClosed = true;
    reconnectSyncInFlight = false;
    realtimeConnectionState.value = "disconnected";
    stopStaleFallbackPolling();
    stopConnectedHeartbeat();
    removeVisibilityChangeListener();

    if (!socket) {
      return;
    }

    socket.disconnect();
    socket = null;
  }

  function stopWhatsAppStatusPolling() {
    whatsappStatusPollingActive = false;
    clearWhatsAppStatusPollTimer();
  }

  function startWhatsAppStatusPolling() {
    stopWhatsAppStatusPolling();
    whatsappStatusPollingActive = true;
    scheduleWhatsAppStatusPoll();
  }

  return {
    realtimeConnectionState,
    connectSocket,
    disconnectSocket,
    startWhatsAppStatusPolling,
    stopWhatsAppStatusPolling
  };
}
