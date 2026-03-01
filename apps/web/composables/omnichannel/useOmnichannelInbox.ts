import { io, type Socket } from "socket.io-client";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { InboxRenderItem, InboxSelectOption } from "~/components/omnichannel/inbox/types";
import type {
  Conversation,
  ConversationStatus,
  GroupParticipant,
  Message,
  MessageType,
  TenantSettings,
  TenantUser,
  UserRole,
  WhatsAppStatusResponse
} from "~/types";

interface MessagesPageResponse {
  conversationId: string;
  messages: Message[];
  hasMore: boolean;
}

interface GroupParticipantsResponse {
  conversationId: string;
  participants: GroupParticipant[];
}

interface ReadStateEntry {
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}

interface OutboundAttachment {
  file: File;
  type: MessageType;
  previewUrl: string | null;
  sendAsSticker?: boolean;
}

interface OptimisticMessageOptions {
  conversationId: string;
  text: string;
  attachment: OutboundAttachment | null;
  reply: Message | null;
}

type AttachmentPickerMode = "document" | "media" | "camera" | "audio" | "sticker" | "gif";

interface AttachmentSelectionPayload {
  file: File | null;
  mode: AttachmentPickerMode;
}

interface SendMessageOptions {
  mentionedJids?: string[];
  linkPreviewEnabled?: boolean;
}

interface MentionOpenPayload {
  jid: string | null;
  phone: string | null;
  label: string | null;
}

const UNASSIGNED_VALUE = "__unassigned__";
const MESSAGE_PAGE_SIZE = 80;
const DEFAULT_MAX_UPLOAD_MB = 500;
const MEDIA_MESSAGE_TYPES: MessageType[] = ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"];

const MEDIA_TYPE_LABEL: Record<MessageType, string> = {
  TEXT: "texto",
  IMAGE: "imagem",
  AUDIO: "audio",
  VIDEO: "video",
  DOCUMENT: "documento"
};

function toArrayOrEmpty<T>(value: unknown) {
  if (Array.isArray(value)) {
    return value as T[];
  }

  return [];
}

function canWriteInboxByRole(role: UserRole | null | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "AGENT";
}

export function useOmnichannelInbox() {
  const config = useRuntimeConfig();
  const { user, token, clearSession } = useAuth();
  const { apiFetch } = useApi();

  const conversations = ref<Conversation[]>([]);
  const users = ref<TenantUser[]>([]);
  const messages = ref<Message[]>([]);

  const activeConversationId = ref<string | null>(null);
  const leftCollapsed = ref(false);
  const rightCollapsed = ref(false);
  const showFilters = ref(true);

  const loadingConversations = ref(false);
  const loadingUsers = ref(false);
  const loadingWhatsAppStatus = ref(false);
  const loadingMessages = ref(false);
  const loadingOlderMessages = ref(false);
  const loadingGroupParticipants = ref(false);
  const pendingSendCount = ref(0);
  const sendingMessage = computed(() => pendingSendCount.value > 0);
  const sendError = ref("");
  const updatingStatus = ref(false);
  const updatingAssignee = ref(false);

  const hasMoreMessages = ref(false);
  const stickyDateLabel = ref("");
  const showStickyDate = ref(false);

  const draft = ref("");
  const search = ref("");
  const channel = ref("all");
  const status = ref("all");
  const replyTarget = ref<Message | null>(null);
  const attachment = ref<OutboundAttachment | null>(null);
  const tenantMaxUploadMb = ref(DEFAULT_MAX_UPLOAD_MB);
  const assigneeModel = ref<string>(UNASSIGNED_VALUE);
  const whatsappStatus = ref<WhatsAppStatusResponse | null>(null);

  const notesByConversation = reactive<Record<string, string>>({});
  const groupParticipantsByConversation = reactive<Record<string, GroupParticipant[]>>({});
  const readState = ref<Record<string, ReadStateEntry>>({});
  const mentionAlertState = ref<Record<string, number>>({});

  const chatBodyRef = ref<HTMLElement | null>(null);
  const realtimeMessageHydrationLocks = new Set<string>();
  const groupParticipantsRefreshAtByConversation = new Map<string, number>();
  let scrollRaf: number | null = null;
  let whatsappStatusPollTimer: ReturnType<typeof setInterval> | null = null;
  let socket: Socket | null = null;

  const channelFilterItems: InboxSelectOption[] = [
    { label: "Todos canais", value: "all" },
    { label: "WhatsApp", value: "WHATSAPP" },
    { label: "Instagram", value: "INSTAGRAM" }
  ];

  const statusFilterItems: InboxSelectOption[] = [
    { label: "Todos status", value: "all" },
    { label: "Abertos", value: "OPEN" },
    { label: "Pendentes", value: "PENDING" },
    { label: "Encerrados", value: "CLOSED" }
  ];

  const statusActionItems: InboxSelectOption[] = [
    { label: "Aberto", value: "OPEN" },
    { label: "Pendente", value: "PENDING" },
    { label: "Encerrado", value: "CLOSED" }
  ];

  const assigneeItems = computed<InboxSelectOption[]>(() => {
    const usersList = toArrayOrEmpty<TenantUser>(users.value);
    return [
      { label: "Nao atribuido", value: UNASSIGNED_VALUE },
      ...usersList.map((entry) => ({
        label: `${entry.name} (${entry.role})`,
        value: entry.id
      }))
    ];
  });

  const activeConversation = computed(() => {
    if (!activeConversationId.value) {
      return null;
    }

    const conversationsList = toArrayOrEmpty<Conversation>(conversations.value);
    return conversationsList.find((conversationEntry) => conversationEntry.id === activeConversationId.value) ?? null;
  });

  const activeConversationLabel = computed(() => {
    if (!activeConversation.value) {
      return null;
    }

    return (
      activeConversation.value.contactName ||
      activeConversation.value.contactPhone ||
      activeConversation.value.externalId
    );
  });

  const isGroupConversation = computed(() => {
    return Boolean(activeConversation.value?.externalId?.endsWith("@g.us"));
  });

  const canManageConversation = computed(() => canWriteInboxByRole(user.value?.role));

  const activeGroupParticipants = computed<GroupParticipant[]>(() => {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return [];
    }

    return groupParticipantsByConversation[conversationId] ?? [];
  });

  const readStateStorageKey = computed(() => {
    return `omni:read-state:${user.value?.tenantId ?? "tenant"}:${user.value?.id ?? "user"}`;
  });

  const whatsappConnectionState = computed(() => {
    const value =
      (whatsappStatus.value?.connectionState as { instance?: { state?: string } } | undefined)?.instance
        ?.state ?? "unknown";
    return String(value).toLowerCase();
  });

  const isWhatsAppConfigured = computed(() => {
    if (!whatsappStatus.value) {
      return false;
    }

    return Boolean(whatsappStatus.value.configured);
  });

  const isWhatsAppConnected = computed(() => {
    const state = whatsappConnectionState.value;
    return state === "open" || state === "connected";
  });

  const whatsappBannerMessage = computed(() => {
    if (loadingWhatsAppStatus.value) {
      return "";
    }

    if (!isWhatsAppConfigured.value) {
      return "Nenhum WhatsApp conectado para este tenant. Configure no Admin.";
    }

    if (!isWhatsAppConnected.value) {
      if (whatsappConnectionState.value === "connecting") {
        return "WhatsApp desconectado. QR aguardando leitura no Admin.";
      }

      return `WhatsApp desconectado (estado: ${whatsappConnectionState.value}). Conecte por QR no Admin.`;
    }

    return "";
  });

  const internalNotes = computed({
    get() {
      const conversationId = activeConversationId.value;
      if (!conversationId) {
        return "";
      }

      return notesByConversation[conversationId] ?? "";
    },
    set(value: string) {
      const conversationId = activeConversationId.value;
      if (!conversationId) {
        return;
      }

      notesByConversation[conversationId] = value;
    }
  });

  const hasAttachment = computed(() => Boolean(attachment.value));

  const attachmentType = computed(() => attachment.value?.type ?? null);

  const attachmentName = computed(() => attachment.value?.file.name ?? null);

  const attachmentMimeType = computed(() => attachment.value?.file.type || null);

  const attachmentSizeBytes = computed(() => attachment.value?.file.size ?? null);

  const attachmentPreviewUrl = computed(() => attachment.value?.previewUrl ?? null);

  const maxAttachmentSizeBytes = computed(() => {
    return tenantMaxUploadMb.value * 1024 * 1024;
  });

  const filteredConversations = computed(() => {
    const normalizedSearch = search.value.trim().toLowerCase();
    const conversationsList = toArrayOrEmpty<Conversation>(conversations.value);

    return conversationsList.filter((conversationEntry) => {
      if (channel.value !== "all" && conversationEntry.channel !== channel.value) {
        return false;
      }

      if (status.value !== "all" && conversationEntry.status !== status.value) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const joinedText = [
        conversationEntry.contactName ?? "",
        conversationEntry.contactPhone ?? "",
        conversationEntry.externalId,
        conversationEntry.lastMessage?.content ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return joinedText.includes(normalizedSearch);
    });
  });

  const unreadConversationIds = computed(() => {
    const conversationsList = toArrayOrEmpty<Conversation>(conversations.value);
    return conversationsList
      .filter((conversationEntry) => isConversationUnread(conversationEntry))
      .map((conversationEntry) => conversationEntry.id);
  });

  const mentionConversationIds = computed(() => {
    return Object.entries(mentionAlertState.value)
      .filter(([, count]) => Number(count) > 0)
      .map(([conversationId]) => conversationId);
  });

  const mentionConversationCounts = computed<Record<string, number>>(() => {
    const next: Record<string, number> = {};

    for (const [conversationId, count] of Object.entries(mentionAlertState.value)) {
      const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
      if (normalizedCount > 0) {
        next[conversationId] = normalizedCount;
      }
    }

    return next;
  });

  const firstUnreadMessageId = computed(() => {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return null;
    }

    const entry = readState.value[conversationId];
    if (!entry?.lastReadAt) {
      return null;
    }

    const readTimestamp = Number(new Date(entry.lastReadAt));
    if (!Number.isFinite(readTimestamp)) {
      return null;
    }

    const firstUnread = messages.value.find((messageEntry) => {
      return Number(new Date(messageEntry.createdAt)) > readTimestamp;
    });

    return firstUnread?.id ?? null;
  });

  const messageRenderItems = computed<InboxRenderItem[]>(() => {
    const items: InboxRenderItem[] = [];
    const unreadMessageId = firstUnreadMessageId.value;
    let unreadInserted = false;
    let previousDateKey = "";

    for (const messageEntry of messages.value) {
      const dateKey = buildDateKey(messageEntry.createdAt);
      const dateLabel = formatDateHeader(messageEntry.createdAt);

      if (dateKey !== previousDateKey) {
        items.push({
          kind: "date",
          key: `date-${dateKey}`,
          label: dateLabel
        });
        previousDateKey = dateKey;
      }

      if (!unreadInserted && unreadMessageId && messageEntry.id === unreadMessageId) {
        items.push({ kind: "unread", key: "unread-marker" });
        unreadInserted = true;
      }

      items.push({
        kind: "message",
        key: messageEntry.id,
        message: messageEntry,
        dateKey,
        dateLabel
      });
    }

    return items;
  });

  function ensureAuthOrRedirect() {
    if (!token.value) {
      void navigateTo("/login");
    }
  }

  function buildDateKey(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateHeader(value: string) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (buildDateKey(date.toISOString()) === buildDateKey(today.toISOString())) {
      return "Hoje";
    }

    if (buildDateKey(date.toISOString()) === buildDateKey(yesterday.toISOString())) {
      return "Ontem";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function isNearBottom(element: HTMLElement | null) {
    if (!element) {
      return false;
    }

    const distance = element.scrollHeight - (element.scrollTop + element.clientHeight);
    return distance < 48;
  }

  function messageRowId(messageId: string) {
    return `chat-message-${messageId}`;
  }

  function resolveMessageType(messageEntry: Message): MessageType {
    return messageEntry.messageType ?? "TEXT";
  }

  function normalizeComparableJid(value: string | null | undefined) {
    const trimmed = value?.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes("@")) {
      return trimmed
        .replace(/:\d+(?=@)/, "")
        .replace(/@c\.us$/, "@s.whatsapp.net");
    }

    const digits = trimmed.replace(/\D/g, "");
    if (!digits) {
      return null;
    }

    return `${digits}@s.whatsapp.net`;
  }

  function normalizePhoneDigits(value: string | null | undefined) {
    const digits = value?.replace(/\D/g, "") ?? "";
    return digits.length > 0 ? digits : null;
  }

  function isStickerMessage(messageEntry: Message) {
    if (resolveMessageType(messageEntry) !== "IMAGE") {
      return false;
    }

    const metadata = asRecord(messageEntry.metadataJson);
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

    return Boolean(asRecord(metadata.sticker));
  }

  function asRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  function toOptionalNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  function normalizeTenantUploadLimitMb(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_MAX_UPLOAD_MB;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1) {
      return 1;
    }

    if (normalized > 2048) {
      return 2048;
    }

    return normalized;
  }

  function formatBytesAsMb(value: number | null | undefined) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return `${Math.round((value / (1024 * 1024)) * 10) / 10}MB`;
  }

  function formatUploadApiError(errorCode: string | null, details: Record<string, unknown> | null, fallback: string) {
    if (!errorCode) {
      return fallback;
    }

    const messageType = typeof details?.messageType === "string" ? details.messageType : "DOCUMENT";
    const typeLabel = MEDIA_TYPE_LABEL[messageType as MessageType] ?? "arquivo";
    const maxBytes = toOptionalNumber(details?.maxBytes);
    const maxUploadMbValue = toOptionalNumber(details?.maxUploadMb);
    const maxUploadMb = maxUploadMbValue !== null ? `${maxUploadMbValue}MB` : null;
    const maxMb = formatBytesAsMb(maxBytes);
    const actualBytes = toOptionalNumber(details?.actualBytes);
    const actualMb = formatBytesAsMb(actualBytes);

    if (errorCode === "UPLOAD_LIMIT_EXCEEDED") {
      return `Arquivo acima do limite configurado para ${typeLabel}${maxUploadMb ? ` (${maxUploadMb})` : maxMb ? ` (${maxMb})` : ""}${actualMb ? `. Enviado: ${actualMb}.` : "."}`;
    }

    if (errorCode === "UPLOAD_MIME_INVALID") {
      return `Tipo de arquivo invalido para ${typeLabel}.`;
    }

    if (errorCode === "UPLOAD_SIZE_REQUIRED") {
      return "Nao foi possivel identificar o tamanho do arquivo para validar limite.";
    }

    return fallback;
  }

  function formatSendError(error: unknown, fallback = "Nao foi possivel enviar a mensagem.") {
    const errorRecord = asRecord(error);
    const directData = asRecord(errorRecord?.data);
    const directCode = typeof directData?.code === "string" ? directData.code : null;

    if (directCode) {
      const formatted = formatUploadApiError(
        directCode,
        asRecord(directData?.details),
        typeof directData?.message === "string" ? directData.message : fallback
      );
      if (formatted.trim().length > 0) {
        return formatted;
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return fallback;
  }

  function isMediaMessageType(type: MessageType) {
    return MEDIA_MESSAGE_TYPES.includes(type);
  }

  function messageNeedsMediaHydration(messageEntry: Message) {
    const messageType = resolveMessageType(messageEntry);
    if (!isMediaMessageType(messageType)) {
      return false;
    }

    if (typeof messageEntry.mediaUrl === "string" && messageEntry.mediaUrl.trim().length > 0) {
      return false;
    }

    const metadata = asRecord(messageEntry.metadataJson);
    if (!metadata) {
      return true;
    }

    const hasMediaUrl = metadata.hasMediaUrl;
    if (typeof hasMediaUrl === "boolean") {
      return hasMediaUrl;
    }

    return true;
  }

  function normalizeMessage(messageEntry: Message): Message {
    return {
      ...messageEntry,
      senderUserId: messageEntry.senderUserId ?? null,
      messageType: resolveMessageType(messageEntry),
      mediaUrl: messageEntry.mediaUrl ?? null,
      mediaMimeType: messageEntry.mediaMimeType ?? null,
      mediaFileName: messageEntry.mediaFileName ?? null,
      mediaFileSizeBytes: messageEntry.mediaFileSizeBytes ?? null,
      mediaCaption: messageEntry.mediaCaption ?? null,
      mediaDurationSeconds: messageEntry.mediaDurationSeconds ?? null,
      metadataJson: messageEntry.metadataJson ?? null
    };
  }

  function resolveAttachmentType(file: File, mode: AttachmentPickerMode): MessageType {
    if (mode === "sticker") {
      return "IMAGE";
    }

    if (mode === "gif") {
      const mime = file.type.toLowerCase();
      return mime.startsWith("video/") ? "VIDEO" : "IMAGE";
    }

    if (mode === "document") {
      return "DOCUMENT";
    }

    const mime = file.type.toLowerCase();

    if (mode === "audio") {
      return mime.startsWith("audio/") ? "AUDIO" : "DOCUMENT";
    }

    if (mime.startsWith("image/")) {
      return "IMAGE";
    }

    if (mime.startsWith("video/")) {
      return "VIDEO";
    }

    if (mime.startsWith("audio/")) {
      return "AUDIO";
    }

    return "DOCUMENT";
  }

  function revokeAttachmentPreview() {
    const url = attachment.value?.previewUrl;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  function clearAttachment(options?: { revokePreview?: boolean }) {
    if (options?.revokePreview !== false) {
      revokeAttachmentPreview();
    }
    attachment.value = null;
  }

  function setAttachmentFromFile(file: File | null, mode: AttachmentPickerMode) {
    clearAttachment();

    if (!file) {
      return;
    }

    if (file.size > maxAttachmentSizeBytes.value) {
      sendError.value = `Arquivo acima do limite do tenant (${tenantMaxUploadMb.value}MB por arquivo).`;
      return;
    }

    const type = resolveAttachmentType(file, mode);
    const previewUrl =
      type === "IMAGE" || type === "VIDEO" || type === "AUDIO"
        ? URL.createObjectURL(file)
        : null;

    attachment.value = {
      file,
      type,
      previewUrl,
      sendAsSticker: mode === "sticker"
    };
    sendError.value = "";
  }

  async function readFileAsDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string" && reader.result.trim().length > 0) {
          resolve(reader.result);
          return;
        }

        reject(new Error("Falha ao ler o arquivo selecionado"));
      };
      reader.onerror = () => {
        reject(new Error("Falha ao ler o arquivo selecionado"));
      };
      reader.readAsDataURL(file);
    });
  }

  function buildReplyMetadata(messageEntry: Message) {
    const type = resolveMessageType(messageEntry);
    const fallbackByType: Record<MessageType, string> = {
      TEXT: "",
      IMAGE: "[imagem]",
      AUDIO: "[audio]",
      VIDEO: "[video]",
      DOCUMENT: "[documento]"
    };

    const content = messageEntry.content?.trim() || fallbackByType[type];

    return {
      messageId: messageEntry.id,
      author: messageEntry.direction === "OUTBOUND" ? "Voce" : messageEntry.senderName?.trim() || "Contato",
      content: content.slice(0, 280),
      messageType: type,
      mediaUrl: messageEntry.mediaUrl ?? null,
      authorJid: messageEntry.direction === "INBOUND"
        ? (typeof messageEntry.metadataJson?.participantJid === "string"
            ? messageEntry.metadataJson.participantJid
            : null)
        : null
    };
  }

  function extractMentionsFromText(value: string) {
    const text = value.trim();
    if (!text) {
      return null;
    }

    const everyOne = /(^|\s)@(all|todos)(?=\s|$)/i.test(text);
    const mentioned = new Set<string>();
    const regex = /@(\d{7,20})(?=\b)/g;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const digits = match[1]?.replace(/\D/g, "");
      if (!digits) {
        continue;
      }
      mentioned.add(`${digits}@s.whatsapp.net`);
    }

    if (!everyOne && mentioned.size === 0) {
      return null;
    }

    return {
      everyOne,
      mentioned: [...mentioned]
    };
  }

  function normalizeMentionJid(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }

    const digits = trimmed.replace(/\D/g, "");
    if (!digits) {
      return null;
    }

    return `${digits}@s.whatsapp.net`;
  }

  function normalizeOutboundLinkUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const candidate = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function extractFirstOutboundLinkUrl(value: string) {
    const text = value.trim();
    if (!text) {
      return null;
    }

    const match = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
    if (!match) {
      return null;
    }

    const candidate = match[0].replace(/[),.!?;:]+$/g, "");
    return normalizeOutboundLinkUrl(candidate);
  }

  function buildOutboundLinkPreviewMetadata(value: string, enabled: boolean) {
    const url = extractFirstOutboundLinkUrl(value);
    if (!url) {
      return null;
    }

    let host: string | null = null;
    try {
      host = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      host = null;
    }

    return {
      enabled,
      url,
      title: host || url,
      source: "composer"
    };
  }

  function mediaPlaceholderByType(type: MessageType) {
    if (type === "IMAGE") {
      return "[imagem]";
    }

    if (type === "AUDIO") {
      return "[audio]";
    }

    if (type === "VIDEO") {
      return "[video]";
    }

    if (type === "DOCUMENT") {
      return "[documento]";
    }

    return "";
  }

  function createOptimisticMessage(options: OptimisticMessageOptions): Message {
    const nowIso = new Date().toISOString();
    const generatedId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const type = options.attachment?.type ?? "TEXT";
    const normalizedText = options.text.trim();
    const isSticker = Boolean(options.attachment?.sendAsSticker);
    const placeholderContent = isSticker ? "[figurinha]" : mediaPlaceholderByType(type);
    const metadataJson: Record<string, unknown> = {};

    if (options.reply) {
      metadataJson.reply = buildReplyMetadata(options.reply);
    }

    if (isSticker) {
      metadataJson.media = {
        sendAsSticker: true,
        kind: "sticker"
      };
      metadataJson.sticker = {
        source: "composer"
      };
    }

    return normalizeMessage({
      id: generatedId,
      tenantId: user.value?.tenantId ?? "temp-tenant",
      conversationId: options.conversationId,
      senderUserId: user.value?.id ?? null,
      direction: "OUTBOUND",
      messageType: type,
      senderName: user.value?.name ?? "Voce",
      senderAvatarUrl: null,
      content: normalizedText || placeholderContent,
      mediaUrl: options.attachment?.previewUrl ?? null,
      mediaMimeType: options.attachment?.file.type || null,
      mediaFileName: options.attachment?.file.name ?? null,
      mediaFileSizeBytes: options.attachment?.file.size ?? null,
      mediaCaption: isSticker ? null : (normalizedText || null),
      mediaDurationSeconds: null,
      metadataJson: Object.keys(metadataJson).length > 0 ? metadataJson : null,
      status: "PENDING",
      externalMessageId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }

  function sortConversations() {
    const conversationsList = toArrayOrEmpty<Conversation>(conversations.value);
    conversations.value = conversationsList.sort((left, right) => {
      return Number(new Date(right.lastMessageAt)) - Number(new Date(left.lastMessageAt));
    });
  }

  function mergeMessages(...chunks: Message[][]) {
    const map = new Map<string, Message>();

    for (const chunk of chunks) {
      for (const messageEntry of chunk) {
        const previous = map.get(messageEntry.id);
        const nextMessage = normalizeMessage(messageEntry);
        const mergedMessage = previous
          ? normalizeMessage({
              ...previous,
              ...nextMessage,
              mediaUrl: nextMessage.mediaUrl ?? previous.mediaUrl ?? null,
              mediaMimeType: nextMessage.mediaMimeType ?? previous.mediaMimeType ?? null,
              mediaFileName: nextMessage.mediaFileName ?? previous.mediaFileName ?? null,
              mediaFileSizeBytes: nextMessage.mediaFileSizeBytes ?? previous.mediaFileSizeBytes ?? null,
              mediaCaption: nextMessage.mediaCaption ?? previous.mediaCaption ?? null,
              mediaDurationSeconds: nextMessage.mediaDurationSeconds ?? previous.mediaDurationSeconds ?? null,
              metadataJson: nextMessage.metadataJson ?? previous.metadataJson ?? null
            })
          : nextMessage;
        map.set(messageEntry.id, {
          ...mergedMessage
        });
      }
    }

    return [...map.values()].sort((left, right) => {
      const leftTime = Number(new Date(left.createdAt));
      const rightTime = Number(new Date(right.createdAt));

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.id.localeCompare(right.id);
    });
  }

  function getReadAt(conversationId: string) {
    const entry = readState.value[conversationId];
    if (!entry?.lastReadAt) {
      return null;
    }

    const timestamp = Number(new Date(entry.lastReadAt));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function loadReadState() {
    if (!import.meta.client) {
      return;
    }

    const raw = localStorage.getItem(readStateStorageKey.value);
    if (!raw) {
      readState.value = {};
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, ReadStateEntry>;
      readState.value = parsed;
    } catch {
      readState.value = {};
    }
  }

  function saveReadState() {
    if (!import.meta.client) {
      return;
    }

    localStorage.setItem(readStateStorageKey.value, JSON.stringify(readState.value));
  }

  function bootstrapReadState() {
    if (Object.keys(readState.value).length > 0) {
      return;
    }

    const nextState: Record<string, ReadStateEntry> = {};

    for (const conversationEntry of conversations.value) {
      nextState[conversationEntry.id] = {
        lastReadAt: conversationEntry.lastMessageAt,
        lastReadMessageId: conversationEntry.lastMessage?.id ?? null
      };
    }

    readState.value = nextState;
    saveReadState();
  }

  function markConversationAsRead(messageEntry?: Message) {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return;
    }

    const targetMessage = messageEntry ?? messages.value[messages.value.length - 1];
    if (!targetMessage) {
      return;
    }

    const currentReadAt = getReadAt(conversationId);
    const nextReadAt = Number(new Date(targetMessage.createdAt));

    if (currentReadAt && currentReadAt >= nextReadAt) {
      return;
    }

    readState.value = {
      ...readState.value,
      [conversationId]: {
        lastReadAt: targetMessage.createdAt,
        lastReadMessageId: targetMessage.id
      }
    };
    saveReadState();
    clearMentionAlert(conversationId);
  }

  function isConversationUnread(conversationEntry: Conversation) {
    const readAt = getReadAt(conversationEntry.id);

    if (!readAt) {
      return false;
    }

    return Number(new Date(conversationEntry.lastMessageAt)) > readAt;
  }

  function incrementMentionAlert(conversationId: string, amount = 1) {
    if (!conversationId) {
      return;
    }

    const normalizedAmount = Number.isFinite(amount) ? Math.max(1, Math.trunc(amount)) : 1;
    const currentCount = mentionAlertState.value[conversationId] ?? 0;

    mentionAlertState.value = {
      ...mentionAlertState.value,
      [conversationId]: currentCount + normalizedAmount
    };
  }

  function clearMentionAlert(conversationId: string) {
    if (!conversationId) {
      return;
    }

    if (!mentionAlertState.value[conversationId]) {
      return;
    }

    const nextState = {
      ...mentionAlertState.value
    };
    delete nextState[conversationId];
    mentionAlertState.value = nextState;
  }

  function messageHasMentions(messageEntry: Message) {
    const metadata = asRecord(messageEntry.metadataJson);
    const mentions = metadata ? asRecord(metadata.mentions) : null;
    if (!mentions) {
      return false;
    }

    if (mentions.everyOne === true) {
      return true;
    }

    return Array.isArray(mentions.mentioned) && mentions.mentioned.length > 0;
  }

  function shouldFlagMentionAlert(messageEntry: Message) {
    if (messageEntry.direction !== "INBOUND") {
      return false;
    }

    const conversationEntry = conversations.value.find((entry) => entry.id === messageEntry.conversationId);
    if (!conversationEntry?.externalId.endsWith("@g.us")) {
      return false;
    }

    return messageHasMentions(messageEntry);
  }

  function upsertConversation(conversationEntry: Conversation) {
    const index = conversations.value.findIndex((item) => item.id === conversationEntry.id);
    if (index >= 0) {
      conversations.value[index] = {
        ...conversations.value[index],
        ...conversationEntry
      };
    } else {
      conversations.value.push(conversationEntry);
    }

    sortConversations();

    if (activeConversationId.value === conversationEntry.id) {
      assigneeModel.value = conversationEntry.assignedToId ?? UNASSIGNED_VALUE;
    }
  }

  function updateConversationPreviewFromMessage(messageEntry: Message) {
    const conversationEntry = conversations.value.find((item) => item.id === messageEntry.conversationId);
    if (!conversationEntry) {
      return;
    }

    const normalizedMessage = normalizeMessage(messageEntry);
    const previewContent =
      normalizedMessage.content?.trim() ||
      (normalizedMessage.messageType !== "TEXT"
        ? normalizedMessage.mediaCaption?.trim() ||
          (normalizedMessage.messageType === "IMAGE"
            ? isStickerMessage(normalizedMessage)
              ? "[figurinha]"
              : "[imagem]"
            : normalizedMessage.messageType === "AUDIO"
              ? "[audio]"
              : normalizedMessage.messageType === "VIDEO"
                ? "[video]"
                : "[documento]")
        : "");

    conversationEntry.lastMessageAt = messageEntry.createdAt;
    conversationEntry.status = "OPEN";
    conversationEntry.lastMessage = {
      id: normalizedMessage.id,
      content: previewContent,
      messageType: normalizedMessage.messageType,
      mediaUrl: normalizedMessage.mediaUrl,
      direction: normalizedMessage.direction,
      status: normalizedMessage.status,
      createdAt: normalizedMessage.createdAt
    };

    sortConversations();
  }

  function conversationMatchesMentionTarget(
    conversationEntry: Conversation,
    targetJid: string | null,
    targetPhone: string | null
  ) {
    if (conversationEntry.channel !== "WHATSAPP") {
      return false;
    }

    const conversationJid = normalizeComparableJid(conversationEntry.externalId);
    const conversationPhone = normalizePhoneDigits(conversationEntry.externalId);

    if (targetJid && conversationJid && conversationJid === targetJid) {
      return true;
    }

    if (targetPhone && conversationPhone) {
      if (conversationPhone.endsWith(targetPhone) || targetPhone.endsWith(conversationPhone)) {
        return true;
      }
    }

    return false;
  }

  async function openMentionConversation(payload: MentionOpenPayload) {
    const targetJid = normalizeComparableJid(payload.jid) ?? normalizeComparableJid(payload.phone);
    const targetPhone = normalizePhoneDigits(payload.phone) ?? normalizePhoneDigits(payload.jid);

    if (!targetJid && !targetPhone) {
      return;
    }

    const existingConversation = conversations.value.find((conversationEntry) =>
      conversationMatchesMentionTarget(conversationEntry, targetJid, targetPhone)
    );

    if (existingConversation) {
      await selectConversation(existingConversation.id);
      return;
    }

    if (!canManageConversation.value) {
      sendError.value = "Seu perfil nao pode criar conversa a partir de mencao.";
      return;
    }

    const externalId =
      (targetJid && targetJid.endsWith("@s.whatsapp.net") ? targetJid : null) ??
      (targetPhone ? `${targetPhone}@s.whatsapp.net` : null) ??
      targetJid;
    if (!externalId) {
      return;
    }

    try {
      const createdConversation = await apiFetch<Conversation>("/conversations", {
        method: "POST",
        body: {
          channel: "WHATSAPP",
          externalId,
          contactName: payload.label?.trim() || undefined,
          contactPhone: targetPhone || undefined
        }
      });

      upsertConversation(createdConversation);
      await selectConversation(createdConversation.id);
    } catch (error) {
      sendError.value = formatSendError(error, "Nao foi possivel abrir a conversa da mencao.");
    }
  }

  async function fetchMessagesPage(conversationId: string, beforeId?: string) {
    const query = new URLSearchParams({
      limit: String(MESSAGE_PAGE_SIZE)
    });

    if (beforeId) {
      query.set("beforeId", beforeId);
    }

    return apiFetch<MessagesPageResponse>(`/conversations/${conversationId}/messages?${query.toString()}`);
  }

  async function fetchMessageById(conversationId: string, messageId: string) {
    return apiFetch<Message>(`/conversations/${conversationId}/messages/${messageId}`);
  }

  async function hydrateRealtimeMediaMessage(conversationId: string, messageId: string) {
    const key = `${conversationId}:${messageId}`;
    if (realtimeMessageHydrationLocks.has(key)) {
      return;
    }

    realtimeMessageHydrationLocks.add(key);
    const delays = [0, 350, 900, 1800];

    try {
      for (const delay of delays) {
        if (delay > 0) {
          await wait(delay);
        }

        try {
          const messageEntry = normalizeMessage(await fetchMessageById(conversationId, messageId));
          messages.value = mergeMessages(messages.value, [messageEntry]);
          updateConversationPreviewFromMessage(messageEntry);

          if (!messageNeedsMediaHydration(messageEntry)) {
            return;
          }
        } catch {
          // best-effort hydration for realtime payloads sanitized by the API.
        }
      }
    } finally {
      realtimeMessageHydrationLocks.delete(key);
    }
  }

  async function sendConversationMessage(
    conversationId: string,
    payload: Record<string, unknown>,
    forceDirect = false,
    timeoutMs = 90_000
  ) {
    const path = `/conversations/${conversationId}/messages`;

    if (!forceDirect || !import.meta.client || !token.value) {
      return apiFetch<Message>(path, {
        method: "POST",
        body: payload
      });
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${config.public.apiBase}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      window.clearTimeout(timeout);

      // Fallback para o BFF em caso de CORS/timeout/rede no fetch direto.
      return apiFetch<Message>(path, {
        method: "POST",
        body: payload,
        timeout: Math.max(120_000, timeoutMs + 30_000)
      });
    } finally {
      window.clearTimeout(timeout);
    }

    const responseText = await response.text();
    let responseData: unknown = null;
    if (responseText.length > 0) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }
    }

    if (!response.ok) {
      const responseRecord = asRecord(responseData);
      const fallbackMessage =
        responseRecord && typeof responseRecord.message === "string"
          ? responseRecord.message
          : `Falha ao enviar mensagem (${response.status})`;
      const errorCode = responseRecord && typeof responseRecord.code === "string" ? responseRecord.code : null;
      const errorMessage = formatUploadApiError(
        errorCode,
        responseRecord ? asRecord(responseRecord.details) : null,
        fallbackMessage
      );
      throw new Error(errorMessage);
    }

    return responseData as Message;
  }

  function wait(ms: number) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function reconcilePendingMessageStatus(conversationId: string, messageId: string) {
    const delays = [1_500, 3_000, 6_000, 10_000, 20_000];

    for (const delay of delays) {
      await wait(delay);

      try {
        const response = await fetchMessagesPage(conversationId);
        const target = response.messages.find((entry) => entry.id === messageId);
        if (!target) {
          continue;
        }

        const normalizedTarget = normalizeMessage(target);
        messages.value = mergeMessages(messages.value, [normalizedTarget]);
        updateConversationPreviewFromMessage(normalizedTarget);

        if (normalizedTarget.status !== "PENDING") {
          return;
        }
      } catch {
        // Polling fallback is best-effort when realtime updates are delayed.
      }
    }
  }

  async function loadTenantUploadLimit() {
    try {
      const tenantSettings = await apiFetch<TenantSettings>("/tenant");
      tenantMaxUploadMb.value = normalizeTenantUploadLimitMb(tenantSettings.maxUploadMb);
    } catch {
      tenantMaxUploadMb.value = DEFAULT_MAX_UPLOAD_MB;
    }
  }

  async function loadWhatsAppStatus() {
    loadingWhatsAppStatus.value = true;
    try {
      const statusResponse = await apiFetch<WhatsAppStatusResponse>("/tenant/whatsapp/status");
      whatsappStatus.value = statusResponse;
    } catch {
      whatsappStatus.value = {
        configured: false,
        message: "Nao foi possivel consultar status do canal WhatsApp."
      };
    } finally {
      loadingWhatsAppStatus.value = false;
    }
  }

  async function loadUsers() {
    loadingUsers.value = true;
    try {
      const response = await apiFetch<unknown>("/users");
      users.value = toArrayOrEmpty<TenantUser>(response);
    } finally {
      loadingUsers.value = false;
    }
  }

  async function loadConversations() {
    loadingConversations.value = true;
    try {
      const response = await apiFetch<unknown>("/conversations");
      conversations.value = toArrayOrEmpty<Conversation>(response);
      const conversationIds = new Set(conversations.value.map((entry) => entry.id));
      mentionAlertState.value = Object.fromEntries(
        Object.entries(mentionAlertState.value).filter(([conversationId, count]) => {
          return Number(count) > 0 && conversationIds.has(conversationId);
        })
      );
      sortConversations();
      bootstrapReadState();

      if (!activeConversationId.value && conversations.value.length > 0) {
        await selectConversation(conversations.value[0].id);
      }
    } finally {
      loadingConversations.value = false;
    }
  }

  async function ensureUnreadBoundaryLoaded(conversationId: string) {
    const readAt = getReadAt(conversationId);
    if (!readAt) {
      return;
    }

    let guard = 0;

    while (
      hasMoreMessages.value &&
      messages.value.length > 0 &&
      Number(new Date(messages.value[0].createdAt)) > readAt &&
      guard < 6
    ) {
      const oldestId = messages.value[0].id;
      const response = await fetchMessagesPage(conversationId, oldestId);
      messages.value = mergeMessages(response.messages, messages.value);
      hasMoreMessages.value = response.hasMore;
      guard += 1;
    }
  }

  async function loadConversationMessages(conversationId: string) {
    loadingMessages.value = true;
    try {
      const response = await fetchMessagesPage(conversationId);
      messages.value = mergeMessages(response.messages);
      hasMoreMessages.value = response.hasMore;

      await ensureUnreadBoundaryLoaded(conversationId);
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadGroupParticipants(conversationId: string, force = false) {
    const conversationEntry = conversations.value.find((entry) => entry.id === conversationId);
    if (!conversationEntry?.externalId.endsWith("@g.us")) {
      groupParticipantsByConversation[conversationId] = [];
      return;
    }

    if (!force && groupParticipantsByConversation[conversationId]?.length) {
      return;
    }

    loadingGroupParticipants.value = true;
    try {
      const response = await apiFetch<GroupParticipantsResponse>(
        `/conversations/${conversationId}/group-participants`
      );
      groupParticipantsByConversation[conversationId] = response.participants ?? [];
    } catch {
      if (!groupParticipantsByConversation[conversationId]) {
        groupParticipantsByConversation[conversationId] = [];
      }
    } finally {
      loadingGroupParticipants.value = false;
    }
  }

  function shouldRefreshGroupParticipantsFromMessage(messageEntry: Message) {
    const conversationEntry = conversations.value.find((entry) => entry.id === messageEntry.conversationId);
    if (!conversationEntry || !conversationEntry.externalId.endsWith("@g.us")) {
      return false;
    }

    if (messageEntry.direction !== "INBOUND") {
      return false;
    }

    return true;
  }

  function scheduleGroupParticipantsRefresh(messageEntry: Message, force = false) {
    if (!shouldRefreshGroupParticipantsFromMessage(messageEntry)) {
      return;
    }

    const conversationId = messageEntry.conversationId;
    const now = Date.now();
    const lastRunAt = groupParticipantsRefreshAtByConversation.get(conversationId) ?? 0;

    if (!force && now - lastRunAt < 12_000) {
      return;
    }

    groupParticipantsRefreshAtByConversation.set(conversationId, now);
    void loadGroupParticipants(conversationId, true);
  }

  async function loadOlderMessages() {
    if (!activeConversationId.value || !hasMoreMessages.value || loadingOlderMessages.value || !messages.value.length) {
      return;
    }

    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    loadingOlderMessages.value = true;

    try {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;
      const oldestMessageId = messages.value[0].id;

      const response = await fetchMessagesPage(activeConversationId.value, oldestMessageId);
      messages.value = mergeMessages(response.messages, messages.value);
      hasMoreMessages.value = response.hasMore;

      await nextTick();

      const nextHeight = container.scrollHeight;
      const diff = nextHeight - previousHeight;
      container.scrollTop = previousTop + diff;
    } finally {
      loadingOlderMessages.value = false;
    }
  }

  function scheduleStickyDateRefresh() {
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
    }

    scrollRaf = requestAnimationFrame(() => {
      refreshStickyDate();
      scrollRaf = null;
    });
  }

  function refreshStickyDate() {
    const container = chatBodyRef.value;
    if (!container) {
      showStickyDate.value = false;
      stickyDateLabel.value = "";
      return;
    }

    const rows = container.querySelectorAll<HTMLElement>(".chat-message-row");
    if (!rows.length) {
      showStickyDate.value = false;
      stickyDateLabel.value = "";
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

    stickyDateLabel.value = selectedRow.dataset.dateLabel ?? "";
    showStickyDate.value = container.scrollTop > 24 && stickyDateLabel.value.length > 0;
  }

  function scrollToBottom() {
    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  async function positionConversationOnOpen() {
    await nextTick();

    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    const unreadId = firstUnreadMessageId.value;

    if (unreadId) {
      const marker = document.getElementById("chat-unread-anchor");
      if (marker) {
        container.scrollTop = Math.max(marker.offsetTop - 24, 0);
      } else {
        const messageRow = document.getElementById(messageRowId(unreadId));
        if (messageRow) {
          container.scrollTop = Math.max(messageRow.offsetTop - 24, 0);
        } else {
          scrollToBottom();
        }
      }
    } else {
      scrollToBottom();
      markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  async function selectConversation(conversationId: string) {
    activeConversationId.value = conversationId;
    draft.value = "";
    replyTarget.value = null;
    clearAttachment();
    assigneeModel.value = conversations.value.find((entry) => entry.id === conversationId)?.assignedToId ?? UNASSIGNED_VALUE;

    await loadConversationMessages(conversationId);
    void loadGroupParticipants(conversationId);
    await positionConversationOnOpen();
  }

  function onChatScroll() {
    const container = chatBodyRef.value;
    if (!container) {
      return;
    }

    if (container.scrollTop < 96) {
      void loadOlderMessages();
    }

    if (isNearBottom(container)) {
      markConversationAsRead();
    }

    scheduleStickyDateRefresh();
  }

  function onChatBodyMounted(element: HTMLElement | null) {
    chatBodyRef.value = element;
  }

  function setReplyTarget(messageEntry: Message) {
    replyTarget.value = messageEntry;
  }

  function clearReplyTarget() {
    replyTarget.value = null;
  }

  function updateDraft(value: string) {
    draft.value = value;
  }

  function updateAttachment(payload: AttachmentSelectionPayload) {
    setAttachmentFromFile(payload.file, payload.mode);
  }

  function updateSearch(value: string) {
    search.value = value;
  }

  function updateChannel(value: string) {
    channel.value = value;
  }

  function updateStatus(value: string) {
    status.value = value;
  }

  function updateShowFilters(value: boolean) {
    showFilters.value = value;
  }

  function updateLeftCollapsed(value: boolean) {
    leftCollapsed.value = value;
  }

  function updateRightCollapsed(value: boolean) {
    rightCollapsed.value = value;
  }

  function updateAssigneeModel(value: string) {
    assigneeModel.value = value;
  }

  function updateInternalNotes(value: string) {
    internalNotes.value = value;
  }

  function closeConversation() {
    void updateConversationStatus("CLOSED");
  }

  function buildOutboundMetadataJson(params: {
    reply: Message | null;
    text: string;
    mentionedJids?: string[];
    linkPreviewEnabled?: boolean;
    attachment?: OutboundAttachment | null;
  }) {
    const metadataJson: Record<string, unknown> = {};

    if (params.reply) {
      metadataJson.reply = buildReplyMetadata(params.reply);
    }

    if (isGroupConversation.value) {
      const byText = params.text ? extractMentionsFromText(params.text) : null;
      const explicitMentioned = (params.mentionedJids ?? [])
        .map((entry) => normalizeMentionJid(entry))
        .filter((entry): entry is string => Boolean(entry));

      const mergedMentioned = [...new Set([...(byText?.mentioned ?? []), ...explicitMentioned])];
      const everyOne = Boolean(byText?.everyOne);

      if (everyOne || mergedMentioned.length > 0) {
        metadataJson.mentions = {
          everyOne,
          mentioned: mergedMentioned
        };
      }
    }

    if (params.attachment?.sendAsSticker) {
      metadataJson.media = {
        ...(asRecord(metadataJson.media) ?? {}),
        sendAsSticker: true,
        kind: "sticker"
      };
      if (!params.text.trim()) {
        metadataJson.sticker = {
          source: "composer"
        };
      }
    }

    if (!params.attachment) {
      const linkPreview = buildOutboundLinkPreviewMetadata(params.text, params.linkPreviewEnabled !== false);
      if (linkPreview) {
        metadataJson.linkPreview = linkPreview;
      }
    }

    return metadataJson;
  }

  async function buildMediaMessagePayload(params: {
    type: MessageType;
    text: string;
    attachment: OutboundAttachment;
    metadataJson: Record<string, unknown>;
  }) {
    const mediaUrl = await readFileAsDataUrl(params.attachment.file);
    const payload: Record<string, unknown> = {
      type: params.type,
      content: params.text || undefined,
      mediaUrl,
      mediaMimeType: params.attachment.file.type || undefined,
      mediaFileName: params.attachment.file.name,
      mediaFileSizeBytes: params.attachment.file.size
    };

    if (params.type !== "AUDIO") {
      payload.mediaCaption = params.text || undefined;
    }

    if (Object.keys(params.metadataJson).length > 0) {
      payload.metadataJson = params.metadataJson;
    }

    return payload;
  }

  async function buildImageMessagePayload(params: {
    text: string;
    attachment: OutboundAttachment;
    metadataJson: Record<string, unknown>;
  }) {
    return buildMediaMessagePayload({
      type: "IMAGE",
      text: params.text,
      attachment: params.attachment,
      metadataJson: params.metadataJson
    });
  }

  async function buildVideoMessagePayload(params: {
    text: string;
    attachment: OutboundAttachment;
    metadataJson: Record<string, unknown>;
  }) {
    return buildMediaMessagePayload({
      type: "VIDEO",
      text: params.text,
      attachment: params.attachment,
      metadataJson: params.metadataJson
    });
  }

  async function buildDocumentMessagePayload(params: {
    text: string;
    attachment: OutboundAttachment;
    metadataJson: Record<string, unknown>;
  }) {
    return buildMediaMessagePayload({
      type: "DOCUMENT",
      text: params.text,
      attachment: params.attachment,
      metadataJson: params.metadataJson
    });
  }

  async function buildAudioMessagePayload(params: {
    text: string;
    attachment: OutboundAttachment;
    metadataJson: Record<string, unknown>;
  }) {
    return buildMediaMessagePayload({
      type: "AUDIO",
      text: params.text,
      attachment: params.attachment,
      metadataJson: params.metadataJson
    });
  }

  async function buildOutboundRequestPayload(params: {
    text: string;
    attachment: OutboundAttachment | null;
    metadataJson: Record<string, unknown>;
  }) {
    if (!params.attachment) {
      const payload: Record<string, unknown> = {
        type: "TEXT",
        content: params.text
      };

      if (Object.keys(params.metadataJson).length > 0) {
        payload.metadataJson = params.metadataJson;
      }

      return payload;
    }

    const outboundText = params.attachment.sendAsSticker ? "" : params.text;

    if (params.attachment.type === "IMAGE") {
      return buildImageMessagePayload({
        text: outboundText,
        attachment: params.attachment,
        metadataJson: params.metadataJson
      });
    }

    if (params.attachment.type === "VIDEO") {
      return buildVideoMessagePayload({
        text: outboundText,
        attachment: params.attachment,
        metadataJson: params.metadataJson
      });
    }

    if (params.attachment.type === "DOCUMENT") {
      return buildDocumentMessagePayload({
        text: outboundText,
        attachment: params.attachment,
        metadataJson: params.metadataJson
      });
    }

    return buildAudioMessagePayload({
      text: outboundText,
      attachment: params.attachment,
      metadataJson: params.metadataJson
    });
  }

  function resolveDirectTimeoutMs(attachmentEntry: OutboundAttachment | null) {
    if (!attachmentEntry) {
      return 90_000;
    }

    const baseByType: Record<MessageType, number> = {
      TEXT: 90_000,
      IMAGE: 120_000,
      VIDEO: 240_000,
      AUDIO: 120_000,
      DOCUMENT: 180_000
    };

    const perMbMsByType: Record<MessageType, number> = {
      TEXT: 0,
      IMAGE: 25_000,
      VIDEO: 40_000,
      AUDIO: 20_000,
      DOCUMENT: 30_000
    };

    const sizeInMb = Math.max(1, Math.ceil(attachmentEntry.file.size / (1024 * 1024)));
    const base = baseByType[attachmentEntry.type];
    const perMb = perMbMsByType[attachmentEntry.type];

    return Math.min(300_000, Math.max(base, sizeInMb * perMb));
  }

  async function sendMessage(options?: SendMessageOptions) {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return;
    }

    if (!activeConversationId.value) {
      return;
    }

    const conversationId = activeConversationId.value;
    const text = draft.value.trim();
    const currentAttachment = attachment.value
      ? {
          ...attachment.value
        }
      : null;
    const currentReply = replyTarget.value;

    if (!text && !currentAttachment) {
      return;
    }

    sendError.value = "";
    pendingSendCount.value += 1;

    const optimisticMessage = createOptimisticMessage({
      conversationId,
      text,
      attachment: currentAttachment,
      reply: currentReply
    });

    messages.value = mergeMessages(messages.value, [optimisticMessage]);
    updateConversationPreviewFromMessage(optimisticMessage);
    draft.value = "";
    replyTarget.value = null;
    if (currentAttachment) {
      clearAttachment({ revokePreview: false });
    }

    try {
      const metadataJson = buildOutboundMetadataJson({
        reply: currentReply,
        text,
        mentionedJids: options?.mentionedJids,
        linkPreviewEnabled: options?.linkPreviewEnabled,
        attachment: currentAttachment
      });
      const body = await buildOutboundRequestPayload({
        text,
        attachment: currentAttachment,
        metadataJson
      });
      const directTimeoutMs = resolveDirectTimeoutMs(currentAttachment);

      const created = await sendConversationMessage(
        conversationId,
        body,
        Boolean(currentAttachment),
        directTimeoutMs
      );

      messages.value = mergeMessages(
        messages.value.filter((entry) => entry.id !== optimisticMessage.id),
        [created]
      );
      updateConversationPreviewFromMessage(created);

      await nextTick();
      scrollToBottom();
      markConversationAsRead(created);
      scheduleStickyDateRefresh();

      if (created.status === "PENDING") {
        void reconcilePendingMessageStatus(created.conversationId, created.id);
      }
    } catch (error) {
      messages.value = mergeMessages(
        messages.value,
        [
          {
            ...optimisticMessage,
            mediaUrl: null,
            status: "FAILED",
            updatedAt: new Date().toISOString()
          }
        ]
      );

      if (!currentAttachment && text && !draft.value.trim()) {
        draft.value = text;
      }

      if (!currentAttachment && currentReply && !replyTarget.value) {
        replyTarget.value = currentReply;
      }

      sendError.value = formatSendError(error);
    } finally {
      if (currentAttachment?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(currentAttachment.previewUrl);
      }
      pendingSendCount.value = Math.max(0, pendingSendCount.value - 1);
    }
  }

  function normalizeContactPhone(value: string) {
    const normalized = value.trim().replace(/[^\d+]/g, "");
    return normalized.length >= 7 ? normalized : "";
  }

  async function sendContactCard(payload: { name: string; phone: string }) {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return;
    }

    if (!activeConversationId.value) {
      return;
    }

    const conversationId = activeConversationId.value;
    const normalizedName = payload.name.trim();
    const normalizedPhone = normalizeContactPhone(payload.phone);
    if (!normalizedName && !normalizedPhone) {
      return;
    }

    const label = normalizedName || normalizedPhone;
    const content = `Contato: ${label}${normalizedPhone ? ` (${normalizedPhone})` : ""}`.trim();
    const metadataJson: Record<string, unknown> = {
      contact: {
        name: label,
        phone: normalizedPhone || undefined,
        source: "composer"
      }
    };

    sendError.value = "";
    pendingSendCount.value += 1;

    const nowIso = new Date().toISOString();
    const optimisticMessage = normalizeMessage({
      id: `temp-contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: user.value?.tenantId ?? "temp-tenant",
      conversationId,
      senderUserId: user.value?.id ?? null,
      direction: "OUTBOUND",
      messageType: "TEXT",
      senderName: user.value?.name ?? "Voce",
      senderAvatarUrl: null,
      content,
      mediaUrl: null,
      mediaMimeType: null,
      mediaFileName: null,
      mediaFileSizeBytes: null,
      mediaCaption: null,
      mediaDurationSeconds: null,
      metadataJson,
      status: "PENDING",
      externalMessageId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    messages.value = mergeMessages(messages.value, [optimisticMessage]);
    updateConversationPreviewFromMessage(optimisticMessage);

    try {
      const created = await sendConversationMessage(conversationId, {
        type: "TEXT",
        content,
        metadataJson
      });

      messages.value = mergeMessages(
        messages.value.filter((entry) => entry.id !== optimisticMessage.id),
        [created]
      );
      updateConversationPreviewFromMessage(created);
      await nextTick();
      scrollToBottom();
      markConversationAsRead(created);
      scheduleStickyDateRefresh();

      if (created.status === "PENDING") {
        void reconcilePendingMessageStatus(created.conversationId, created.id);
      }
    } catch (error) {
      messages.value = mergeMessages(
        messages.value,
        [
          {
            ...optimisticMessage,
            status: "FAILED",
            updatedAt: new Date().toISOString()
          }
        ]
      );
      updateConversationPreviewFromMessage({
        ...optimisticMessage,
        status: "FAILED"
      });
      sendError.value = formatSendError(error, "Nao foi possivel enviar contato.");
    } finally {
      pendingSendCount.value = Math.max(0, pendingSendCount.value - 1);
    }
  }

  function normalizeReactionEmoji(value: string | null | undefined) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      return null;
    }

    return [...trimmed].slice(0, 8).join("") || null;
  }

  function getMessageReactionItems(messageEntry: Message) {
    const metadata = asRecord(messageEntry.metadataJson);
    const reactions = metadata ? asRecord(metadata.reactions) : null;
    const items = Array.isArray(reactions?.items) ? reactions.items : [];
    return items
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        actorKey: typeof item.actorKey === "string" ? item.actorKey : "",
        actorUserId: typeof item.actorUserId === "string" ? item.actorUserId : null,
        actorName: typeof item.actorName === "string" ? item.actorName : null,
        actorJid: typeof item.actorJid === "string" ? item.actorJid : null,
        emoji: normalizeReactionEmoji(typeof item.emoji === "string" ? item.emoji : null),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        source: item.source === "whatsapp" ? "whatsapp" : "agent"
      }))
      .filter((item) => item.actorKey.trim().length > 0 && Boolean(item.emoji));
  }

  function applyOptimisticReaction(params: {
    messageId: string;
    emoji: string | null;
    actorUserId: string | null;
    actorName: string | null;
  }) {
    const messageEntry = messages.value.find((entry) => entry.id === params.messageId);
    if (!messageEntry) {
      return;
    }

    const currentItems = getMessageReactionItems(messageEntry).filter(
      (entry) => entry.actorKey !== `user:${params.actorUserId ?? "unknown"}`
    );

    if (params.emoji) {
      currentItems.push({
        actorKey: `user:${params.actorUserId ?? "unknown"}`,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
        actorJid: null,
        emoji: params.emoji,
        updatedAt: new Date().toISOString(),
        source: "agent"
      });
    }

    const summary = currentItems.reduce<Record<string, number>>((accumulator, entry) => {
      const emoji = entry.emoji;
      if (!emoji) {
        return accumulator;
      }
      accumulator[emoji] = (accumulator[emoji] ?? 0) + 1;
      return accumulator;
    }, {});

    const metadata = asRecord(messageEntry.metadataJson) ?? {};
    const updatedMessage = normalizeMessage({
      ...messageEntry,
      metadataJson: {
        ...metadata,
        reactions: {
          items: currentItems,
          summary,
          updatedAt: new Date().toISOString()
        }
      },
      updatedAt: new Date().toISOString()
    });

    messages.value = mergeMessages(messages.value, [updatedMessage]);
    updateConversationPreviewFromMessage(updatedMessage);
  }

  async function reactToMessage(params: { messageId: string; emoji: string | null }) {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return;
    }

    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return;
    }

    const normalizedEmoji = normalizeReactionEmoji(params.emoji);
    sendError.value = "";

    applyOptimisticReaction({
      messageId: params.messageId,
      emoji: normalizedEmoji,
      actorUserId: user.value?.id ?? null,
      actorName: user.value?.name ?? null
    });

    try {
      const updated = await apiFetch<Message>(
        `/conversations/${conversationId}/messages/${params.messageId}/reaction`,
        {
          method: "POST",
          body: {
            emoji: normalizedEmoji
          }
        }
      );

      messages.value = mergeMessages(messages.value, [updated]);
      updateConversationPreviewFromMessage(updated);
    } catch (error) {
      sendError.value = formatSendError(error, "Nao foi possivel enviar a reacao.");
      void loadConversationMessages(conversationId);
    }
  }

  async function updateConversationStatus(statusValue: ConversationStatus) {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return;
    }

    if (!activeConversationId.value) {
      return;
    }

    updatingStatus.value = true;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${activeConversationId.value}/status`, {
        method: "PATCH",
        body: {
          status: statusValue
        }
      });

      upsertConversation(updated);
    } finally {
      updatingStatus.value = false;
    }
  }

  async function updateConversationAssignee(value: string) {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return;
    }

    if (!activeConversationId.value) {
      return;
    }

    updatingAssignee.value = true;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${activeConversationId.value}/assign`, {
        method: "PATCH",
        body: {
          assignedToId: value === UNASSIGNED_VALUE ? null : value
        }
      });

      upsertConversation(updated);
      assigneeModel.value = updated.assignedToId ?? UNASSIGNED_VALUE;
    } finally {
      updatingAssignee.value = false;
    }
  }

  async function openSandboxTestConversation() {
    if (!canManageConversation.value) {
      sendError.value = "Seu perfil e somente leitura nesta inbox.";
      return null;
    }

    const sandboxConversation = await apiFetch<Conversation>("/conversations/sandbox/test");
    upsertConversation(sandboxConversation);
    await selectConversation(sandboxConversation.id);
    return sandboxConversation;
  }

  function connectSocket() {
    if (!token.value || socket) {
      return;
    }

    socket = io(config.public.apiBase, {
      transports: ["websocket"],
      auth: {
        token: token.value
      }
    });

    socket.on("conversation.updated", (payload: Conversation) => {
      upsertConversation(payload);
    });

    socket.on("message.created", async (payload: Message) => {
      const normalizedPayload = normalizeMessage(payload);
      updateConversationPreviewFromMessage(normalizedPayload);
      scheduleGroupParticipantsRefresh(normalizedPayload);
      const hasMentionAlert = shouldFlagMentionAlert(normalizedPayload);

      if (normalizedPayload.conversationId === activeConversationId.value) {
        const shouldStickToBottom = isNearBottom(chatBodyRef.value);

        messages.value = mergeMessages(messages.value, [normalizedPayload]);
        await nextTick();

        if (normalizedPayload.direction === "OUTBOUND" || shouldStickToBottom) {
          scrollToBottom();
        }

        if (normalizedPayload.direction === "OUTBOUND" || shouldStickToBottom) {
          markConversationAsRead(normalizedPayload);
        }

        if (hasMentionAlert && !shouldStickToBottom) {
          incrementMentionAlert(normalizedPayload.conversationId);
        }

        if (messageNeedsMediaHydration(normalizedPayload)) {
          void hydrateRealtimeMediaMessage(normalizedPayload.conversationId, normalizedPayload.id);
        }

        scheduleStickyDateRefresh();
        return;
      }

      if (!conversations.value.find((entry) => entry.id === normalizedPayload.conversationId)) {
        await loadConversations();
      }

      if (hasMentionAlert) {
        incrementMentionAlert(normalizedPayload.conversationId);
      }
    });

    socket.on("message.updated", (payload: Partial<Message> & { id: string }) => {
      const payloadRecord = asRecord(payload);
      const messageId = payloadRecord && typeof payloadRecord.id === "string" ? payloadRecord.id : "";
      if (!messageId) {
        return;
      }

      const messageIndex = messages.value.findIndex((entry) => entry.id === messageId);
      let mergedMessage: Message | null = null;

      if (messageIndex >= 0) {
        mergedMessage = normalizeMessage({
          ...messages.value[messageIndex],
          ...payload
        } as Message);
        messages.value[messageIndex] = mergedMessage;
      }

      const isFullMessagePayload =
        payloadRecord !== null &&
        typeof payloadRecord.conversationId === "string" &&
        payloadRecord.conversationId.trim().length > 0 &&
        typeof payloadRecord.direction === "string" &&
        typeof payloadRecord.createdAt === "string";

      if (isFullMessagePayload) {
        const normalizedPayload = normalizeMessage(payload as Message);
        scheduleGroupParticipantsRefresh(normalizedPayload);
        if (normalizedPayload.conversationId === activeConversationId.value) {
          messages.value = mergeMessages(messages.value, [normalizedPayload]);
        }

        updateConversationPreviewFromMessage(normalizedPayload);

        if (messageNeedsMediaHydration(normalizedPayload)) {
          void hydrateRealtimeMediaMessage(normalizedPayload.conversationId, normalizedPayload.id);
        }

        if (
          shouldFlagMentionAlert(normalizedPayload) &&
          normalizedPayload.conversationId !== activeConversationId.value
        ) {
          incrementMentionAlert(normalizedPayload.conversationId);
        }

        return;
      }

      if (mergedMessage) {
        updateConversationPreviewFromMessage(mergedMessage);

        if (
          mergedMessage.conversationId === activeConversationId.value &&
          messageNeedsMediaHydration(mergedMessage)
        ) {
          void hydrateRealtimeMediaMessage(mergedMessage.conversationId, mergedMessage.id);
        }
      }

      for (const conversationEntry of conversations.value) {
        if (conversationEntry.lastMessage?.id !== messageId) {
          continue;
        }

        if (payload.status) {
          conversationEntry.lastMessage.status = payload.status;
        }

        if (typeof payload.content === "string" && payload.content.trim().length > 0) {
          conversationEntry.lastMessage.content = payload.content;
        }

        if (typeof payload.mediaUrl === "string" && payload.mediaUrl.trim().length > 0) {
          conversationEntry.lastMessage.mediaUrl = payload.mediaUrl;
        }

        break;
      }
    });
  }

  function disconnectSocket() {
    if (!socket) {
      return;
    }

    socket.disconnect();
    socket = null;
  }

  function stopWhatsAppStatusPolling() {
    if (!whatsappStatusPollTimer) {
      return;
    }

    clearInterval(whatsappStatusPollTimer);
    whatsappStatusPollTimer = null;
  }

  function startWhatsAppStatusPolling() {
    stopWhatsAppStatusPolling();
    whatsappStatusPollTimer = setInterval(() => {
      void loadWhatsAppStatus();
    }, 15_000);
  }

  function logout() {
    disconnectSocket();
    stopWhatsAppStatusPolling();
    clearSession();
    void navigateTo("/login");
  }

  onMounted(async () => {
    ensureAuthOrRedirect();
    if (!token.value) {
      return;
    }

    loadReadState();

    await Promise.all([loadTenantUploadLimit(), loadWhatsAppStatus(), loadUsers(), loadConversations()]);
    startWhatsAppStatusPolling();
    connectSocket();
  });

  onBeforeUnmount(() => {
    disconnectSocket();
    stopWhatsAppStatusPolling();
    groupParticipantsRefreshAtByConversation.clear();
    clearAttachment();
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  });

  return {
    user,
    leftCollapsed,
    rightCollapsed,
    showFilters,
    loadingConversations,
    loadingUsers,
    loadingWhatsAppStatus,
    loadingMessages,
    loadingOlderMessages,
    loadingGroupParticipants,
    pendingSendCount,
    sendingMessage,
    sendError,
    whatsappStatus,
    whatsappConnectionState,
    isWhatsAppConfigured,
    isWhatsAppConnected,
    whatsappBannerMessage,
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
    tenantMaxUploadMb,
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
    loadGroupParticipants,
    openMentionConversation,
    openSandboxTestConversation,
    logout
  };
}
