<script setup lang="ts">
import { UDashboardGroup } from "#components";
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
} = useOmnichannelInbox();
</script>
<template>
  <div class="chat-page">
    <UDashboardGroup storage="local" storage-key="omni-inbox-layout-v3" class="chat-page__dashboard">
      <InboxConversationsSidebar
        :collapsed="leftCollapsed"
        :show-filters="showFilters"
        :loading-conversations="loadingConversations"
        :conversations="filteredConversations"
        :active-conversation-id="activeConversationId"
        :unread-conversation-ids="unreadConversationIds"
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
        @logout="logout"
      />

      <InboxChatPanel
        :active-conversation="activeConversation"
        :active-conversation-label="activeConversationLabel"
        :user-role="user?.role"
        :loading-messages="loadingMessages"
        :loading-older-messages="loadingOlderMessages"
        :message-render-items="messageRenderItems"
        :show-sticky-date="showStickyDate"
        :sticky-date-label="stickyDateLabel"
        :is-group-conversation="isGroupConversation"
        :draft="draft"
        :sending-message="sendingMessage"
        :reply-target="replyTarget"
        @body-mounted="onChatBodyMounted"
        @chat-scroll="onChatScroll"
        @send="sendMessage"
        @close-conversation="closeConversation"
        @set-reply="setReplyTarget"
        @clear-reply="clearReplyTarget"
        @update:draft="updateDraft"
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
}

.chat-page__dashboard {
  height: 100%;
}
</style>

