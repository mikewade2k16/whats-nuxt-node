import { nextTick, type ComputedRef, type Ref } from "vue";
import type { Conversation, Message } from "~/types";
import { UNASSIGNED_VALUE, isNearBottom } from "~/composables/omnichannel/useOmnichannelInboxShared";

export function useOmnichannelInboxScroll(options: {
  chatBodyRef: Ref<HTMLElement | null>;
  showStickyDate: Ref<boolean>;
  stickyDateLabel: Ref<string>;
  firstUnreadMessageId: ComputedRef<string | null>;
  conversations: Ref<Conversation[]>;
  activeConversationId: Ref<string | null>;
  assigneeModel: Ref<string>;
  draft: Ref<string>;
  replyTarget: Ref<Message | null>;
  clearAttachment: () => void;
  loadConversationMessages: (conversationId: string) => Promise<void>;
  loadGroupParticipants: (conversationId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  markConversationAsRead: (messageEntry?: Message) => void;
  messageRowId: (messageId: string) => string;
}) {
  let scrollRaf: number | null = null;

  function scheduleStickyDateRefresh() {
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
    }

    scrollRaf = requestAnimationFrame(() => {
      refreshStickyDate();
      scrollRaf = null;
    });
  }

  function cancelScheduledStickyRefresh() {
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  }

  function refreshStickyDate() {
    const container = options.chatBodyRef.value;
    if (!container) {
      options.showStickyDate.value = false;
      options.stickyDateLabel.value = "";
      return;
    }

    const rows = container.querySelectorAll<HTMLElement>(".chat-message-row");
    if (!rows.length) {
      options.showStickyDate.value = false;
      options.stickyDateLabel.value = "";
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

    options.stickyDateLabel.value = selectedRow.dataset.dateLabel ?? "";
    options.showStickyDate.value = container.scrollTop > 24 && options.stickyDateLabel.value.length > 0;
  }

  function scrollToBottom() {
    const container = options.chatBodyRef.value;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  async function positionConversationOnOpen() {
    await nextTick();

    const container = options.chatBodyRef.value;
    if (!container) {
      return;
    }

    const unreadId = options.firstUnreadMessageId.value;

    if (unreadId) {
      const marker = document.getElementById("chat-unread-anchor");
      if (marker) {
        container.scrollTop = Math.max(marker.offsetTop - 24, 0);
      } else {
        const messageRow = document.getElementById(options.messageRowId(unreadId));
        if (messageRow) {
          container.scrollTop = Math.max(messageRow.offsetTop - 24, 0);
        } else {
          scrollToBottom();
        }
      }
    } else {
      scrollToBottom();
      options.markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  async function selectConversation(conversationId: string) {
    options.activeConversationId.value = conversationId;
    options.draft.value = "";
    options.replyTarget.value = null;
    options.clearAttachment();
    options.assigneeModel.value = options.conversations.value.find((entry) => entry.id === conversationId)?.assignedToId ?? UNASSIGNED_VALUE;

    await options.loadConversationMessages(conversationId);
    void options.loadGroupParticipants(conversationId);
    await positionConversationOnOpen();
  }

  function onChatScroll() {
    const container = options.chatBodyRef.value;
    if (!container) {
      return;
    }

    if (container.scrollTop < 96) {
      void options.loadOlderMessages();
    }

    if (isNearBottom(container)) {
      options.markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  function onChatBodyMounted(element: HTMLElement | null) {
    options.chatBodyRef.value = element;
  }

  return {
    scheduleStickyDateRefresh,
    scrollToBottom,
    selectConversation,
    onChatScroll,
    onChatBodyMounted,
    cancelScheduledStickyRefresh
  };
}
