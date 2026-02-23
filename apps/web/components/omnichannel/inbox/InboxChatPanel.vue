<script setup lang="ts">
import {
  UAvatar,
  UBadge,
  UButton,
  UCard,
  UDashboardPanel,
  UDashboardSidebarCollapse,
  UDashboardSidebarToggle,
  UFormField,
  UTextarea
} from "#components";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Conversation, Message } from "~/types";
import type { InboxRenderItem } from "./types";

const props = defineProps<{
  activeConversation: Conversation | null;
  activeConversationLabel: string | null;
  userRole: "ADMIN" | "AGENT" | null | undefined;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  messageRenderItems: InboxRenderItem[];
  showStickyDate: boolean;
  stickyDateLabel: string;
  isGroupConversation: boolean;
  draft: string;
  sendingMessage: boolean;
  replyTarget: Message | null;
}>();

const emit = defineEmits<{
  (event: "body-mounted", element: HTMLElement | null): void;
  (event: "chat-scroll", payload: Event): void;
  (event: "send"): void;
  (event: "close-conversation"): void;
  (event: "set-reply", messageEntry: Message): void;
  (event: "clear-reply"): void;
  (event: "update:draft", value: string): void;
}>();

const chatBodyRef = ref<HTMLElement | null>(null);

const draftModel = computed({
  get: () => props.draft,
  set: (value: string) => emit("update:draft", value)
});

onMounted(() => {
  emit("body-mounted", chatBodyRef.value);
});

onBeforeUnmount(() => {
  emit("body-mounted", null);
});

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

function messageRowId(messageId: string) {
  return `chat-message-${messageId}`;
}
</script>

<template>
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
          <UButton v-if="userRole === 'ADMIN'" size="sm" color="primary" variant="outline" to="/admin">
            Conectar WhatsApp
          </UButton>
          <UButton size="sm" color="neutral" variant="ghost" :disabled="!activeConversation" @click="emit('close-conversation')">
            Encerrar
          </UButton>
        </div>
      </div>
    </template>

    <template #body>
      <div ref="chatBodyRef" class="chat-page__chat-body" @scroll="emit('chat-scroll', $event)">
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
                    <UButton size="xs" color="neutral" variant="ghost" @click="emit('set-reply', item.message)">
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
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="emit('clear-reply')" />
        </div>

        <UFormField label="Mensagem" name="draft">
          <UTextarea
            v-model="draftModel"
            :disabled="!activeConversation"
            :rows="2"
            autoresize
            placeholder="Escreva uma mensagem"
            @keydown.enter.exact.prevent="emit('send')"
          />
        </UFormField>

        <div class="chat-page__composer-actions">
          <UButton size="sm" color="primary" :disabled="!activeConversation" :loading="sendingMessage" @click="emit('send')">
            Enviar
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.chat-page__chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.chat-page__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
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

.chat-page__contact-name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.chat-page__contact-tags,
.chat-page__chat-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-page__chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  padding: 0.6rem 0.1rem 0.8rem;
}

.chat-page__empty,
.chat-page__empty-label,
.chat-page__older-loading {
  color: rgb(var(--muted));
  font-size: 0.85rem;
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
</style>
