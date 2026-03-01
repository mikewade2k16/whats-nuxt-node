<script setup lang="ts">
import { UAlert, UButton, UDashboardGroup } from "#components";
import { computed } from "vue";
import InboxChatPanel from "./inbox/InboxChatPanel.vue";
import InboxConversationsSidebar from "./inbox/InboxConversationsSidebar.vue";
import InboxDetailsSidebar from "./inbox/InboxDetailsSidebar.vue";
import { useOmnichannelInbox } from "~/composables/omnichannel/useOmnichannelInbox";

const {
  user,
  leftCollapsed,
  rightCollapsed,
  showFilters,
  loadingConversations,
  loadingUsers,
  loadingWhatsAppStatus,
  whatsappConnectionState,
  loadingMessages,
  loadingOlderMessages,
  loadingGroupParticipants,
  sendingMessage,
  sendError,
  whatsappBannerMessage,
  isWhatsAppConfigured,
  isWhatsAppConnected,
  updatingStatus,
  updatingAssignee,
  stickyDateLabel,
  showStickyDate,
  draft,
  hasAttachment,
  attachmentType,
  attachmentName,
  attachmentMimeType,
  attachmentSizeBytes,
  attachmentPreviewUrl,
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
  canManageConversation,
  activeGroupParticipants,
  internalNotes,
  filteredConversations,
  unreadConversationIds,
  mentionConversationIds,
  mentionConversationCounts,
  messageRenderItems,
  onChatBodyMounted,
  onChatScroll,
  setReplyTarget,
  clearReplyTarget,
  updateDraft,
  updateAttachment,
  clearAttachment,
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
  sendContactCard,
  reactToMessage,
  updateConversationStatus,
  updateConversationAssignee,
  openMentionConversation,
  openSandboxTestConversation,
  logout
} = useOmnichannelInbox();

const showWhatsAppConnectionAlert = computed(() => {
  if (loadingWhatsAppStatus.value) {
    return false;
  }

  return !isWhatsAppConnected.value;
});

const whatsappConnectionAlertTitle = computed(() => {
  if (!isWhatsAppConfigured.value) {
    return "Nenhum WhatsApp conectado para este tenant";
  }

  if (whatsappConnectionState.value === "connecting") {
    return "WhatsApp desconectado (aguardando leitura do QR)";
  }

  return "WhatsApp desconectado";
});

const whatsappConnectionAlertColor = computed(() => {
  if (!isWhatsAppConfigured.value) {
    return "error";
  }

  return "warning";
});

const sidebarWhatsappBannerMessage = computed(() => {
  if (showWhatsAppConnectionAlert.value) {
    return "";
  }

  return whatsappBannerMessage.value;
});

async function handleOpenSandboxTest() {
  try {
    await openSandboxTestConversation();
  } catch (error) {
    console.error("Nao foi possivel abrir conversa de teste do sandbox.", error);
  }
}
</script>
<template>
  <div class="chat-page">
    <UAlert
      v-if="showWhatsAppConnectionAlert"
      class="chat-page__status-alert"
      :color="whatsappConnectionAlertColor"
      variant="soft"
      :title="whatsappConnectionAlertTitle"
      :description="whatsappBannerMessage"
    >
      <template #actions>
        <UButton size="xs" color="neutral" variant="outline" to="/admin">
          Abrir Admin
        </UButton>
      </template>
    </UAlert>

    <UDashboardGroup storage="local" storage-key="omni-inbox-layout-v3" class="chat-page__dashboard">
      <InboxConversationsSidebar
        :collapsed="leftCollapsed"
        :show-filters="showFilters"
        :loading-conversations="loadingConversations"
        :loading-whats-app-status="loadingWhatsAppStatus"
        :whatsapp-banner-message="sidebarWhatsappBannerMessage"
        :is-whats-app-connected="isWhatsAppConnected"
        :current-user-name="user?.name ?? null"
        :conversations="filteredConversations"
        :active-conversation-id="activeConversationId"
        :unread-conversation-ids="unreadConversationIds"
        :mention-conversation-ids="mentionConversationIds"
        :mention-conversation-counts="mentionConversationCounts"
        :search="search"
        :channel="channel"
        :status="status"
        :channel-filter-items="channelFilterItems"
        :status-filter-items="statusFilterItems"
        @update:collapsed="updateLeftCollapsed"
        @update:show-filters="updateShowFilters"
        @update:search="updateSearch"
        @update:channel="updateChannel"
        @update:status="updateStatus"
        @select-conversation="selectConversation"
        @open-sandbox-test="handleOpenSandboxTest"
        @logout="logout"
      />

      <InboxChatPanel
        :active-conversation="activeConversation"
        :active-conversation-label="activeConversationLabel"
        :current-user-id="user?.id ?? null"
        :user-role="user?.role"
        :loading-messages="loadingMessages"
        :loading-older-messages="loadingOlderMessages"
        :message-render-items="messageRenderItems"
        :show-sticky-date="showStickyDate"
        :sticky-date-label="stickyDateLabel"
        :is-group-conversation="isGroupConversation"
        :group-participants="activeGroupParticipants"
        :loading-group-participants="loadingGroupParticipants"
        :draft="draft"
        :has-attachment="hasAttachment"
        :attachment-type="attachmentType"
        :attachment-name="attachmentName"
        :attachment-mime-type="attachmentMimeType"
        :attachment-size-bytes="attachmentSizeBytes"
        :attachment-preview-url="attachmentPreviewUrl"
        :sending-message="sendingMessage"
        :send-error="sendError"
        :reply-target="replyTarget"
        :can-manage-conversation="canManageConversation"
        @body-mounted="onChatBodyMounted"
        @chat-scroll="onChatScroll"
        @send="sendMessage"
        @send-contact="sendContactCard"
        @open-mention="openMentionConversation"
        @close-conversation="closeConversation"
        @set-reply="setReplyTarget"
        @clear-reply="clearReplyTarget"
        @update:draft="updateDraft"
        @pick-attachment="updateAttachment"
        @clear-attachment="clearAttachment"
        @set-reaction="reactToMessage"
      />

      <InboxDetailsSidebar
        :collapsed="rightCollapsed"
        :active-conversation="activeConversation"
        :active-conversation-label="activeConversationLabel"
        :status-action-items="statusActionItems"
        :assignee-items="assigneeItems"
        :assignee-model="assigneeModel"
        :updating-status="updatingStatus"
        :updating-assignee="updatingAssignee"
        :loading-users="loadingUsers"
        :internal-notes="internalNotes"
        :can-manage-conversation="canManageConversation"
        @update:collapsed="updateRightCollapsed"
        @update:internal-notes="updateInternalNotes"
        @update:assignee-model="updateAssigneeModel"
        @update-status="updateConversationStatus"
        @update-assignee="updateConversationAssignee"
      />
    </UDashboardGroup>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.5rem;
}

.chat-page__status-alert {
  margin: 0.5rem 0.5rem 0;
}

.chat-page__dashboard {
  height: 100%;
  min-height: 0;
}
</style>

