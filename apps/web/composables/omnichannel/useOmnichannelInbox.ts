import { io, type Socket } from "socket.io-client";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { InboxRenderItem, InboxSelectOption } from "~/components/omnichannel/inbox/types";
import type { Conversation, ConversationStatus, Message, TenantUser } from "~/types";

interface MessagesPageResponse {
  conversationId: string;
  messages: Message[];
  hasMore: boolean;
}

interface ReadStateEntry {
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}

const UNASSIGNED_VALUE = "__unassigned__";
const MESSAGE_PAGE_SIZE = 80;

export function useOmnichannelInbox() {
  const config = useRuntimeConfig();
  const { user, token, clearSession } = useAuth();
  const { apiFetch } = useApi();

  const conversations = ref<Conversation[]>([]);
  const users = ref<TenantUser[]>([]);
  const messages = ref<Message[]>([]);

  const activeConversationId = ref<string | null>(null);
  const leftCollapsed = ref(false);
  const rightCollapsed = ref(false);
  const showFilters = ref(true);

  const loadingConversations = ref(false);
  const loadingUsers = ref(false);
  const loadingMessages = ref(false);
  const loadingOlderMessages = ref(false);
  const sendingMessage = ref(false);
  const updatingStatus = ref(false);
  const updatingAssignee = ref(false);

  const hasMoreMessages = ref(false);
  const stickyDateLabel = ref("");
  const showStickyDate = ref(false);

  const draft = ref("");
  const search = ref("");
  const channel = ref("all");
  const status = ref("all");
  const replyTarget = ref<Message | null>(null);
  const assigneeModel = ref<string>(UNASSIGNED_VALUE);

  const notesByConversation = reactive<Record<string, string>>({});
  const readState = ref<Record<string, ReadStateEntry>>({});

  const chatBodyRef = ref<HTMLElement | null>(null);
  let scrollRaf: number | null = null;
  let socket: Socket | null = null;

  const channelFilterItems: InboxSelectOption[] = [
    { label: "Todos canais", value: "all" },
    { label: "WhatsApp", value: "WHATSAPP" },
    { label: "Instagram", value: "INSTAGRAM" }
  ];

  const statusFilterItems: InboxSelectOption[] = [
    { label: "Todos status", value: "all" },
    { label: "Abertos", value: "OPEN" },
    { label: "Pendentes", value: "PENDING" },
    { label: "Encerrados", value: "CLOSED" }
  ];

  const statusActionItems: InboxSelectOption[] = [
    { label: "Aberto", value: "OPEN" },
    { label: "Pendente", value: "PENDING" },
    { label: "Encerrado", value: "CLOSED" }
  ];

  const assigneeItems = computed<InboxSelectOption[]>(() => {
    return [
      { label: "Nao atribuido", value: UNASSIGNED_VALUE },
      ...users.value.map((entry) => ({
        label: `${entry.name} (${entry.role})`,
        value: entry.id
      }))
    ];
  });

  const activeConversation = computed(() => {
    if (!activeConversationId.value) {
      return null;
    }

    return conversations.value.find((conversationEntry) => conversationEntry.id === activeConversationId.value) ?? null;
  });

  const activeConversationLabel = computed(() => {
    if (!activeConversation.value) {
      return null;
    }

    return (
      activeConversation.value.contactName ||
      activeConversation.value.contactPhone ||
      activeConversation.value.externalId
    );
  });

  const isGroupConversation = computed(() => {
    return Boolean(activeConversation.value?.externalId?.endsWith("@g.us"));
  });

  const readStateStorageKey = computed(() => {
    return `omni:read-state:${user.value?.tenantId ?? "tenant"}:${user.value?.id ?? "user"}`;
  });

  const internalNotes = computed({
    get() {
      const conversationId = activeConversationId.value;
      if (!conversationId) {
        return "";
      }

      return notesByConversation[conversationId] ?? "";
    },
    set(value: string) {
      const conversationId = activeConversationId.value;
      if (!conversationId) {
        return;
      }

      notesByConversation[conversationId] = value;
    }
  });

  const filteredConversations = computed(() => {
    const normalizedSearch = search.value.trim().toLowerCase();

    return conversations.value.filter((conversationEntry) => {
      if (channel.value !== "all" && conversationEntry.channel !== channel.value) {
        return false;
      }

      if (status.value !== "all" && conversationEntry.status !== status.value) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const joinedText = [
        conversationEntry.contactName ?? "",
        conversationEntry.contactPhone ?? "",
        conversationEntry.externalId,
        conversationEntry.lastMessage?.content ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return joinedText.includes(normalizedSearch);
    });
  });

  const unreadConversationIds = computed(() => {
    return conversations.value
      .filter((conversationEntry) => isConversationUnread(conversationEntry))
      .map((conversationEntry) => conversationEntry.id);
  });

  const firstUnreadMessageId = computed(() => {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return null;
    }

    const entry = readState.value[conversationId];
    if (!entry?.lastReadAt) {
      return null;
    }

    const readTimestamp = Number(new Date(entry.lastReadAt));
    if (!Number.isFinite(readTimestamp)) {
      return null;
    }

    const firstUnread = messages.value.find((messageEntry) => {
      return Number(new Date(messageEntry.createdAt)) > readTimestamp;
    });

    return firstUnread?.id ?? null;
  });

  const messageRenderItems = computed<InboxRenderItem[]>(() => {
    const items: InboxRenderItem[] = [];
    const unreadMessageId = firstUnreadMessageId.value;
    let unreadInserted = false;
    let previousDateKey = "";

    for (const messageEntry of messages.value) {
      const dateKey = buildDateKey(messageEntry.createdAt);
      const dateLabel = formatDateHeader(messageEntry.createdAt);

      if (dateKey !== previousDateKey) {
        items.push({
          kind: "date",
          key: `date-${dateKey}`,
          label: dateLabel
        });
        previousDateKey = dateKey;
      }

      if (!unreadInserted && unreadMessageId && messageEntry.id === unreadMessageId) {
        items.push({ kind: "unread", key: "unread-marker" });
        unreadInserted = true;
      }

      items.push({
        kind: "message",
        key: messageEntry.id,
        message: messageEntry,
        dateKey,
        dateLabel
      });
    }

    return items;
  });

  function ensureAuthOrRedirect() {
    if (!token.value) {
      void navigateTo("/login");
    }
  }

  function buildDateKey(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateHeader(value: string) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (buildDateKey(date.toISOString()) === buildDateKey(today.toISOString())) {
      return "Hoje";
    }

    if (buildDateKey(date.toISOString()) === buildDateKey(yesterday.toISOString())) {
      return "Ontem";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function isNearBottom(element: HTMLElement | null) {
    if (!element) {
      return false;
    }

    const distance = element.scrollHeight - (element.scrollTop + element.clientHeight);
    return distance < 48;
  }

  function messageRowId(messageId: string) {
    return `chat-message-${messageId}`;
  }

  function sortConversations() {
    conversations.value.sort((left, right) => {
      return Number(new Date(right.lastMessageAt)) - Number(new Date(left.lastMessageAt));
    });
  }

  function mergeMessages(...chunks: Message[][]) {
    const map = new Map<string, Message>();

    for (const chunk of chunks) {
      for (const messageEntry of chunk) {
        const previous = map.get(messageEntry.id);
        map.set(messageEntry.id, {
          ...previous,
          ...messageEntry
        });
      }
    }

    return [...map.values()].sort((left, right) => {
      const leftTime = Number(new Date(left.createdAt));
      const rightTime = Number(new Date(right.createdAt));

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.id.localeCompare(right.id);
    });
  }

  function getReadAt(conversationId: string) {
    const entry = readState.value[conversationId];
    if (!entry?.lastReadAt) {
      return null;
    }

    const timestamp = Number(new Date(entry.lastReadAt));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function loadReadState() {
    if (!import.meta.client) {
      return;
    }

    const raw = localStorage.getItem(readStateStorageKey.value);
    if (!raw) {
      readState.value = {};
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, ReadStateEntry>;
      readState.value = parsed;
    } catch {
      readState.value = {};
    }
  }

  function saveReadState() {
    if (!import.meta.client) {
      return;
    }

    localStorage.setItem(readStateStorageKey.value, JSON.stringify(readState.value));
  }

  function bootstrapReadState() {
    if (Object.keys(readState.value).length > 0) {
      return;
    }

    const nextState: Record<string, ReadStateEntry> = {};

    for (const conversationEntry of conversations.value) {
      nextState[conversationEntry.id] = {
        lastReadAt: conversationEntry.lastMessageAt,
        lastReadMessageId: conversationEntry.lastMessage?.id ?? null
      };
    }

    readState.value = nextState;
    saveReadState();
  }

  function markConversationAsRead(messageEntry?: Message) {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return;
    }

    const targetMessage = messageEntry ?? messages.value[messages.value.length - 1];
    if (!targetMessage) {
      return;
    }

    const currentReadAt = getReadAt(conversationId);
    const nextReadAt = Number(new Date(targetMessage.createdAt));

    if (currentReadAt && currentReadAt >= nextReadAt) {
      return;
    }

    readState.value = {
      ...readState.value,
      [conversationId]: {
        lastReadAt: targetMessage.createdAt,
        lastReadMessageId: targetMessage.id
      }
    };
    saveReadState();
  }

  function isConversationUnread(conversationEntry: Conversation) {
    const readAt = getReadAt(conversationEntry.id);

    if (!readAt) {
      return false;
    }

    return Number(new Date(conversationEntry.lastMessageAt)) > readAt;
  }

  function upsertConversation(conversationEntry: Conversation) {
    const index = conversations.value.findIndex((item) => item.id === conversationEntry.id);
    if (index >= 0) {
      conversations.value[index] = {
        ...conversations.value[index],
        ...conversationEntry
      };
    } else {
      conversations.value.push(conversationEntry);
    }

    sortConversations();

    if (activeConversationId.value === conversationEntry.id) {
      assigneeModel.value = conversationEntry.assignedToId ?? UNASSIGNED_VALUE;
    }
  }

  function updateConversationPreviewFromMessage(messageEntry: Message) {
    const conversationEntry = conversations.value.find((item) => item.id === messageEntry.conversationId);
    if (!conversationEntry) {
      return;
    }

    conversationEntry.lastMessageAt = messageEntry.createdAt;
    conversationEntry.status = "OPEN";
    conversationEntry.lastMessage = {
      id: messageEntry.id,
      content: messageEntry.content,
      direction: messageEntry.direction,
      status: messageEntry.status,
      createdAt: messageEntry.createdAt
    };

    sortConversations();
  }

  async function fetchMessagesPage(conversationId: string, beforeId?: string) {
    const query = new URLSearchParams({
      limit: String(MESSAGE_PAGE_SIZE)
    });

    if (beforeId) {
      query.set("beforeId", beforeId);
    }

    return apiFetch<MessagesPageResponse>(`/conversations/${conversationId}/messages?${query.toString()}`);
  }

  async function loadUsers() {
    loadingUsers.value = true;
    try {
      users.value = await apiFetch<TenantUser[]>("/users");
    } finally {
      loadingUsers.value = false;
    }
  }

  async function loadConversations() {
    loadingConversations.value = true;
    try {
      conversations.value = await apiFetch<Conversation[]>("/conversations");
      sortConversations();
      bootstrapReadState();

      if (!activeConversationId.value && conversations.value.length > 0) {
        await selectConversation(conversations.value[0].id);
      }
    } finally {
      loadingConversations.value = false;
    }
  }

  async function ensureUnreadBoundaryLoaded(conversationId: string) {
    const readAt = getReadAt(conversationId);
    if (!readAt) {
      return;
    }

    let guard = 0;

    while (
      hasMoreMessages.value &&
      messages.value.length > 0 &&
      Number(new Date(messages.value[0].createdAt)) > readAt &&
      guard < 6
    ) {
      const oldestId = messages.value[0].id;
      const response = await fetchMessagesPage(conversationId, oldestId);
      messages.value = mergeMessages(response.messages, messages.value);
      hasMoreMessages.value = response.hasMore;
      guard += 1;
    }
  }

  async function loadConversationMessages(conversationId: string) {
    loadingMessages.value = true;
    try {
      const response = await fetchMessagesPage(conversationId);
      messages.value = mergeMessages(response.messages);
      hasMoreMessages.value = response.hasMore;

      await ensureUnreadBoundaryLoaded(conversationId);
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadOlderMessages() {
    if (!activeConversationId.value || !hasMoreMessages.value || loadingOlderMessages.value || !messages.value.length) {
      return;
    }

    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    loadingOlderMessages.value = true;

    try {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;
      const oldestMessageId = messages.value[0].id;

      const response = await fetchMessagesPage(activeConversationId.value, oldestMessageId);
      messages.value = mergeMessages(response.messages, messages.value);
      hasMoreMessages.value = response.hasMore;

      await nextTick();

      const nextHeight = container.scrollHeight;
      const diff = nextHeight - previousHeight;
      container.scrollTop = previousTop + diff;
    } finally {
      loadingOlderMessages.value = false;
    }
  }

  function scheduleStickyDateRefresh() {
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
    }

    scrollRaf = requestAnimationFrame(() => {
      refreshStickyDate();
      scrollRaf = null;
    });
  }

  function refreshStickyDate() {
    const container = chatBodyRef.value;
    if (!container) {
      showStickyDate.value = false;
      stickyDateLabel.value = "";
      return;
    }

    const rows = container.querySelectorAll<HTMLElement>(".chat-message-row");
    if (!rows.length) {
      showStickyDate.value = false;
      stickyDateLabel.value = "";
      return;
    }

    const topLimit = container.getBoundingClientRect().top + 16;
    let selectedRow: HTMLElement | null = null;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.top <= topLimit) {
        selectedRow = row;
        continue;
      }

      break;
    }

    if (!selectedRow) {
      selectedRow = rows[0];
    }

    stickyDateLabel.value = selectedRow.dataset.dateLabel ?? "";
    showStickyDate.value = container.scrollTop > 24 && stickyDateLabel.value.length > 0;
  }

  function scrollToBottom() {
    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  async function positionConversationOnOpen() {
    await nextTick();

    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    const unreadId = firstUnreadMessageId.value;

    if (unreadId) {
      const marker = document.getElementById("chat-unread-anchor");
      if (marker) {
        container.scrollTop = Math.max(marker.offsetTop - 24, 0);
      } else {
        const messageRow = document.getElementById(messageRowId(unreadId));
        if (messageRow) {
          container.scrollTop = Math.max(messageRow.offsetTop - 24, 0);
        } else {
          scrollToBottom();
        }
      }
    } else {
      scrollToBottom();
      markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  async function selectConversation(conversationId: string) {
    activeConversationId.value = conversationId;
    draft.value = "";
    replyTarget.value = null;
    assigneeModel.value = conversations.value.find((entry) => entry.id === conversationId)?.assignedToId ?? UNASSIGNED_VALUE;

    await loadConversationMessages(conversationId);
    await positionConversationOnOpen();
  }

  function onChatScroll() {
    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    if (container.scrollTop < 96) {
      void loadOlderMessages();
    }

    if (isNearBottom(container)) {
      markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  function onChatBodyMounted(element: HTMLElement | null) {
    chatBodyRef.value = element;
  }

  function setReplyTarget(messageEntry: Message) {
    replyTarget.value = messageEntry;
  }

  function clearReplyTarget() {
    replyTarget.value = null;
  }

  function updateDraft(value: string) {
    draft.value = value;
  }

  function updateSearch(value: string) {
    search.value = value;
  }

  function updateChannel(value: string) {
    channel.value = value;
  }

  function updateStatus(value: string) {
    status.value = value;
  }

  function updateShowFilters(value: boolean) {
    showFilters.value = value;
  }

  function updateLeftCollapsed(value: boolean) {
    leftCollapsed.value = value;
  }

  function updateRightCollapsed(value: boolean) {
    rightCollapsed.value = value;
  }

  function updateAssigneeModel(value: string) {
    assigneeModel.value = value;
  }

  function updateInternalNotes(value: string) {
    internalNotes.value = value;
  }

  function closeConversation() {
    void updateConversationStatus("CLOSED");
  }

  async function sendMessage() {
    if (!activeConversationId.value) {
      return;
    }

    const text = draft.value.trim();
    if (!text) {
      return;
    }

    sendingMessage.value = true;

    try {
      const content = replyTarget.value ? `> ${replyTarget.value.content}\n\n${text}` : text;

      const created = await apiFetch<Message>(`/conversations/${activeConversationId.value}/messages`, {
        method: "POST",
        body: {
          content
        }
      });

      messages.value = mergeMessages(messages.value, [created]);
      updateConversationPreviewFromMessage(created);

      draft.value = "";
      replyTarget.value = null;

      await nextTick();
      scrollToBottom();
      markConversationAsRead(created);
      scheduleStickyDateRefresh();
    } finally {
      sendingMessage.value = false;
    }
  }

  async function updateConversationStatus(statusValue: ConversationStatus) {
    if (!activeConversationId.value) {
      return;
    }

    updatingStatus.value = true;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${activeConversationId.value}/status`, {
        method: "PATCH",
        body: {
          status: statusValue
        }
      });

      upsertConversation(updated);
    } finally {
      updatingStatus.value = false;
    }
  }

  async function updateConversationAssignee(value: string) {
    if (!activeConversationId.value) {
      return;
    }

    updatingAssignee.value = true;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${activeConversationId.value}/assign`, {
        method: "PATCH",
        body: {
          assignedToId: value === UNASSIGNED_VALUE ? null : value
        }
      });

      upsertConversation(updated);
      assigneeModel.value = updated.assignedToId ?? UNASSIGNED_VALUE;
    } finally {
      updatingAssignee.value = false;
    }
  }

  function connectSocket() {
    if (!token.value || socket) {
      return;
    }

    socket = io(config.public.apiBase, {
      transports: ["websocket"],
      auth: {
        token: token.value
      }
    });

    socket.on("conversation.updated", (payload: Conversation) => {
      upsertConversation(payload);
    });

    socket.on("message.created", async (payload: Message) => {
      updateConversationPreviewFromMessage(payload);

      if (payload.conversationId === activeConversationId.value) {
        const shouldStickToBottom = isNearBottom(chatBodyRef.value);

        messages.value = mergeMessages(messages.value, [payload]);
        await nextTick();

        if (payload.direction === "OUTBOUND" || shouldStickToBottom) {
          scrollToBottom();
        }

        if (payload.direction === "OUTBOUND" || shouldStickToBottom) {
          markConversationAsRead(payload);
        }

        scheduleStickyDateRefresh();
        return;
      }

      if (!conversations.value.find((entry) => entry.id === payload.conversationId)) {
        await loadConversations();
      }
    });

    socket.on("message.updated", (payload: Partial<Message> & { id: string }) => {
      const index = messages.value.findIndex((entry) => entry.id === payload.id);
      if (index >= 0) {
        messages.value[index] = {
          ...messages.value[index],
          ...payload
        } as Message;
      }

      for (const conversationEntry of conversations.value) {
        if (conversationEntry.lastMessage?.id === payload.id && payload.status) {
          conversationEntry.lastMessage.status = payload.status;
          break;
        }
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

  function logout() {
    disconnectSocket();
    clearSession();
    void navigateTo("/login");
  }

  onMounted(async () => {
    ensureAuthOrRedirect();
    if (!token.value) {
      return;
    }

    loadReadState();

    await Promise.all([loadUsers(), loadConversations()]);
    connectSocket();
  });

  onBeforeUnmount(() => {
    disconnectSocket();
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  });

  return {
    user,
    leftCollapsed,
    rightCollapsed,
    showFilters,
    loadingConversations,
    loadingUsers,
    loadingMessages,
    loadingOlderMessages,
    sendingMessage,
    updatingStatus,
    updatingAssignee,
    stickyDateLabel,
    showStickyDate,
    draft,
    search,
    channel,
    status,
    replyTarget,
    assigneeModel,
    channelFilterItems,
    statusFilterItems,
    statusActionItems,
    assigneeItems,
    activeConversation,
    activeConversationId,
    activeConversationLabel,
    isGroupConversation,
    internalNotes,
    filteredConversations,
    unreadConversationIds,
    messageRenderItems,
    onChatBodyMounted,
    onChatScroll,
    setReplyTarget,
    clearReplyTarget,
    updateDraft,
    updateSearch,
    updateChannel,
    updateStatus,
    updateShowFilters,
    updateLeftCollapsed,
    updateRightCollapsed,
    updateAssigneeModel,
    updateInternalNotes,
    selectConversation,
    closeConversation,
    sendMessage,
    updateConversationStatus,
    updateConversationAssignee,
    logout
  };
}
