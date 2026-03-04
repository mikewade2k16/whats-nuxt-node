import type { Message, MessageType } from "~/types";

type MessageLinkPreview = {
  url: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  host: string | null;
  enabled: boolean;
};

type ReplyPreview = {
  content: string;
  author: string;
  messageType: MessageType;
  messageId: string | null;
};

export function useInboxChatMessageRendering(options: {
  getActiveConversation: () => { externalId?: string | null } | null;
  getIsGroupConversation: () => boolean;
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
  const mediaPlaceholderValues = new Set(["[imagem]", "[audio]", "[video]", "[documento]", "[figurinha]", "."]);
  const unsupportedPlaceholderPrefix = "[conteudo nao suportado:";
  let replyFocusTimer: number | null = null;

  function resolveMessageType(messageEntry: Message): MessageType {
    return messageEntry.messageType ?? "TEXT";
  }

  function isStickerMessage(messageEntry: Message) {
    if (resolveMessageType(messageEntry) !== "IMAGE") {
      return false;
    }

    const metadata = options.asRecord(messageEntry.metadataJson);
    if (!metadata) {
      return false;
    }

    const mediaPayloadKey = typeof metadata.mediaPayloadKey === "string" ? metadata.mediaPayloadKey.trim() : "";
    if (mediaPayloadKey === "stickerMessage") {
      return true;
    }

    const mediaKind = typeof metadata.mediaKind === "string" ? metadata.mediaKind.trim().toLowerCase() : "";
    if (mediaKind === "sticker") {
      return true;
    }

    return Boolean(options.asRecord(metadata.sticker));
  }

  function getMediaTypeLabel(type: MessageType | null | undefined, messageEntry?: Message | null) {
    if (type === "IMAGE") {
      if (messageEntry && isStickerMessage(messageEntry)) {
        return "Figurinha";
      }

      return "Foto";
    }

    if (type === "VIDEO") {
      return "Video";
    }

    if (type === "AUDIO") {
      return "Audio";
    }

    if (type === "DOCUMENT") {
      return "Documento";
    }

    return "Mensagem";
  }

  function getUnsupportedMetadata(messageEntry: Message) {
    const metadata = options.asRecord(messageEntry.metadataJson);
    const unsupported = metadata ? options.asRecord(metadata.unsupported) : null;
    if (!unsupported) {
      return null;
    }

    const type = typeof unsupported.type === "string" ? unsupported.type.trim() : "";
    const label = typeof unsupported.label === "string" ? unsupported.label.trim() : "";

    return {
      type: type || "unknown",
      label: label || "tipo desconhecido"
    };
  }

  function hasUnsupportedNotice(messageEntry: Message) {
    if (getUnsupportedMetadata(messageEntry)) {
      return true;
    }

    const content = messageEntry.content?.trim().toLowerCase() ?? "";
    return content.startsWith(unsupportedPlaceholderPrefix);
  }

  function getUnsupportedLabel(messageEntry: Message) {
    const fromMetadata = getUnsupportedMetadata(messageEntry);
    if (fromMetadata?.label) {
      return fromMetadata.label;
    }

    return options.parseUnsupportedLabelFromPlaceholder(messageEntry.content) ?? "tipo desconhecido";
  }

  function buildUnsupportedOpenUrl() {
    const externalId = options.getActiveConversation()?.externalId ?? "";
    if (!externalId || externalId.endsWith("@g.us")) {
      return "https://web.whatsapp.com/";
    }

    const digits = externalId.replace(/\D/g, "");
    if (!digits) {
      return "https://web.whatsapp.com/";
    }

    return `https://wa.me/${digits}`;
  }

  function isMentionAlertMessage(messageEntry: Message) {
    if (!options.getIsGroupConversation() || messageEntry.direction !== "INBOUND") {
      return false;
    }

    const metadata = options.asRecord(messageEntry.metadataJson);
    const mentions = metadata ? options.asRecord(metadata.mentions) : null;
    if (!mentions) {
      return false;
    }

    if (mentions.everyOne === true) {
      return true;
    }

    return Array.isArray(mentions.mentioned) && mentions.mentioned.length > 0;
  }

  function getReplyPreview(messageEntry: Message): ReplyPreview | null {
    const metadata = options.asRecord(messageEntry.metadataJson);
    const reply = metadata ? options.asRecord(metadata.reply) : null;

    if (reply) {
      const content = typeof reply.content === "string" ? reply.content.trim() : "";
      const author = typeof reply.author === "string" ? reply.author.trim() : "";
      const messageType = typeof reply.messageType === "string" ? (reply.messageType as MessageType) : "TEXT";
      const messageId =
        typeof reply.messageId === "string" && reply.messageId.trim().length > 0
          ? reply.messageId.trim()
          : null;

      if (content || author || messageType !== "TEXT") {
        return {
          content: content || getMediaTypeLabel(messageType),
          author: author || "Mensagem anterior",
          messageType,
          messageId
        };
      }
    }

    const fallback = options.splitLegacyReplyContent(messageEntry.content ?? "");
    if (!fallback) {
      return null;
    }

    return {
      content: fallback.quoted,
      author: "Mensagem anterior",
      messageType: "TEXT",
      messageId: null
    };
  }

  function getRenderedMessageText(messageEntry: Message) {
    const fallback = options.splitLegacyReplyContent(messageEntry.content ?? "");
    if (fallback) {
      return fallback.content;
    }

    return messageEntry.content ?? "";
  }

  function getMessageLinkPreview(messageEntry: Message): MessageLinkPreview | null {
    const metadata = options.asRecord(messageEntry.metadataJson);
    const linkPreview = metadata ? options.asRecord(metadata.linkPreview) : null;
    const text = getRenderedMessageText(messageEntry);
    const fallbackUrl = options.extractFirstLinkFromText(text);

    if (linkPreview && linkPreview.enabled === false) {
      return null;
    }

    const url = options.normalizeLinkUrl(typeof linkPreview?.url === "string" ? linkPreview.url : null) ?? fallbackUrl;
    if (!url) {
      return null;
    }

    const titleRaw = typeof linkPreview?.title === "string" ? linkPreview.title.trim() : "";
    const descriptionRaw = typeof linkPreview?.description === "string"
      ? linkPreview.description.trim()
      : "";
    const thumbnailRaw = typeof linkPreview?.thumbnailUrl === "string"
      ? linkPreview.thumbnailUrl.trim()
      : "";
    const host = options.extractLinkHost(url);

    return {
      url,
      title: titleRaw || host || url,
      description: descriptionRaw || null,
      thumbnailUrl: thumbnailRaw || null,
      host,
      enabled: true
    };
  }

  function shouldRenderMessageText(messageEntry: Message, hasContactCard: boolean) {
    if (hasUnsupportedNotice(messageEntry)) {
      return false;
    }

    if (hasContactCard) {
      return false;
    }

    const text = getRenderedMessageText(messageEntry).trim();
    if (!text) {
      return false;
    }

    if (resolveMessageType(messageEntry) !== "TEXT" && options.isMediaPlaceholder(text, mediaPlaceholderValues)) {
      return false;
    }

    return true;
  }

  function hasImagePreview(messageEntry: Message) {
    return resolveMessageType(messageEntry) === "IMAGE" && Boolean(messageEntry.mediaUrl);
  }

  function hasVideoPreview(messageEntry: Message) {
    return resolveMessageType(messageEntry) === "VIDEO" && Boolean(messageEntry.mediaUrl);
  }

  function hasAudioPreview(messageEntry: Message) {
    return resolveMessageType(messageEntry) === "AUDIO" && Boolean(messageEntry.mediaUrl);
  }

  function hasDocumentPreview(messageEntry: Message) {
    return resolveMessageType(messageEntry) === "DOCUMENT" && Boolean(messageEntry.mediaUrl);
  }

  function hasPendingMediaPreview(messageEntry: Message) {
    const messageType = resolveMessageType(messageEntry);
    if (messageType === "TEXT") {
      return false;
    }

    if (
      hasImagePreview(messageEntry) ||
      hasVideoPreview(messageEntry) ||
      hasAudioPreview(messageEntry) ||
      hasDocumentPreview(messageEntry)
    ) {
      return false;
    }

    return !hasUnsupportedNotice(messageEntry);
  }

  function getPendingMediaLabel(messageEntry: Message) {
    const label = getMediaTypeLabel(resolveMessageType(messageEntry), messageEntry);
    const directionLabel = messageEntry.direction === "OUTBOUND" ? "enviado" : "recebido";
    return `${label} ${directionLabel}. Carregando preview...`;
  }

  function getReplyAuthorLabel(messageEntry: Message) {
    const reply = getReplyPreview(messageEntry);
    if (!reply) {
      return "";
    }

    return reply.author;
  }

  function getReplyTargetText(messageEntry: Message) {
    const text = getRenderedMessageText(messageEntry).trim();
    if (text && !(resolveMessageType(messageEntry) !== "TEXT" && options.isMediaPlaceholder(text, mediaPlaceholderValues))) {
      return text;
    }

    return getMediaTypeLabel(resolveMessageType(messageEntry), messageEntry);
  }

  function getReplyTargetAuthorLabel(messageEntry: Message) {
    if (messageEntry.direction === "OUTBOUND") {
      const operatorLabel = options.resolveOutboundOperatorLabel(messageEntry);
      if (operatorLabel) {
        return operatorLabel;
      }
    }

    return options.resolveMessageAuthor(messageEntry);
  }

  function hasReplyJumpTarget(messageEntry: Message) {
    return Boolean(getReplyPreview(messageEntry)?.messageId);
  }

  function focusMessageRowById(messageId: string) {
    if (!import.meta.client) {
      return;
    }

    const target = document.getElementById(options.messageRowId(messageId));
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    target.classList.add("chat-message-row--reply-focus");

    if (replyFocusTimer !== null) {
      window.clearTimeout(replyFocusTimer);
    }

    replyFocusTimer = window.setTimeout(() => {
      target.classList.remove("chat-message-row--reply-focus");
      replyFocusTimer = null;
    }, 1600);
  }

  function onReplyPreviewClick(messageEntry: Message) {
    const preview = getReplyPreview(messageEntry);
    if (!preview?.messageId) {
      return;
    }

    focusMessageRowById(preview.messageId);
  }

  function renderMessageHtml(value: string, messageEntry: Message) {
    const mentionAnchors: string[] = [];
    const mentionPlaceholderPrefix = "__OMNI_MENTION__";

    let escapedValue = options.escapeHtml(value);
    const explicitMentionEntries = options.collectMentionDisplayEntries(messageEntry)
      .filter((entry) => entry.label.includes(" "))
      .sort((left, right) => right.label.length - left.label.length);

    for (const entry of explicitMentionEntries) {
      const labelToken = `@${entry.label}`;
      const labelPattern = new RegExp(
        `(^|[\\s(])(${options.escapeRegExp(options.escapeHtml(labelToken))})(?=\\s|$|[),.!?])`,
        "g"
      );

      escapedValue = escapedValue.replace(labelPattern, (_match: string, prefix: string) => {
        const routeTarget = options.resolveMentionRouteTarget(messageEntry, labelToken);
        const jidAttr = routeTarget.jid
          ? ` data-mention-jid="${options.escapeHtmlAttribute(routeTarget.jid)}"`
          : "";
        const phoneAttr = routeTarget.phone
          ? ` data-mention-phone="${options.escapeHtmlAttribute(routeTarget.phone)}"`
          : "";

        const anchor = `<a href="#" class="chat-message__mention chat-message__mention-link"${jidAttr}${phoneAttr}>${options.escapeHtml(labelToken)}</a>`;
        const placeholder = `${mentionPlaceholderPrefix}${mentionAnchors.length}__`;
        mentionAnchors.push(anchor);
        return `${prefix}${placeholder}`;
      });
    }

    const withMentionPlaceholders = escapedValue.replace(
      /(^|[\s(])(@(?:[0-9A-Za-z._-]{3,80}(?::[0-9A-Za-z._-]{1,20})?(?:@lid)?))(?=\s|$|[),.!?])/g,
      (_match: string, prefix: string, mention: string) => {
        const display = options.getMentionDisplayFromMetadata(messageEntry, mention);
        const renderedMention = display ? `@${display}` : mention;
        const routeTarget = options.resolveMentionRouteTarget(messageEntry, mention);
        const jidAttr = routeTarget.jid
          ? ` data-mention-jid="${options.escapeHtmlAttribute(routeTarget.jid)}"`
          : "";
        const phoneAttr = routeTarget.phone
          ? ` data-mention-phone="${options.escapeHtmlAttribute(routeTarget.phone)}"`
          : "";

        const anchor = `<a href="#" class="chat-message__mention chat-message__mention-link"${jidAttr}${phoneAttr}>${options.escapeHtml(renderedMention)}</a>`;
        const placeholder = `${mentionPlaceholderPrefix}${mentionAnchors.length}__`;
        mentionAnchors.push(anchor);
        return `${prefix}${placeholder}`;
      }
    );

    const withExternalLinks = withMentionPlaceholders.replace(
      /(?:https?:\/\/|www\.)[^\s<>"']+/gi,
      (rawLink: string) => {
        const sanitized = rawLink.replace(/[),.!?;:]+$/g, "");
        const trailing = rawLink.slice(sanitized.length);
        const href = options.normalizeLinkUrl(sanitized);
        if (!href) {
          return rawLink;
        }

        const external = `<a href="${options.escapeHtmlAttribute(href)}" class="chat-message__external-link" target="_blank" rel="noopener noreferrer">${options.escapeHtml(sanitized)}</a>`;
        return `${external}${options.escapeHtml(trailing)}`;
      }
    );

    const withMentionsRestored = withExternalLinks.replace(
      new RegExp(`${mentionPlaceholderPrefix}(\\d+)__`, "g"),
      (_match: string, indexValue: string) => {
        const index = Number(indexValue);
        return mentionAnchors[index] ?? "";
      }
    );

    return withMentionsRestored.replace(/\n/g, "<br>");
  }

  function disposeMessageRendering() {
    if (replyFocusTimer !== null) {
      window.clearTimeout(replyFocusTimer);
      replyFocusTimer = null;
    }
  }

  return {
    getMediaTypeLabel,
    hasUnsupportedNotice,
    getUnsupportedLabel,
    buildUnsupportedOpenUrl,
    resolveMessageType,
    isMentionAlertMessage,
    isStickerMessage,
    getReplyPreview,
    getRenderedMessageText,
    getMessageLinkPreview,
    shouldRenderMessageText,
    hasImagePreview,
    hasVideoPreview,
    hasAudioPreview,
    hasDocumentPreview,
    hasPendingMediaPreview,
    getPendingMediaLabel,
    getReplyAuthorLabel,
    getReplyTargetText,
    getReplyTargetAuthorLabel,
    hasReplyJumpTarget,
    onReplyPreviewClick,
    renderMessageHtml,
    disposeMessageRendering
  };
}
