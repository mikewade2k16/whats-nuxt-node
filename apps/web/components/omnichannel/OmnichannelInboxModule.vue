<script setup lang="ts">
import {
  UAvatar,
  UBadge,
  UButton,
  UCard,
  UDashboardGroup,
  UDashboardPanel,
  UDashboardSidebar,
  UDashboardSidebarCollapse,
  UDashboardSidebarToggle,
  UFormField,
  UInput,
  USelect,
  UTextarea
} from "#components";
import { io, type Socket } from "socket.io-client";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
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

type RenderItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; message: Message; dateKey: string; dateLabel: string };

const UNASSIGNED_VALUE = "__unassigned__";
const MESSAGE_PAGE_SIZE = 80;

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

const channelFilterItems = [
  { label: "Todos canais", value: "all" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Instagram", value: "INSTAGRAM" }
];

const statusFilterItems = [
  { label: "Todos status", value: "all" },
  { label: "Abertos", value: "OPEN" },
  { label: "Pendentes", value: "PENDING" },
  { label: "Encerrados", value: "CLOSED" }
];

const statusActionItems = [
  { label: "Aberto", value: "OPEN" },
  { label: "Pendente", value: "PENDING" },
  { label: "Encerrado", value: "CLOSED" }
];

const assigneeItems = computed(() => {
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

const messageRenderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
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

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getConversationName(conversationEntry: Conversation) {
  return conversationEntry.contactName || conversationEntry.contactPhone || conversationEntry.externalId;
}

function getInitials(value: string | null | undefined) {
  if (!value) {
    return "?";
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function getChannelLabel(channelValue: Conversation["channel"]) {
  if (channelValue === "WHATSAPP") {
    return "WhatsApp";
  }

  if (channelValue === "INSTAGRAM") {
    return "Instagram";
  }

  return channelValue;
}

function getStatusLabel(statusValue: Conversation["status"]) {
  if (statusValue === "OPEN") {
    return "Aberto";
  }

  if (statusValue === "PENDING") {
    return "Pendente";
  }

  return "Encerrado";
}

function getStatusColor(statusValue: Conversation["status"]) {
  if (statusValue === "OPEN") {
    return "success";
  }

  if (statusValue === "PENDING") {
    return "warning";
  }

  return "neutral";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMessageHtml(value: string) {
  return escapeHtml(value)
    .replace(/\n/g, "<br>")
    .replace(/(^|[\s(])(@[0-9A-Za-z._-]{3,40})(?=\s|$|[),.!?])/g, "$1<span class=\"chat-message__mention\">$2</span>");
}

function resolveMessageAuthor(messageEntry: Message) {
  if (messageEntry.direction === "OUTBOUND") {
    return messageEntry.senderName?.trim() || "Voce";
  }

  return messageEntry.senderName?.trim() || "Participante";
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

  while (hasMoreMessages.value && messages.value.length > 0 && Number(new Date(messages.value[0].createdAt)) > readAt && guard < 6) {
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

function setReplyTarget(messageEntry: Message) {
  replyTarget.value = messageEntry;
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
</script>

<template>
  <div class="chat-page">
    <UDashboardGroup storage="local" storage-key="omni-inbox-layout-v3" class="chat-page__dashboard">
      <UDashboardSidebar
        id="omni-inbox-left"
        v-model:collapsed="leftCollapsed"
        side="left"
        resizable
        collapsible
        :min-size="18"
        :default-size="24"
        :max-size="36"
        :collapsed-size="0"
        :ui="{
          root: 'chat-page__sidebar chat-page__sidebar--left',
          header: 'chat-page__panel-header chat-page__panel-header--sidebar',
          body: 'chat-page__sidebar-body'
        }"
      >
        <template #header>
          <div class="chat-page__header-row">
            <h1 v-if="!leftCollapsed" class="chat-page__title">Conversas</h1>
            <div class="chat-page__header-actions">
              <UButton
                v-if="!leftCollapsed"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="showFilters = !showFilters"
              >
                Filtros
              </UButton>
              <UButton v-if="!leftCollapsed" size="sm" color="neutral" variant="outline" @click="logout">
                Sair
              </UButton>
              <UDashboardSidebarCollapse side="left" color="neutral" variant="ghost" />
            </div>
          </div>
        </template>

        <div class="chat-page__sidebar-content">
          <div v-if="showFilters && !leftCollapsed" class="chat-page__filters">
            <UFormField label="Busca" name="search">
              <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar por nome, telefone ou mensagem" />
            </UFormField>

            <div class="chat-page__filters-grid">
              <UFormField label="Canal" name="channel">
                <USelect v-model="channel" :items="channelFilterItems" value-key="value" />
              </UFormField>

              <UFormField label="Status" name="status">
                <USelect v-model="status" :items="statusFilterItems" value-key="value" />
              </UFormField>
            </div>
          </div>

          <div class="chat-page__panel-body">
            <div v-if="loadingConversations" class="chat-page__empty">Carregando conversas...</div>

            <template v-else>
              <button
                v-for="conversationEntry in filteredConversations"
                :key="conversationEntry.id"
                type="button"
                class="conversation-card"
                :class="{ 'conversation-card--active': conversationEntry.id === activeConversationId }"
                @click="selectConversation(conversationEntry.id)"
              >
                <div class="conversation-card__top">
                  <UAvatar
                    :src="conversationEntry.contactAvatarUrl || undefined"
                    :alt="getConversationName(conversationEntry)"
                    :text="getInitials(getConversationName(conversationEntry))"
                    class="conversation-card__avatar"
                  />

                  <div class="conversation-card__content">
                    <p class="conversation-card__name">{{ getConversationName(conversationEntry) }}</p>

                    <div class="conversation-card__tags">
                      <UBadge color="neutral" variant="soft" size="sm">
                        {{ getChannelLabel(conversationEntry.channel) }}
                      </UBadge>
                      <UBadge :color="getStatusColor(conversationEntry.status)" variant="soft" size="sm">
                        {{ getStatusLabel(conversationEntry.status) }}
                      </UBadge>
                      <UBadge
                        v-if="isConversationUnread(conversationEntry)"
                        color="warning"
                        variant="soft"
                        size="sm"
                      >
                        Novo
                      </UBadge>
                    </div>
                  </div>

                  <time class="conversation-card__time">{{ formatTime(conversationEntry.lastMessageAt) }}</time>
                </div>

                <p class="conversation-card__preview">{{ conversationEntry.lastMessage?.content || "Sem mensagens ainda." }}</p>
              </button>

              <div v-if="!filteredConversations.length" class="chat-page__empty">Nenhuma conversa encontrada.</div>
            </template>
          </div>
        </div>
      </UDashboardSidebar>

      <UDashboardPanel
        id="omni-inbox-center"
        :ui="{
          root: 'chat-page__chat'
        }"
      >
        <template #header>
          <div class="chat-page__panel-header chat-page__chat-header">
            <div class="chat-page__chat-headline">
              <UDashboardSidebarToggle side="left" color="neutral" variant="ghost" class="lg:hidden" />
              <UDashboardSidebarCollapse side="left" color="neutral" variant="ghost" class="hidden lg:inline-flex" />

              <template v-if="activeConversation">
                <UAvatar
                  :src="activeConversation.contactAvatarUrl || undefined"
                  :alt="activeConversationLabel || activeConversation.externalId"
                  :text="getInitials(activeConversationLabel || activeConversation.externalId)"
                  class="chat-page__contact-avatar"
                />
                <div class="chat-page__contact-meta">
                  <p class="chat-page__contact-name">{{ activeConversationLabel }}</p>
                  <div class="chat-page__contact-tags">
                    <UBadge color="neutral" variant="soft" size="sm">
                      {{ getChannelLabel(activeConversation.channel) }}
                    </UBadge>
                    <UBadge :color="getStatusColor(activeConversation.status)" variant="soft" size="sm">
                      {{ getStatusLabel(activeConversation.status) }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <p v-else class="chat-page__empty-label">Selecione uma conversa na lista.</p>
            </div>

            <div class="chat-page__chat-actions">
              <UDashboardSidebarToggle side="right" color="neutral" variant="ghost" class="lg:hidden" />
              <UDashboardSidebarCollapse side="right" color="neutral" variant="ghost" class="hidden lg:inline-flex" />
              <UButton v-if="user?.role === 'ADMIN'" size="sm" color="primary" variant="outline" to="/admin">
                Conectar WhatsApp
              </UButton>
              <UButton size="sm" color="neutral" variant="ghost" :disabled="!activeConversation" @click="updateConversationStatus('CLOSED')">
                Encerrar
              </UButton>
            </div>
          </div>
        </template>

        <template #body>
          <div ref="chatBodyRef" class="chat-page__chat-body" @scroll="onChatScroll">
            <div v-if="loadingMessages" class="chat-page__empty">Carregando mensagens...</div>

            <div v-else-if="!activeConversation" class="chat-page__empty">Selecione uma conversa para iniciar o atendimento.</div>

            <template v-else>
              <div v-if="showStickyDate && stickyDateLabel" class="chat-page__sticky-date">{{ stickyDateLabel }}</div>

              <div v-if="loadingOlderMessages" class="chat-page__older-loading">Carregando historico...</div>

              <div v-for="item in messageRenderItems" :key="item.key">
                <div v-if="item.kind === 'date'" class="chat-date-separator">
                  <span>{{ item.label }}</span>
                </div>

                <div v-else-if="item.kind === 'unread'" id="chat-unread-anchor" class="chat-unread-separator">
                  <span>Nao lidas</span>
                </div>

                <div
                  v-else
                  :id="messageRowId(item.message.id)"
                  class="chat-message-row"
                  :data-date-key="item.dateKey"
                  :data-date-label="item.dateLabel"
                >
                  <div class="chat-message" :class="{ 'chat-message--out': item.message.direction === 'OUTBOUND' }">
                    <UCard class="chat-message__bubble">
                      <div v-if="isGroupConversation && item.message.direction === 'INBOUND'" class="chat-message__author-row">
                        <UAvatar
                          :src="item.message.senderAvatarUrl || undefined"
                          :alt="resolveMessageAuthor(item.message)"
                          :text="getInitials(resolveMessageAuthor(item.message))"
                          size="2xs"
                        />
                        <p class="chat-message__author">{{ resolveMessageAuthor(item.message) }}</p>
                      </div>

                      <p class="chat-message__text" v-html="renderMessageHtml(item.message.content)" />

                      <div class="chat-message__meta">
                        <time>{{ formatTime(item.message.createdAt) }}</time>
                        <span>{{ item.message.status }}</span>
                        <UButton size="xs" color="neutral" variant="ghost" @click="setReplyTarget(item.message)">
                          Responder
                        </UButton>
                      </div>
                    </UCard>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <template #footer>
          <div class="chat-page__panel-footer">
            <div v-if="replyTarget" class="chat-reply">
              <div>
                <p class="chat-reply__label">
                  Respondendo a {{ replyTarget.direction === "OUTBOUND" ? "voce" : (activeConversationLabel || "contato") }}
                </p>
                <p class="chat-reply__text">{{ replyTarget.content }}</p>
              </div>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="replyTarget = null" />
            </div>

            <UFormField label="Mensagem" name="draft">
              <UTextarea
                v-model="draft"
                :disabled="!activeConversation"
                :rows="2"
                autoresize
                placeholder="Escreva uma mensagem"
                @keydown.enter.exact.prevent="sendMessage"
              />
            </UFormField>

            <div class="chat-page__composer-actions">
              <UButton size="sm" color="primary" :disabled="!activeConversation" :loading="sendingMessage" @click="sendMessage">
                Enviar
              </UButton>
            </div>
          </div>
        </template>
      </UDashboardPanel>

      <UDashboardSidebar
        id="omni-inbox-right"
        v-model:collapsed="rightCollapsed"
        side="right"
        resizable
        collapsible
        :min-size="16"
        :default-size="24"
        :max-size="34"
        :collapsed-size="0"
        :ui="{
          root: 'chat-page__sidebar chat-page__sidebar--right',
          header: 'chat-page__panel-header chat-page__panel-header--sidebar',
          body: 'chat-page__sidebar-body'
        }"
      >
        <template #header>
          <div class="chat-page__details-head">
            <h2 v-if="!rightCollapsed" class="chat-page__details-title">Detalhes</h2>
            <UDashboardSidebarCollapse side="right" color="neutral" variant="ghost" />
          </div>
        </template>

        <div class="chat-page__sidebar-content chat-page__details-content">
          <div v-if="activeConversation" class="chat-page__panel-body chat-page__details-body">
            <UCard>
              <template #header>
                <h3 class="details-card__title">Contato</h3>
              </template>

              <div class="details-card__contact">
                <UAvatar
                  :src="activeConversation.contactAvatarUrl || undefined"
                  :alt="activeConversationLabel || activeConversation.externalId"
                  :text="getInitials(activeConversationLabel || activeConversation.externalId)"
                  class="details-card__avatar"
                />
                <p class="details-card__text">{{ activeConversationLabel }}</p>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="details-card__title">Canal e status</h3>
              </template>

              <div class="details-card__tags">
                <UBadge color="neutral" variant="soft">{{ getChannelLabel(activeConversation.channel) }}</UBadge>
                <UBadge :color="getStatusColor(activeConversation.status)" variant="soft">
                  {{ getStatusLabel(activeConversation.status) }}
                </UBadge>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="details-card__title">Acoes</h3>
              </template>

              <UFormField label="Status" name="conversationStatus">
                <USelect
                  :model-value="activeConversation.status"
                  :items="statusActionItems"
                  value-key="value"
                  :disabled="updatingStatus"
                  @update:model-value="value => value && updateConversationStatus(value)"
                />
              </UFormField>

              <UFormField label="Responsavel" name="conversationAssignee">
                <USelect
                  v-model="assigneeModel"
                  :items="assigneeItems"
                  value-key="value"
                  :disabled="updatingAssignee || loadingUsers"
                  @update:model-value="value => value && updateConversationAssignee(value)"
                />
              </UFormField>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="details-card__title">Notas internas</h3>
              </template>

              <UTextarea v-model="internalNotes" :rows="4" autoresize placeholder="Adicione observacoes sobre esse contato" />
            </UCard>
          </div>

          <div v-else class="chat-page__empty">Selecione uma conversa para visualizar os detalhes.</div>
        </div>
      </UDashboardSidebar>
    </UDashboardGroup>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100dvh;
  overflow: hidden;
}

.chat-page__dashboard {
  height: 100%;
}

.chat-page__sidebar {
  min-height: 0;
}

.chat-page__sidebar-body,
.chat-page__sidebar-content,
.chat-page__chat,
.chat-page__details-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.chat-page__header-row,
.chat-page__chat-header,
.chat-page__details-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.chat-page__title,
.chat-page__details-title,
.chat-page__contact-name,
.details-card__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.chat-page__header-actions,
.chat-page__chat-actions,
.chat-page__contact-tags,
.conversation-card__tags,
.details-card__tags {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-page__filters {
  display: grid;
  gap: 0.75rem;
  padding: 0.5rem 0 0.75rem;
}

.chat-page__filters-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.chat-page__panel-body,
.chat-page__chat-body,
.chat-page__details-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.chat-page__panel-body {
  display: grid;
  align-content: start;
  gap: 0.5rem;
  padding: 0.5rem 0 0.25rem;
}

.chat-page__chat-headline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.chat-page__contact-avatar {
  flex-shrink: 0;
}

.chat-page__contact-meta {
  min-width: 0;
}

.chat-page__empty,
.chat-page__empty-label,
.chat-page__older-loading {
  color: rgb(var(--muted));
  font-size: 0.85rem;
}

.conversation-card {
  width: 100%;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  color: rgb(var(--text));
  text-align: left;
  padding: 0.65rem;
  display: grid;
  gap: 0.45rem;
  cursor: pointer;
}

.conversation-card--active {
  border-color: rgb(var(--primary));
  box-shadow: 0 0 0 1px rgb(var(--primary) / 0.35);
}

.conversation-card__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.55rem;
  align-items: center;
}

.conversation-card__content {
  min-width: 0;
}

.conversation-card__name {
  margin: 0;
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-card__time {
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

.conversation-card__preview {
  margin: 0;
  font-size: 0.82rem;
  color: rgb(var(--muted));
  line-height: 1.3;
  max-height: 2.6em;
  overflow: hidden;
}

.chat-page__chat-body {
  position: relative;
  padding: 0.6rem 0.1rem 0.8rem;
}

.chat-page__sticky-date {
  position: sticky;
  top: 0.35rem;
  z-index: 5;
  width: fit-content;
  margin: 0 auto 0.45rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
}

.chat-date-separator,
.chat-unread-separator {
  display: flex;
  justify-content: center;
  margin: 0.55rem 0;
}

.chat-date-separator > span,
.chat-unread-separator > span {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  background: rgb(var(--surface));
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  padding: 0.16rem 0.58rem;
}

.chat-unread-separator > span {
  color: rgb(var(--primary));
  border-color: rgb(var(--primary) / 0.45);
}

.chat-message {
  display: flex;
  margin-bottom: 0.55rem;
}

.chat-message--out {
  justify-content: flex-end;
}

.chat-message__bubble {
  max-width: min(720px, 92%);
}

.chat-message__author-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}

.chat-message__author {
  margin: 0;
  font-size: 0.76rem;
  color: rgb(var(--muted));
  font-weight: 600;
}

.chat-message__text {
  margin: 0;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
}

.chat-message__meta {
  margin-top: 0.48rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

:deep(.chat-message__mention) {
  color: rgb(var(--primary));
  font-weight: 700;
  background: rgb(var(--primary) / 0.12);
  border-radius: 0.3rem;
  padding: 0 0.18rem;
}

.chat-page__panel-footer {
  display: grid;
  gap: 0.55rem;
}

.chat-page__composer-actions {
  display: flex;
  justify-content: flex-end;
}

.chat-reply {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  border-left: 3px solid rgb(var(--primary));
  background: rgb(var(--surface-2));
  border-radius: var(--radius-xs);
  padding: 0.35rem 0.5rem;
}

.chat-reply__label,
.chat-reply__text {
  margin: 0;
}

.chat-reply__label {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  font-weight: 600;
}

.chat-reply__text {
  font-size: 0.78rem;
  line-height: 1.35;
  max-height: 2.5em;
  overflow: hidden;
}

.chat-page__details-body {
  display: grid;
  align-content: start;
  gap: 0.6rem;
}

.details-card__contact {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.details-card__text {
  margin: 0;
  font-weight: 500;
}

@media (max-width: 1024px) {
  .chat-page__filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
