import type { Message } from "~/types";
import { useInboxChatMediaActions } from "~/composables/omnichannel/useInboxChatMediaActions";
import { useInboxChatMessageRendering } from "~/composables/omnichannel/useInboxChatMessageRendering";

export function useInboxChatMessageHelpers(options: {
  getActiveConversation: () => { externalId?: string | null } | null;
  getIsGroupConversation: () => boolean;
  getToken: () => string | null;
  resolveMessageAuthor: (messageEntry: Message) => string;
  resolveOutboundOperatorLabel: (messageEntry: Message) => string;
  messageRowId: (messageId: string) => string;
  asRecord: (value: unknown) => Record<string, unknown> | null;
  splitLegacyReplyContent: (value: string) => { quoted: string; content: string } | null;
  parseUnsupportedLabelFromPlaceholder: (value: string) => string | null;
  isMediaPlaceholder: (value: string, placeholders: Set<string>) => boolean;
  extractFirstLinkFromText: (value: string) => string | null;
  extractLinkHost: (value: string) => string | null;
  normalizeLinkUrl: (value: string | null | undefined) => string | null;
  escapeHtml: (value: string) => string;
  escapeHtmlAttribute: (value: string) => string;
  escapeRegExp: (value: string) => string;
  getMentionDisplayFromMetadata: (messageEntry: Message, mentionToken: string) => string | null;
  collectMentionDisplayEntries: (messageEntry: Message) => Array<{ label: string; jid: string | null; phone: string | null }>;
  resolveMentionRouteTarget: (messageEntry: Message, mentionToken: string) => { jid: string | null; phone: string | null };
}) {
  const rendering = useInboxChatMessageRendering({
    getActiveConversation: options.getActiveConversation,
    getIsGroupConversation: options.getIsGroupConversation,
    resolveMessageAuthor: options.resolveMessageAuthor,
    resolveOutboundOperatorLabel: options.resolveOutboundOperatorLabel,
    messageRowId: options.messageRowId,
    asRecord: options.asRecord,
    splitLegacyReplyContent: options.splitLegacyReplyContent,
    parseUnsupportedLabelFromPlaceholder: options.parseUnsupportedLabelFromPlaceholder,
    isMediaPlaceholder: options.isMediaPlaceholder,
    extractFirstLinkFromText: options.extractFirstLinkFromText,
    extractLinkHost: options.extractLinkHost,
    normalizeLinkUrl: options.normalizeLinkUrl,
    escapeHtml: options.escapeHtml,
    escapeHtmlAttribute: options.escapeHtmlAttribute,
    escapeRegExp: options.escapeRegExp,
    getMentionDisplayFromMetadata: options.getMentionDisplayFromMetadata,
    collectMentionDisplayEntries: options.collectMentionDisplayEntries,
    resolveMentionRouteTarget: options.resolveMentionRouteTarget
  });

  const mediaActions = useInboxChatMediaActions({
    getToken: options.getToken,
    resolveMessageType: rendering.resolveMessageType
  });

  return {
    ...rendering,
    ...mediaActions,
    disposeMessageHelpers: rendering.disposeMessageRendering
  };
}
