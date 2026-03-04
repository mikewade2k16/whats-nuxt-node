<script setup lang="ts">
import { UAlert, UButton, UDashboardGroup } from "#components";
import { computed, ref } from "vue";
import InboxChatPanel from "./inbox/InboxChatPanel.vue";
import InboxConversationsSidebar from "./inbox/InboxConversationsSidebar.vue";
import InboxDetailsSidebar from "./inbox/InboxDetailsSidebar.vue";
import InboxSaveContactModal from "./inbox/InboxSaveContactModal.vue";
import { useOmnichannelInbox } from "~/composables/omnichannel/useOmnichannelInbox";
import {
  buildCanonicalContactPhone,
  normalizePhoneDigits
} from "~/composables/omnichannel/useOmnichannelInboxShared";

const {
  user,
  leftCollapsed,
  rightCollapsed,
  showFilters,
  sidebarView,
  loadingConversations,
  loadingContacts,
  loadingUsers,
  loadingWhatsAppStatus,
  whatsappConnectionState,
  loadingMessages,
  loadingOlderMessages,
  loadingGroupParticipants,
  savingContact,
  creatingContact,
  sendingMessage,
  sendError,
  contactActionError,
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
  conversations,
  contacts,
  filteredContacts,
  isGroupConversation,
  canSaveActiveContact,
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
  updateSidebarView,
  updateShowFilters,
  updateLeftCollapsed,
  updateRightCollapsed,
  updateAssigneeModel,
  updateInternalNotes,
  selectConversation,
  openContactConversation,
  createContactAndOpenConversation,
  saveContactFromMessageCard,
  saveActiveConversationContact,
  deleteMessagesForMe,
  deleteMessagesForAll,
  forwardMessagesToConversation,
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

type SaveContactDraft = {
  name: string;
  phone: string;
  avatarUrl?: string | null;
  contactId?: string | null;
};

const saveContactModalOpen = ref(false);
const saveContactDraft = ref<SaveContactDraft | null>(null);
const saveContactModalError = ref("");

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

const existingContactForDraft = computed(() => {
  const payload = saveContactDraft.value;
  if (!payload) {
    return null;
  }

  const normalizedPhone = buildCanonicalContactPhone({
    phone: payload.phone
  });
  if (!normalizedPhone) {
    return null;
  }

  return (
    contacts.value.find((contactEntry) => {
      const contactPhone = normalizePhoneDigits(contactEntry.phone);
      return contactPhone === normalizedPhone;
    }) ?? null
  );
});

async function handleOpenSandboxTest() {
  try {
    await openSandboxTestConversation();
  } catch (error) {
    console.error("Nao foi possivel abrir conversa de teste do sandbox.", error);
  }
}

async function handleOpenContactFromCard(payload: {
  name: string;
  phone: string;
  contactId?: string | null;
  avatarUrl?: string | null;
}) {
  await saveContactFromMessageCard({
    ...payload,
    openConversation: true
  });
}

function formatContactDisplayPhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits.slice(2);
  }

  return trimmed;
}

function handleOpenSaveContactModal(payload: SaveContactDraft) {
  saveContactDraft.value = {
    ...payload
  };
  saveContactModalError.value = "";
  saveContactModalOpen.value = true;
}

function handleCloseSaveContactModal() {
  saveContactModalOpen.value = false;
  saveContactDraft.value = null;
  saveContactModalError.value = "";
}

async function handleSaveContactModal(payload: SaveContactDraft) {
  const normalizedPhone = buildCanonicalContactPhone({
    phone: payload.phone
  });

  if (!normalizedPhone) {
    saveContactModalError.value = "Informe um telefone valido para salvar o contato.";
    return;
  }

  saveContactModalError.value = "";
  const saved = await saveContactFromMessageCard({
    name: payload.name,
    phone: normalizedPhone,
    avatarUrl: payload.avatarUrl ?? null,
    contactId: payload.contactId ?? null
  });

  if (saved) {
    handleCloseSaveContactModal();
    return;
  }

  saveContactModalError.value = contactActionError.value || "Nao foi possivel salvar o contato.";
}

async function handleOpenExistingContact(contactId: string) {
  await openContactConversation(contactId);
  handleCloseSaveContactModal();
}
</script>
<template>
  <div class="chat-page">
    <InboxSaveContactModal
      :open="saveContactModalOpen"
      :payload="saveContactDraft"
      :existing-contact="existingContactForDraft"
      :saving="savingContact"
      :error-message="saveContactModalError"
      :format-display-phone="formatContactDisplayPhone"
      @close="handleCloseSaveContactModal"
      @save="handleSaveContactModal"
      @open-existing="handleOpenExistingContact"
    />

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
        :sidebar-view="sidebarView"
        :loading-conversations="loadingConversations"
        :loading-contacts="loadingContacts"
        :loading-whats-app-status="loadingWhatsAppStatus"
        :whatsapp-banner-message="sidebarWhatsappBannerMessage"
        :is-whats-app-connected="isWhatsAppConnected"
        :current-user-name="user?.name ?? null"
        :conversations="filteredConversations"
        :contacts="filteredContacts"
        :active-conversation-id="activeConversationId"
        :creating-contact="creatingContact"
        :contact-action-error="contactActionError"
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
        @update:sidebar-view="updateSidebarView"
        @update:search="updateSearch"
        @update:channel="updateChannel"
        @update:status="updateStatus"
        @select-conversation="selectConversation"
        @open-contact="openContactConversation"
        @create-contact="createContactAndOpenConversation"
        @open-sandbox-test="handleOpenSandboxTest"
        @logout="logout"
      />

      <InboxChatPanel
        :active-conversation="activeConversation"
        :active-conversation-label="activeConversationLabel"
        :conversation-options="conversations"
        :saved-contacts="contacts"
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
        :delete-messages-for-me-action="deleteMessagesForMe"
        :delete-messages-for-all-action="deleteMessagesForAll"
        :forward-messages-action="forwardMessagesToConversation"
        @body-mounted="onChatBodyMounted"
        @chat-scroll="onChatScroll"
        @send="sendMessage"
        @send-contact="sendContactCard"
        @save-contact-card="handleOpenSaveContactModal"
        @open-contact-card="handleOpenContactFromCard"
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
        :is-group-conversation="isGroupConversation"
        :saving-contact="savingContact"
        :contact-action-error="contactActionError"
        :can-save-active-contact="canSaveActiveContact"
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
        @save-contact="saveActiveConversationContact"
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

