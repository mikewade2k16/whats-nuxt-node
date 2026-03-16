<script setup lang="ts">
import {
  UAvatar,
  UButton,
  UCard,
  UIcon
} from "#components";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import InboxAudioMessagePlayer from "./InboxAudioMessagePlayer.vue";
import InboxMessageContactCard from "./InboxMessageContactCard.vue";
import InboxMessageActionMenu from "./InboxMessageActionMenu.vue";

const {
  item,
  isGroupConversation,
  showOutboundOperatorLabel,
  canManageConversation,
  selectionMode,
  isMessageSelected,
  onSetReply,
  onStartMessageSelection,
  onToggleMessageSelection,
  onDeleteMessageForMe,
  onDeleteMessageForAll,
  onForwardMessage,
  messageRowId,
  resolveMessageAvatarUrl,
  resolveMessageAuthor,
  getInitials,
  getReplyPreview,
  hasReplyJumpTarget,
  onReplyPreviewClick,
  getReplyAuthorLabel,
  shouldShowReplyTypeMeta,
  getReplyTypeIcon,
  getMediaTypeLabel,
  getReplyPreviewText,
  hasUnsupportedNotice,
  getUnsupportedLabel,
  buildUnsupportedOpenUrl,
  hasImagePreview,
  isImageFailed,
  getMessageMediaUrl,
  getMessageAudioPreviewUrl,
  getMessageImagePreviewUrl,
  isImagePreviewLoading,
  isAudioPreviewLoading,
  requestImagePreview,
  requestAudioPreview,
  markImageFailed,
  isMediaActionLoading,
  openMessageMedia,
  downloadMessageMedia,
  hasVideoPreview,
  hasAudioPreview,
  isVoiceNoteMessage,
  isAudioFileMessage,
  resolveAudioAvatarUrl,
  hasDocumentPreview,
  resolveMessageFileName,
  hasPendingMediaPreview,
  getPendingMediaLabel,
  getMessageContactCard,
  onOpenMessageContact,
  onSaveMessageContact,
  getMessageLinkPreview,
  shouldRenderMessageText,
  renderMessageHtml,
  getRenderedMessageText,
  onMessageTextClick,
  getReactionBadges,
  buildReactionMenuItems,
  toggleReactionBadge,
  formatTime,
  isMentionAlertMessage,
  resolveOutboundOperatorLabel
} = defineProps([
  "item",
  "isGroupConversation",
  "showOutboundOperatorLabel",
  "canManageConversation",
  "selectionMode",
  "isMessageSelected",
  "onSetReply",
  "onStartMessageSelection",
  "onToggleMessageSelection",
  "onDeleteMessageForMe",
  "onDeleteMessageForAll",
  "onForwardMessage",
  "messageRowId",
  "resolveMessageAvatarUrl",
  "resolveMessageAuthor",
  "getInitials",
  "getReplyPreview",
  "hasReplyJumpTarget",
  "onReplyPreviewClick",
  "getReplyAuthorLabel",
  "shouldShowReplyTypeMeta",
  "getReplyTypeIcon",
  "getMediaTypeLabel",
  "getReplyPreviewText",
  "hasUnsupportedNotice",
  "getUnsupportedLabel",
  "buildUnsupportedOpenUrl",
  "hasImagePreview",
  "isImageFailed",
  "getMessageMediaUrl",
  "getMessageAudioPreviewUrl",
  "getMessageImagePreviewUrl",
  "isImagePreviewLoading",
  "isAudioPreviewLoading",
  "requestImagePreview",
  "requestAudioPreview",
  "markImageFailed",
  "isMediaActionLoading",
  "openMessageMedia",
  "downloadMessageMedia",
  "hasVideoPreview",
  "hasAudioPreview",
  "isVoiceNoteMessage",
  "isAudioFileMessage",
  "resolveAudioAvatarUrl",
  "hasDocumentPreview",
  "resolveMessageFileName",
  "hasPendingMediaPreview",
  "getPendingMediaLabel",
  "getMessageContactCard",
  "onOpenMessageContact",
  "onSaveMessageContact",
  "getMessageLinkPreview",
  "shouldRenderMessageText",
  "renderMessageHtml",
  "getRenderedMessageText",
  "onMessageTextClick",
  "getReactionBadges",
  "buildReactionMenuItems",
  "toggleReactionBadge",
  "formatTime",
  "isMentionAlertMessage",
  "resolveOutboundOperatorLabel"
]);

const imagePreviewAnchorRef = ref<HTMLElement | null>(null);
const imagePreviewDecodedByMessageId = ref<Record<string, true>>({});
let imagePreviewObserver: IntersectionObserver | null = null;

const imagePreviewSrc = computed(() => getMessageImagePreviewUrl(item.message));
const audioPreviewSrc = computed(() => getMessageAudioPreviewUrl(item.message));
const isImagePreviewDecoded = computed(() => Boolean(imagePreviewDecodedByMessageId.value[item.message.id]));

function setImagePreviewDecoded(messageId: string, decoded: boolean) {
  const isAlreadyDecoded = Boolean(imagePreviewDecodedByMessageId.value[messageId]);

  if (decoded) {
    if (isAlreadyDecoded) {
      return;
    }

    imagePreviewDecodedByMessageId.value = {
      ...imagePreviewDecodedByMessageId.value,
      [messageId]: true
    };
    return;
  }

  if (!isAlreadyDecoded) {
    return;
  }

  const next = { ...imagePreviewDecodedByMessageId.value };
  delete next[messageId];
  imagePreviewDecodedByMessageId.value = next;
}

function disconnectImagePreviewObserver() {
  if (!imagePreviewObserver) {
    return;
  }

  imagePreviewObserver.disconnect();
  imagePreviewObserver = null;
}

function requestImagePreviewIfNeeded() {
  if (!hasImagePreview(item.message)) {
    return;
  }

  if (isImageFailed(item.message.id)) {
    return;
  }

  if (imagePreviewSrc.value || isImagePreviewLoading(item.message.id)) {
    return;
  }

  void requestImagePreview(item.message);
}

function requestAudioPreviewIfNeeded() {
  if (!hasAudioPreview(item.message)) {
    return;
  }

  if (audioPreviewSrc.value || isAudioPreviewLoading(item.message.id)) {
    return;
  }

  void requestAudioPreview(item.message);
}

function connectImagePreviewObserver() {
  disconnectImagePreviewObserver();

  if (!hasImagePreview(item.message)) {
    return;
  }

  const targetElement = imagePreviewAnchorRef.value;
  if (!import.meta.client || !targetElement || typeof IntersectionObserver !== "function") {
    requestImagePreviewIfNeeded();
    return;
  }

  const scrollRoot = targetElement.closest(".chat-page__chat-body");
  const rootElement = scrollRoot instanceof HTMLElement ? scrollRoot : null;

  imagePreviewObserver = new IntersectionObserver((entries) => {
    const shouldLoad = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
    if (!shouldLoad) {
      return;
    }

    requestImagePreviewIfNeeded();
    disconnectImagePreviewObserver();
  }, {
    root: rootElement,
    rootMargin: "320px 0px",
    threshold: 0.01
  });

  imagePreviewObserver.observe(targetElement);
}

function onImagePreviewLoad() {
  setImagePreviewDecoded(item.message.id, true);
}

function onImagePreviewError() {
  setImagePreviewDecoded(item.message.id, false);
  markImageFailed(item.message.id);
}

watch(
  () => imagePreviewSrc.value,
  (next, previous) => {
    if (next && next !== previous) {
      setImagePreviewDecoded(item.message.id, false);
    }
  }
);

watch(
  () => item.message.mediaUrl,
  () => {
    requestAudioPreviewIfNeeded();
  }
);

onMounted(() => {
  connectImagePreviewObserver();
  requestAudioPreviewIfNeeded();
});

onBeforeUnmount(() => {
  disconnectImagePreviewObserver();
});
</script>

<template>
  <div
    :id="messageRowId(item.message.id)"
    class="chat-message-row"
    :class="{ 'chat-message-row--selected': isMessageSelected(item.message.id) }"
    :data-date-key="item.dateKey"
    :data-date-label="item.dateLabel"
    :data-message-external-id="item.message.externalMessageId || undefined"
  >
    <div class="chat-message" :class="{ 'chat-message--out': item.message.direction === 'OUTBOUND' }">
      <UCard class="chat-message__bubble">
        <div
          v-if="
            (isGroupConversation && (item.message.direction === 'INBOUND' || showOutboundOperatorLabel)) ||
            (!isGroupConversation &&
              (
                item.message.direction === 'INBOUND' ||
                (showOutboundOperatorLabel && item.message.direction === 'OUTBOUND' && resolveOutboundOperatorLabel(item.message))
              )
            )
          "
          class="chat-message__author-row"
        >
          <UAvatar
            :src="resolveMessageAvatarUrl(item.message)"
            :alt="resolveMessageAuthor(item.message)"
            :text="getInitials(resolveMessageAuthor(item.message))"
            size="2xs"
          />
          <p class="chat-message__author">
            {{ item.message.direction === "OUTBOUND" ? resolveOutboundOperatorLabel(item.message) : resolveMessageAuthor(item.message) }}
          </p>
        </div>

        <div
          v-if="getReplyPreview(item.message)"
          class="chat-message__reply"
          :class="{ 'chat-message__reply--clickable': hasReplyJumpTarget(item.message) }"
          :role="hasReplyJumpTarget(item.message) ? 'button' : undefined"
          :tabindex="hasReplyJumpTarget(item.message) ? 0 : undefined"
          @click="onReplyPreviewClick(item.message)"
          @keydown.enter.prevent="onReplyPreviewClick(item.message)"
        >
          <div class="chat-message__reply-content">
            <p class="chat-message__reply-author">{{ getReplyAuthorLabel(item.message) }}</p>
            <div
              v-if="shouldShowReplyTypeMeta(getReplyPreview(item.message)?.messageType)"
              class="chat-message__reply-type-row"
            >
              <UIcon
                :name="getReplyTypeIcon(getReplyPreview(item.message)?.messageType)"
                class="chat-message__reply-icon"
              />
              <span class="chat-message__reply-type">
                {{ getMediaTypeLabel(getReplyPreview(item.message)?.messageType) }}
              </span>
            </div>
            <p v-if="getReplyPreviewText(getReplyPreview(item.message))" class="chat-message__reply-text">
              {{ getReplyPreviewText(getReplyPreview(item.message)) }}
            </p>
          </div>
        </div>

        <div v-if="hasUnsupportedNotice(item.message)" class="chat-message__unsupported">
          <div class="chat-message__unsupported-head">
            <UIcon name="i-lucide-triangle-alert" class="chat-message__unsupported-icon" />
            <div>
              <p class="chat-message__unsupported-title">Conteudo ainda nao suportado</p>
              <p class="chat-message__unsupported-label">{{ getUnsupportedLabel(item.message) }}</p>
            </div>
          </div>
          <div class="chat-message__media-actions">
            <a class="chat-message__media-link" :href="buildUnsupportedOpenUrl()" target="_blank" rel="noopener noreferrer">
              Abrir no WhatsApp
            </a>
          </div>
        </div>

        <div v-if="hasImagePreview(item.message)" class="chat-message__media">
          <div ref="imagePreviewAnchorRef" class="chat-message__media-image-shell" @mouseenter="requestImagePreviewIfNeeded">
            <img
              v-if="!isImageFailed(item.message.id) && imagePreviewSrc"
              :src="imagePreviewSrc"
              alt="Imagem"
              class="chat-message__media-image"
              :class="{ 'chat-message__media-image--progressive': !isImagePreviewDecoded }"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              @load="onImagePreviewLoad"
              @error="onImagePreviewError"
            >
            <div v-else-if="!isImageFailed(item.message.id)" class="chat-message__media-loading">
              <UIcon
                :name="isImagePreviewLoading(item.message.id) ? 'i-lucide-loader-circle' : 'i-lucide-image'"
                class="chat-message__media-fallback-icon"
                :class="{ 'chat-message__media-fallback-icon--spin': isImagePreviewLoading(item.message.id) }"
              />
              <span>
                {{
                  isImagePreviewLoading(item.message.id)
                    ? "Carregando imagem..."
                    : "Preview em baixa resolucao. Carregando ao entrar na tela."
                }}
              </span>
            </div>
            <div v-else class="chat-message__media-fallback">
              <UIcon name="i-lucide-image-off" class="chat-message__media-fallback-icon" />
              <span>Nao foi possivel carregar o preview.</span>
            </div>
          </div>
          <div class="chat-message__media-actions">
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="openMessageMedia(item.message)">
              Abrir
            </button>
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="downloadMessageMedia(item.message)">
              Baixar
            </button>
          </div>
        </div>

        <div v-else-if="hasVideoPreview(item.message)" class="chat-message__media">
          <video :src="getMessageMediaUrl(item.message)" class="chat-message__media-video" controls preload="metadata"></video>
          <div class="chat-message__media-actions">
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="openMessageMedia(item.message)">
              Abrir
            </button>
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="downloadMessageMedia(item.message)">
              Baixar
            </button>
          </div>
        </div>

        <div v-else-if="hasAudioPreview(item.message) && isVoiceNoteMessage(item.message)" class="chat-message__media" @mouseenter="requestAudioPreviewIfNeeded">
          <InboxAudioMessagePlayer
            :src="audioPreviewSrc"
            :duration-seconds="item.message.mediaDurationSeconds ?? null"
            :direction="item.message.direction"
            :avatar-url="resolveAudioAvatarUrl(item.message)"
            :avatar-text="getInitials(resolveMessageAuthor(item.message))"
          />
          <div v-if="!audioPreviewSrc && isAudioPreviewLoading(item.message.id)" class="chat-message__media-loading">
            <UIcon name="i-lucide-loader-circle" class="chat-message__media-fallback-icon chat-message__media-fallback-icon--spin" />
            <span>Carregando audio...</span>
          </div>
        </div>

        <div v-else-if="hasAudioPreview(item.message) && isAudioFileMessage(item.message)" class="chat-message__document" @mouseenter="requestAudioPreviewIfNeeded">
          <div class="chat-message__audio-file-head">
            <UIcon name="i-lucide-file-audio-2" class="chat-message__document-icon" />
            <span class="chat-message__document-name">{{ resolveMessageFileName(item.message) || 'Arquivo de audio' }}</span>
          </div>
          <InboxAudioMessagePlayer
            :src="audioPreviewSrc"
            :duration-seconds="item.message.mediaDurationSeconds ?? null"
            :direction="item.message.direction"
            :avatar-url="resolveAudioAvatarUrl(item.message)"
            :avatar-text="getInitials(resolveMessageAuthor(item.message))"
            compact
          />
          <div v-if="!audioPreviewSrc && isAudioPreviewLoading(item.message.id)" class="chat-message__media-loading">
            <UIcon name="i-lucide-loader-circle" class="chat-message__media-fallback-icon chat-message__media-fallback-icon--spin" />
            <span>Carregando audio...</span>
          </div>
          <div class="chat-message__media-actions">
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="openMessageMedia(item.message)">
              Abrir
            </button>
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="downloadMessageMedia(item.message)">
              Baixar
            </button>
          </div>
        </div>

        <div v-else-if="hasDocumentPreview(item.message)" class="chat-message__document">
          <UIcon name="i-lucide-paperclip" class="chat-message__document-icon" />
          <span class="chat-message__document-name">{{ resolveMessageFileName(item.message) || 'Arquivo' }}</span>
          <div class="chat-message__media-actions">
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="openMessageMedia(item.message)">
              Abrir
            </button>
            <button type="button" class="chat-message__media-link" :disabled="isMediaActionLoading(item.message.id)" @click="downloadMessageMedia(item.message)">
              Baixar
            </button>
          </div>
        </div>

        <div v-else-if="hasPendingMediaPreview(item.message)" class="chat-message__media-fallback">
          <UIcon name="i-lucide-loader-circle" class="chat-message__media-fallback-icon" />
          <span>{{ getPendingMediaLabel(item.message) }}</span>
        </div>

        <InboxMessageContactCard
          v-if="getMessageContactCard(item.message)"
          :contact-card="getMessageContactCard(item.message)"
          :can-manage-conversation="canManageConversation"
          :get-initials="getInitials"
          :direction="item.message.direction"
          @open="onOpenMessageContact(item.message)"
          @save="onSaveMessageContact(item.message)"
        />

        <a
          v-if="getMessageLinkPreview(item.message)"
          :href="getMessageLinkPreview(item.message)?.url"
          target="_blank"
          rel="noopener noreferrer"
          class="chat-message__link-card"
          :class="{ 'chat-message__link-card--no-thumb': !getMessageLinkPreview(item.message)?.thumbnailUrl }"
        >
          <img
            v-if="getMessageLinkPreview(item.message)?.thumbnailUrl"
            :src="getMessageLinkPreview(item.message)?.thumbnailUrl || ''"
            alt="Preview do link"
            class="chat-message__link-thumb"
          >
          <div class="chat-message__link-content">
            <p class="chat-message__link-title">{{ getMessageLinkPreview(item.message)?.title }}</p>
            <p v-if="getMessageLinkPreview(item.message)?.description" class="chat-message__link-description">
              {{ getMessageLinkPreview(item.message)?.description }}
            </p>
            <p class="chat-message__link-host">
              {{ getMessageLinkPreview(item.message)?.host || getMessageLinkPreview(item.message)?.url }}
            </p>
          </div>
        </a>

        <p
          v-if="shouldRenderMessageText(item.message)"
          class="chat-message__text"
          v-html="renderMessageHtml(getRenderedMessageText(item.message), item.message)"
          @click="onMessageTextClick"
        />

        <div v-if="getReactionBadges(item.message).length > 0" class="chat-message__reactions">
          <button
            v-for="badge in getReactionBadges(item.message)"
            :key="`reaction-${item.message.id}-${badge.emoji}`"
            type="button"
            class="chat-message__reaction-badge"
            :class="{ 'chat-message__reaction-badge--active': badge.reactedByCurrentUser }"
            :title="badge.actors.join(', ')"
            :disabled="!canManageConversation"
            @click="toggleReactionBadge(item.message, badge)"
          >
            <span>{{ badge.emoji }}</span>
            <span>{{ badge.count }}</span>
          </button>
        </div>

        <div class="chat-message__meta">
          <time>{{ formatTime(item.message.createdAt) }}</time>
          <span>{{ item.message.status }}</span>
          <span v-if="isMentionAlertMessage(item.message)" class="chat-message__mention-indicator">
            <UIcon name="i-lucide-at-sign" />
            Mencao
          </span>
          <span v-if="resolveOutboundOperatorLabel(item.message)" class="chat-message__operator">
            {{ resolveOutboundOperatorLabel(item.message) }}
          </span>
          <InboxMessageActionMenu
            :can-manage-conversation="canManageConversation"
            :is-selected="isMessageSelected(item.message.id)"
            :can-delete-for-all="item.message.direction === 'OUTBOUND'"
            :reaction-items="buildReactionMenuItems(item.message)"
            @reply="onSetReply(item.message)"
            @toggle-select="selectionMode ? onToggleMessageSelection(item.message.id) : onStartMessageSelection(item.message.id)"
            @forward="onForwardMessage(item.message.id)"
            @delete-mine="onDeleteMessageForMe(item.message.id)"
            @delete-all="onDeleteMessageForAll(item.message.id)"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  display: flex;
  margin-bottom: 0.55rem;
}

.chat-message-row--selected :deep(.chat-message__bubble) {
  border-color: rgb(var(--primary) / 0.55);
  box-shadow: 0 0 0 1px rgb(var(--primary) / 0.18);
}

.chat-message-row--reply-focus :deep(.chat-message__bubble) {
  border-color: rgb(var(--primary) / 0.75);
  box-shadow: 0 0 0 1px rgb(var(--primary) / 0.28);
  animation: chat-reply-focus-pulse 1.2s ease;
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
  gap: 0.45rem;
  margin-bottom: 0.35rem;
}

.chat-message__author {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 600;
  color: rgb(var(--muted));
}

.chat-message__text {
  margin: 0;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
}

.chat-message__reply,
.chat-message__unsupported,
.chat-message__document,
.chat-message__media-fallback,
.chat-message__link-card {
  margin-bottom: 0.4rem;
}

.chat-message__link-card,
.chat-message__document,
.chat-message__reply,
.chat-message__unsupported {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  background: rgb(var(--surface-2));
}

.chat-message__link-card {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.35rem;
  text-decoration: none;
  color: inherit;
}

.chat-message__link-card--no-thumb {
  grid-template-columns: minmax(0, 1fr);
}

.chat-message__link-thumb {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: calc(var(--radius-xs) - 2px);
}

.chat-message__link-content,
.chat-message__reply-content {
  min-width: 0;
  display: grid;
  gap: 0.2rem;
}

.chat-message__link-title,
.chat-message__link-description,
.chat-message__link-host,
.chat-message__reply-author,
.chat-message__reply-text,
.chat-message__unsupported-title,
.chat-message__unsupported-label {
  margin: 0;
}

.chat-message__link-title {
  font-size: 0.8rem;
  font-weight: 700;
}

.chat-message__link-description,
.chat-message__link-host,
.chat-message__reply-text,
.chat-message__unsupported-label {
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

.chat-message__reply {
  border-left: 4px solid rgb(var(--primary));
  padding: 0.42rem 0.56rem;
  position: relative;
  overflow: hidden;
}

.chat-message__reply--clickable {
  cursor: pointer;
}

.chat-message__reply-author {
  font-size: 0.74rem;
  font-weight: 700;
  color: rgb(var(--primary));
}

.chat-message__reply-type-row,
.chat-message__unsupported-head,
.chat-message__media-actions,
.chat-message__meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-message__reply-icon,
.chat-message__unsupported-icon,
.chat-message__media-fallback-icon,
.chat-message__document-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.chat-message__reply-type {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  font-weight: 600;
}

.chat-message__unsupported {
  padding: 0.45rem 0.55rem;
  border-color: rgb(var(--warning) / 0.5);
  background: rgb(var(--warning) / 0.08);
}

.chat-message__media {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}

.chat-message__media-image-shell {
  max-width: min(360px, 100%);
  border-radius: var(--radius-sm);
  border: 1px solid rgb(var(--border) / 0.65);
  background: linear-gradient(130deg, rgb(var(--surface-2)), rgb(var(--surface-3)));
  overflow: hidden;
  min-height: 112px;
}

.chat-message__media-image,
.chat-message__media-video {
  max-width: min(360px, 100%);
  border-radius: var(--radius-sm);
  display: block;
}

.chat-message__media-image {
  max-height: 420px;
  width: 100%;
  transition: filter 0.28s ease, transform 0.28s ease, opacity 0.28s ease;
}

.chat-message__media-image--progressive {
  filter: blur(14px) saturate(0.88);
  transform: scale(1.03);
  opacity: 0.72;
}

.chat-message__media-loading {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: rgb(var(--muted));
  font-size: 0.74rem;
  min-height: 112px;
  padding: 0.5rem 0.55rem;
}

.chat-message__media-fallback {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: rgb(var(--muted));
  font-size: 0.78rem;
  padding: 0.45rem;
}

.chat-message__media-fallback-icon--spin {
  animation: chat-media-spin 0.9s linear infinite;
}

.chat-message__media-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  font-size: 0.72rem;
  text-decoration: none;
  color: rgb(var(--text));
  background: transparent;
  cursor: pointer;
}

.chat-message__document {
  display: grid;
  gap: 0.35rem;
  padding: 0.42rem 0.52rem;
}

.chat-message__audio-file-head {
  display: flex;
  align-items: center;
  gap: 0.36rem;
}

.chat-message__document-name {
  font-size: 0.82rem;
  font-weight: 600;
  word-break: break-word;
}

.chat-message__reactions {
  margin-top: 0.45rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.chat-message__reaction-badge {
  border: 1px solid rgb(var(--border));
  background: rgb(var(--surface-2));
  color: rgb(var(--text));
  border-radius: 999px;
  min-height: 1.5rem;
  padding: 0 0.45rem;
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  cursor: pointer;
}

.chat-message__reaction-badge--active {
  border-color: rgb(var(--primary) / 0.55);
  background: rgb(var(--primary) / 0.14);
  color: rgb(var(--primary));
}

.chat-message__meta {
  margin-top: 0.48rem;
  flex-wrap: wrap;
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

.chat-message__operator {
  font-weight: 600;
}

.chat-message__mention-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  padding: 0.06rem 0.38rem;
  border-radius: 999px;
  background: rgb(var(--primary) / 0.15);
  color: rgb(var(--primary));
  font-weight: 600;
}

:deep(.chat-message__mention) {
  color: rgb(var(--primary));
  font-weight: 700;
  background: rgb(var(--primary) / 0.12);
  border-radius: 0.3rem;
  padding: 0 0.18rem;
}

:deep(.chat-message__mention-link) {
  text-decoration: none;
  cursor: pointer;
}

:deep(.chat-message__external-link) {
  color: rgb(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 600;
}

@keyframes chat-reply-focus-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(var(--primary) / 0.36);
  }

  100% {
    box-shadow: 0 0 0 1px rgb(var(--primary) / 0.18);
  }
}

@keyframes chat-media-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
