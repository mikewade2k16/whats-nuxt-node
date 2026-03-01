<script setup lang="ts">
import {
  UAvatar,
  UBadge,
  UButton,
  UDashboardSidebar,
  UDashboardSidebarCollapse,
  UFormField,
  UInput,
  USelect
} from "#components";
import { computed } from "vue";
import type { Conversation, MessageType } from "~/types";
import type { InboxSelectOption } from "./types";

const props = defineProps<{
  collapsed: boolean;
  showFilters: boolean;
  loadingConversations: boolean;
  loadingWhatsAppStatus: boolean;
  whatsappBannerMessage: string;
  isWhatsAppConnected: boolean;
  currentUserName: string | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  unreadConversationIds: string[];
  mentionConversationIds: string[];
  mentionConversationCounts: Record<string, number>;
  search: string;
  channel: string;
  status: string;
  channelFilterItems: InboxSelectOption[];
  statusFilterItems: InboxSelectOption[];
}>();

const emit = defineEmits<{
  (event: "update:collapsed", value: boolean): void;
  (event: "update:showFilters", value: boolean): void;
  (event: "update:search", value: string): void;
  (event: "update:channel", value: string): void;
  (event: "update:status", value: string): void;
  (event: "selectConversation", conversationId: string): void;
  (event: "open-sandbox-test"): void;
  (event: "logout"): void;
}>();

const collapsedModel = computed({
  get: () => props.collapsed,
  set: (value: boolean) => emit("update:collapsed", value)
});

const showFiltersModel = computed({
  get: () => props.showFilters,
  set: (value: boolean) => emit("update:showFilters", value)
});

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit("update:search", value)
});

const channelModel = computed({
  get: () => props.channel,
  set: (value: string) => emit("update:channel", value)
});

const statusModel = computed({
  get: () => props.status,
  set: (value: string) => emit("update:status", value)
});

const unreadSet = computed(() => new Set(props.unreadConversationIds));
const mentionSet = computed(() => new Set(props.mentionConversationIds));
const mentionCountMap = computed(() => props.mentionConversationCounts ?? {});
const MEDIA_PLACEHOLDER_VALUES = new Set(["[imagem]", "[audio]", "[video]", "[documento]", "."]);

function normalizeNameForComparison(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .trim()
      .toLowerCase() ?? ""
  );
}

function isWeakDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return true;
  }

  if (
    normalized.endsWith("@s.whatsapp.net") ||
    normalized.endsWith("@g.us") ||
    normalized.endsWith("@lid")
  ) {
    return true;
  }

  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7;
}

function isLikelyOperatorName(value: string | null | undefined) {
  const normalized = normalizeNameForComparison(value);
  if (!normalized) {
    return false;
  }

  const currentUser = normalizeNameForComparison(props.currentUserName);
  if (currentUser && normalized === currentUser) {
    return true;
  }

  return ["voce", "você", "atendente", "agent", "admin demo", "operador"].includes(normalized);
}

function isGroupConversation(conversationEntry: Conversation) {
  return conversationEntry.externalId.endsWith("@g.us");
}

function extractExternalPhone(conversationEntry: Conversation) {
  const fromContact = conversationEntry.contactPhone?.trim() ?? "";
  if (fromContact) {
    return fromContact;
  }

  const digits = conversationEntry.externalId.replace(/\D/g, "");
  return digits || conversationEntry.externalId;
}

function buildFallbackGroupName(conversationEntry: Conversation) {
  const digits = conversationEntry.externalId.replace(/\D/g, "");
  if (!digits) {
    return "Grupo";
  }

  return `Grupo ${digits.slice(-4)}`;
}

function getConversationName(conversationEntry: Conversation) {
  const contactName = conversationEntry.contactName?.trim() ?? "";
  if (isGroupConversation(conversationEntry)) {
    if (contactName && !isWeakDisplayName(contactName)) {
      return contactName;
    }

    return buildFallbackGroupName(conversationEntry);
  }

  if (contactName && !isLikelyOperatorName(contactName)) {
    return contactName;
  }

  return extractExternalPhone(conversationEntry);
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

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
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

function isConversationUnread(conversationId: string) {
  return unreadSet.value.has(conversationId);
}

function hasMentionAlert(conversationId: string) {
  return mentionSet.value.has(conversationId);
}

function getMentionCount(conversationId: string) {
  const rawCount = mentionCountMap.value?.[conversationId] ?? 0;
  if (!Number.isFinite(rawCount)) {
    return 0;
  }

  return Math.max(0, Math.trunc(rawCount));
}

function getMessageTypeLabel(type: MessageType | null | undefined) {
  if (type === "IMAGE") {
    return "Foto";
  }

  if (type === "AUDIO") {
    return "Audio";
  }

  if (type === "VIDEO") {
    return "Video";
  }

  if (type === "DOCUMENT") {
    return "Documento";
  }

  return "Mensagem";
}

function isMediaPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return MEDIA_PLACEHOLDER_VALUES.has(normalized);
}

function getConversationPreview(conversationEntry: Conversation) {
  const lastMessage = conversationEntry.lastMessage;
  if (!lastMessage) {
    return "Sem mensagens ainda.";
  }

  const type = lastMessage.messageType ?? "TEXT";
  const content = lastMessage.content?.trim() ?? "";

  if (type === "TEXT") {
    return content || "Sem mensagens ainda.";
  }

  if (content && !isMediaPlaceholder(content)) {
    return content;
  }

  return `[${getMessageTypeLabel(type)}]`;
}
</script>

<template>
  <UDashboardSidebar
    id="omni-inbox-left"
    v-model:collapsed="collapsedModel"
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
        <h1 v-if="!collapsedModel" class="chat-page__title">Conversas</h1>
        <div class="chat-page__header-actions">
          <UButton
            v-if="!collapsedModel"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="showFiltersModel = !showFiltersModel"
          >
            Filtros
          </UButton>
          <UButton v-if="!collapsedModel" to="/docs" size="sm" color="neutral" variant="ghost">
            Docs
          </UButton>
          <UButton v-if="!collapsedModel" size="sm" color="neutral" variant="ghost" @click="emit('open-sandbox-test')">
            Teste
          </UButton>
          <UButton v-if="!collapsedModel" size="sm" color="neutral" variant="outline" @click="emit('logout')">
            Sair
          </UButton>
          <UDashboardSidebarCollapse side="left" color="neutral" variant="ghost" />
        </div>
      </div>
    </template>

    <div class="chat-page__sidebar-content">
      <div
        v-if="!collapsedModel && !loadingWhatsAppStatus && whatsappBannerMessage"
        class="chat-page__channel-banner"
        :class="{
          'chat-page__channel-banner--connected': isWhatsAppConnected,
          'chat-page__channel-banner--disconnected': !isWhatsAppConnected
        }"
      >
        {{ whatsappBannerMessage }}
      </div>

      <div v-if="showFiltersModel && !collapsedModel" class="chat-page__filters">
        <UFormField label="Busca" name="search">
          <UInput v-model="searchModel" icon="i-lucide-search" placeholder="Buscar por nome, telefone ou mensagem" />
        </UFormField>

        <div class="chat-page__filters-grid">
          <UFormField label="Canal" name="channel">
            <USelect v-model="channelModel" :items="channelFilterItems" value-key="value" />
          </UFormField>

          <UFormField label="Status" name="status">
            <USelect v-model="statusModel" :items="statusFilterItems" value-key="value" />
          </UFormField>
        </div>
      </div>

      <div class="chat-page__panel-body">
        <div v-if="loadingConversations" class="chat-page__empty">Carregando conversas...</div>

        <template v-else>
          <button
            v-for="conversationEntry in conversations"
            :key="conversationEntry.id"
            type="button"
            class="conversation-card"
            :class="{ 'conversation-card--active': conversationEntry.id === activeConversationId }"
            @click="emit('selectConversation', conversationEntry.id)"
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
                  <UBadge v-if="isConversationUnread(conversationEntry.id)" color="warning" variant="soft" size="sm">
                    Novo
                  </UBadge>
                  <UBadge v-if="hasMentionAlert(conversationEntry.id)" color="error" variant="soft" size="sm">
                    @{{ getMentionCount(conversationEntry.id) || 1 }} Mencao
                  </UBadge>
                </div>
              </div>

              <time class="conversation-card__time">{{ formatTime(conversationEntry.lastMessageAt) }}</time>
            </div>

            <p class="conversation-card__preview">{{ getConversationPreview(conversationEntry) }}</p>
          </button>

          <div v-if="!conversations.length" class="chat-page__empty">Nenhuma conversa encontrada.</div>
        </template>
      </div>
    </div>
  </UDashboardSidebar>
</template>

<style scoped>
.chat-page__sidebar {
  min-height: 0;
}

.chat-page__sidebar-body,
.chat-page__sidebar-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  min-width: 0;
}

.chat-page__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.chat-page__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.chat-page__header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-page__filters {
  display: grid;
  gap: 0.75rem;
  padding: 0 0 0.75rem;
}

.chat-page__channel-banner {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  padding: 0.55rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.4;
  margin: 0.5rem 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-page__channel-banner--connected {
  color: rgb(var(--success));
  background: rgb(var(--success) / 0.14);
  border-color: rgb(var(--success) / 0.35);
}

.chat-page__channel-banner--disconnected {
  color: rgb(var(--warning));
  background: rgb(var(--warning) / 0.14);
  border-color: rgb(var(--warning) / 0.35);
}

.chat-page__filters-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.chat-page__panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 0.5rem;
  padding: 0.5rem;
}

.chat-page__empty {
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

.conversation-card__tags {
  display: flex;
  align-items: center;
  gap: 0.35rem;
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

@media (max-width: 1024px) {
  .chat-page__filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
