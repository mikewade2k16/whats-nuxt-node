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
import type { Conversation } from "~/types";
import type { InboxSelectOption } from "./types";

const props = defineProps<{
  collapsed: boolean;
  showFilters: boolean;
  loadingConversations: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  unreadConversationIds: string[];
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
          <UButton v-if="!collapsedModel" size="sm" color="neutral" variant="outline" @click="emit('logout')">
            Sair
          </UButton>
          <UDashboardSidebarCollapse side="left" color="neutral" variant="ghost" />
        </div>
      </div>
    </template>

    <div class="chat-page__sidebar-content">
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
                </div>
              </div>

              <time class="conversation-card__time">{{ formatTime(conversationEntry.lastMessageAt) }}</time>
            </div>

            <p class="conversation-card__preview">{{ conversationEntry.lastMessage?.content || "Sem mensagens ainda." }}</p>
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
  padding: 0.5rem 0 0.75rem;
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
  padding: 0.5rem 0 0.25rem;
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
