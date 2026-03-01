<script setup lang="ts">
import {
  UAvatar,
  UBadge,
  UButton,
  UCard,
  UDashboardPanel,
  UDashboardSidebarCollapse,
  UDashboardSidebarToggle,
  UDropdownMenu,
  UInput,
  UIcon,
  UTextarea
} from "#components";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Conversation, GroupParticipant, Message, MessageType, SavedSticker } from "~/types";
import type { InboxRenderItem } from "./types";
import InboxAudioMessagePlayer from "./InboxAudioMessagePlayer.vue";

type AttachmentPickerMode = "document" | "media" | "camera" | "audio" | "sticker" | "gif";
type MentionSendPayload = {
  mentionedJids: string[];
  linkPreviewEnabled?: boolean;
};
type MentionOpenPayload = {
  jid: string | null;
  phone: string | null;
  label: string | null;
};
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
type EmojiPanelTab = "emoji" | "gif" | "stickers";
type EmojiCategoryId =
  | "recents"
  | "smileys"
  | "gestures"
  | "nature"
  | "food"
  | "activities"
  | "travel"
  | "objects"
  | "symbols";
type EmojiCategoryDefinition = {
  id: Exclude<EmojiCategoryId, "recents">;
  label: string;
  icon: string;
  emojis: string[];
};

interface MessageReactionEntry {
  actorKey: string;
  actorUserId: string | null;
  actorName: string | null;
  actorJid: string | null;
  emoji: string;
}

interface MessageReactionBadge {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
  actors: string[];
}

interface GifSearchResultItem {
  id: string;
  title: string;
  previewUrl: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
}

interface SavedStickerItem {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt?: string;
  createdByUserId?: string | null;
}

const EMOJI_RECENTS_STORAGE_KEY = "omni:emoji-recents:v1";
const SAVED_STICKERS_MAX = 36;
const EMOJI_RECENTS_MAX = 24;
const EMOJI_PANEL_TAB_ITEMS: Array<{ id: EmojiPanelTab; label: string }> = [
  { id: "emoji", label: "Emoji" },
  { id: "gif", label: "GIF" },
  { id: "stickers", label: "Figurinhas" }
];
const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EMOJI_CATEGORY_DEFINITIONS: EmojiCategoryDefinition[] = [
  {
    id: "smileys",
    label: "Carinhas",
    icon: "😀",
    emojis: ["😀", "😄", "😁", "😆", "😂", "🤣", "😊", "😉", "🙂", "🙃", "😍", "😘", "😎", "🤩", "🥳", "🥺", "😭", "😡", "😴", "🤔", "😬", "😱", "😅", "🤗", "🫠", "😇", "😌", "🤤", "🤯", "🤠"]
  },
  {
    id: "gestures",
    label: "Pessoas",
    icon: "👍",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "🤝", "💪", "👌", "🤌", "🤏", "🤞", "✌️", "🤟", "👋", "🫶", "👊", "✍️", "🫡", "💃", "🕺", "👨‍💻", "👩‍💻", "🧑‍💼", "👨‍🏫", "👩‍🎓", "🙋", "🙇", "🤦", "🤷", "🧠"]
  },
  {
    id: "nature",
    label: "Natureza",
    icon: "🌿",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🩷", "🔥", "✨", "⭐", "⚡", "🌈", "☀️", "🌙", "🌎", "🌍", "🌸", "🌹", "🌻", "🍀", "🌴", "🐶", "🐱", "🐼", "🦊", "🦁", "🐵", "🦋", "🐝", "🌊"]
  },
  {
    id: "food",
    label: "Comidas",
    icon: "🍔",
    emojis: ["🍕", "🍔", "🍟", "🌭", "🌮", "🥪", "🍣", "🍜", "🍩", "🍪", "🍫", "🍿", "🍰", "☕", "🧃", "🥤", "🍺", "🍷", "🥂", "🍾", "🍎", "🍌", "🍇", "🍓", "🥑", "🥕", "🌽", "🍞", "🍗", "🍤"]
  },
  {
    id: "activities",
    label: "Atividades",
    icon: "⚽",
    emojis: ["⚽", "🏀", "🏐", "🎾", "🏆", "🎮", "🕹️", "🎯", "🎲", "🎸", "🎹", "🥁", "🎤", "🎧", "🎬", "📸", "🎉", "🎊", "🎈", "🧩", "🧘", "🏋️", "🚴", "🏃", "🏄", "🎣", "⛳", "🏓", "🥊", "🏅"]
  },
  {
    id: "travel",
    label: "Viagens",
    icon: "🚗",
    emojis: ["🚗", "🚕", "🚌", "🚓", "🚑", "🚒", "🚚", "🏍️", "✈️", "🚀", "🚁", "🚢", "⛵", "🚤", "🏠", "🏢", "🏬", "🏥", "🏫", "🏖️", "⛰️", "🗺️", "🧭", "⏰", "⌚", "📍", "🌆", "🌃", "🌉", "🛣️"]
  },
  {
    id: "objects",
    label: "Objetos",
    icon: "💡",
    emojis: ["📱", "💻", "⌚", "🎧", "📷", "📹", "💡", "🔋", "🔌", "📎", "📌", "🧷", "📁", "🗂️", "🧾", "💼", "🔒", "🔑", "🛠️", "⚙️", "🧰", "💳", "💵", "🧿", "🧴", "🧼", "🪥", "🛒", "🪪", "🛰️"]
  },
  {
    id: "symbols",
    label: "Simbolos",
    icon: "✅",
    emojis: ["✅", "☑️", "❌", "❗", "❓", "💯", "💢", "💬", "🔔", "🔕", "➕", "➖", "✖️", "➗", "↗️", "↘️", "↙️", "↖️", "🔁", "🔂", "🔄", "♻️", "⚠️", "🚫", "🔞", "🆘", "🆗", "🆒", "🟢", "🔵"]
  }
];
const EMOJI_KEYWORDS: Record<string, string[]> = {
  "😂": ["riso", "engracado", "kkk", "feliz"],
  "🤣": ["rir", "meme", "kkk"],
  "❤️": ["amor", "coracao", "love"],
  "😍": ["amor", "apaixonado", "lindo"],
  "😘": ["beijo", "amor"],
  "🔥": ["fogo", "top", "quente"],
  "😭": ["choro", "triste"],
  "🙏": ["obrigado", "gratidão", "fe", "amem"],
  "👍": ["ok", "joinha", "aprovado"],
  "👏": ["palmas", "parabens"],
  "🎉": ["festa", "comemorar"],
  "🎂": ["aniversario", "bolo"],
  "🥳": ["festa", "parabens"],
  "✅": ["certo", "confirmado", "check"],
  "❌": ["erro", "nao"],
  "⚠️": ["atencao", "alerta"],
  "💬": ["mensagem", "chat"],
  "📎": ["arquivo", "anexo"],
  "📞": ["telefone", "ligar"],
  "📍": ["local", "endereco"],
  "🎧": ["audio", "musica", "fone"],
  "🎤": ["voz", "microfone"]
};

const props = defineProps<{
  activeConversation: Conversation | null;
  activeConversationLabel: string | null;
  currentUserId: string | null;
  userRole: "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER" | null | undefined;
  canManageConversation: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  messageRenderItems: InboxRenderItem[];
  groupParticipants: GroupParticipant[];
  loadingGroupParticipants: boolean;
  showStickyDate: boolean;
  stickyDateLabel: string;
  isGroupConversation: boolean;
  draft: string;
  hasAttachment: boolean;
  attachmentType: MessageType | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  attachmentPreviewUrl: string | null;
  sendingMessage: boolean;
  sendError: string;
  replyTarget: Message | null;
}>();

const emit = defineEmits<{
  (event: "body-mounted", element: HTMLElement | null): void;
  (event: "chat-scroll", payload: Event): void;
  (event: "send", payload?: MentionSendPayload): void;
  (event: "open-mention", payload: MentionOpenPayload): void;
  (event: "close-conversation"): void;
  (event: "set-reply", messageEntry: Message): void;
  (event: "clear-reply"): void;
  (event: "set-reaction", value: { messageId: string; emoji: string | null }): void;
  (event: "send-contact", value: { name: string; phone: string }): void;
  (event: "update:draft", value: string): void;
  (event: "pick-attachment", value: { file: File | null; mode: AttachmentPickerMode }): void;
  (event: "clear-attachment"): void;
}>();
const { token } = useAuth();
const { apiFetch } = useApi();

const chatBodyRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const failedImageMessageIds = ref<Record<string, true>>({});
const mediaActionLoadingByMessageId = ref<Record<string, true>>({});
const pickerMode = ref<AttachmentPickerMode>("document");
const isRecording = ref(false);
const recordingElapsedMs = ref(0);
const recordingError = ref("");
const recordingStartedAt = ref<number | null>(null);
let recordingTicker: number | null = null;
let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let recorderChunks: Blob[] = [];
let discardRecordingOnStop = false;
let shouldAutoSendOnRecordingStop = false;
let recordingAudioContext: AudioContext | null = null;
let recordingAnalyser: AnalyserNode | null = null;
let recordingSourceNode: MediaStreamAudioSourceNode | null = null;
let recordingWaveRaf: number | null = null;
let replyFocusTimer: number | null = null;
const recordingWaveLevels = ref<number[]>(Array.from({ length: 42 }, () => 0.12));
const composerTextareaRef = ref<HTMLTextAreaElement | null>(null);
const mentionAnchorStart = ref<number | null>(null);
const mentionAnchorEnd = ref<number | null>(null);
const mentionQuery = ref("");
const mentionSelectedIndex = ref(0);
const draftMentionSelections = ref<Array<{ jid: string; label: string }>>([]);
const linkPreviewEnabled = ref(true);
const emojiPanelRef = ref<HTMLElement | null>(null);
const emojiPanelTab = ref<EmojiPanelTab>("emoji");
const emojiSearch = ref("");
const emojiCategory = ref<EmojiCategoryId>("recents");
const emojiPanelOpen = ref(false);
const recentEmojis = ref<string[]>([]);
const gifSearch = ref("");
const gifLoading = ref(false);
const gifError = ref("");
const gifResults = ref<GifSearchResultItem[]>([]);
const savedStickers = ref<SavedStickerItem[]>([]);
const savedStickersLoading = ref(false);
const stickerError = ref("");
let gifSearchTimer: number | null = null;
const MEDIA_PLACEHOLDER_VALUES = new Set(["[imagem]", "[audio]", "[video]", "[documento]", "[figurinha]", "."]);
const UNSUPPORTED_PLACEHOLDER_PREFIX = "[conteudo nao suportado:";

const draftModel = computed({
  get: () => props.draft,
  set: (value: string) => emit("update:draft", value)
});

const composerHasContent = computed(() => {
  return draftModel.value.trim().length > 0 || props.hasAttachment;
});

const isComposerReadOnly = computed(() => !props.canManageConversation);

const draftLinkUrl = computed(() => extractFirstLinkFromText(draftModel.value));
const showLinkPreviewToggle = computed(() => {
  return Boolean(draftLinkUrl.value && !props.hasAttachment);
});

const emojiCategoryDefinitionsMap = computed(() => {
  const map = new Map<EmojiCategoryId, { label: string; icon: string; emojis: string[] }>();
  map.set("recents", {
    label: "Recentes",
    icon: "🕘",
    emojis: recentEmojis.value.length > 0
      ? recentEmojis.value
      : EMOJI_CATEGORY_DEFINITIONS[0].emojis.slice(0, 24)
  });

  for (const entry of EMOJI_CATEGORY_DEFINITIONS) {
    map.set(entry.id, {
      label: entry.label,
      icon: entry.icon,
      emojis: entry.emojis
    });
  }

  return map;
});

const emojiCategories = computed(() => {
  return (["recents", ...EMOJI_CATEGORY_DEFINITIONS.map((entry) => entry.id)] as EmojiCategoryId[])
    .map((id) => {
      const definition = emojiCategoryDefinitionsMap.value.get(id);
      if (!definition) {
        return null;
      }

      return {
        id,
        label: definition.label,
        icon: definition.icon,
        emojis: definition.emojis
      };
    })
    .filter((entry): entry is { id: EmojiCategoryId; label: string; icon: string; emojis: string[] } => Boolean(entry));
});

const showEmojiCategoryTabs = computed(() => emojiSearch.value.trim().length === 0);

const filteredEmojiList = computed(() => {
  const normalizedQuery = normalizeNameForComparison(emojiSearch.value);
  const categories = emojiCategories.value;

  if (!normalizedQuery) {
    const activeCategory = categories.find((entry) => entry.id === emojiCategory.value) || categories[0];
    return activeCategory?.emojis ?? [];
  }

  const uniqueEmojis = new Set<string>();
  for (const category of categories) {
    for (const emoji of category.emojis) {
      uniqueEmojis.add(emoji);
    }
  }

  return [...uniqueEmojis].filter((emoji) => {
    if (emoji.includes(normalizedQuery)) {
      return true;
    }

    const keywords = EMOJI_KEYWORDS[emoji] ?? [];
    return keywords.some((keyword) => normalizeNameForComparison(keyword).includes(normalizedQuery));
  });
});

const activeEmojiCategoryLabel = computed(() => {
  const activeCategory = emojiCategories.value.find((entry) => entry.id === emojiCategory.value);
  return activeCategory?.label ?? "Emojis";
});

const recordingElapsedLabel = computed(() => {
  const totalSeconds = Math.floor(recordingElapsedMs.value / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
});

const mentionOptions = computed(() => {
  const candidateMap = new Map<string, GroupParticipant>();
  for (const participant of props.groupParticipants) {
    if (!participant?.jid) {
      continue;
    }
    candidateMap.set(participant.jid, participant);
  }

  for (const item of props.messageRenderItems) {
    if (item.kind !== "message") {
      continue;
    }

    const metadata = asRecord(item.message.metadataJson);
    const participantJid = metadata && typeof metadata.participantJid === "string"
      ? metadata.participantJid
      : "";

    if (!participantJid) {
      continue;
    }

    const fallbackPhone = participantJid.replace(/\D/g, "");
    candidateMap.set(participantJid, {
      jid: participantJid,
      name: item.message.senderName?.trim() || fallbackPhone || "Participante",
      phone: fallbackPhone,
      avatarUrl: item.message.senderAvatarUrl
    });
  }

  const query = mentionQuery.value.trim().toLowerCase();
  const options = [...candidateMap.values()];

  const filtered = query.length === 0
    ? options
    : options.filter((entry) => {
      const normalizedName = entry.name.trim().toLowerCase();
      const normalizedPhone = entry.phone.replace(/\D/g, "");
      const normalizedJid = entry.jid.toLowerCase();

      return (
        normalizedName.includes(query) ||
        normalizedPhone.includes(query.replace(/\D/g, "")) ||
        normalizedJid.includes(query)
      );
    });

  return filtered
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }))
    .slice(0, 10);
});

const isMentionPickerVisible = computed(() => {
  if (!props.isGroupConversation || !props.activeConversation) {
    return false;
  }

  if (mentionAnchorStart.value === null || mentionAnchorEnd.value === null) {
    return false;
  }

  return mentionOptions.value.length > 0;
});

watch(
  () => props.draft,
  (value) => {
    if (!value.trim()) {
      draftMentionSelections.value = [];
      resetMentionContext();
      linkPreviewEnabled.value = true;
      return;
    }

    pruneDraftMentionSelections();

    if (!extractFirstLinkFromText(value)) {
      linkPreviewEnabled.value = true;
    }
  }
);

watch(
  () => props.activeConversation?.id,
  () => {
    draftMentionSelections.value = [];
    resetMentionContext();
    closeEmojiPanel();
    linkPreviewEnabled.value = true;
  }
);

watch(
  () => mentionOptions.value.length,
  (length) => {
    if (length <= 0) {
      mentionSelectedIndex.value = 0;
      return;
    }

    if (mentionSelectedIndex.value >= length) {
      mentionSelectedIndex.value = length - 1;
    }
  }
);

watch(
  () => emojiCategories.value.map((entry) => entry.id),
  (ids) => {
    if (ids.length === 0) {
      return;
    }

    if (!ids.includes(emojiCategory.value)) {
      emojiCategory.value = ids[0];
    }
  },
  { immediate: true }
);

watch(
  () => emojiSearch.value,
  (value) => {
    if (value.trim().length > 0) {
      emojiPanelTab.value = "emoji";
    }
  }
);

watch(
  () => emojiPanelTab.value,
  (value) => {
    if (value === "gif") {
      queueGifSearch();
      return;
    }

    if (value === "stickers") {
      void loadSavedStickers();
    }
  }
);

watch(
  () => gifSearch.value,
  () => {
    if (emojiPanelTab.value === "gif") {
      queueGifSearch();
    }
  }
);

const pickerAccept = computed(() => {
  if (pickerMode.value === "sticker") {
    return ".webp,image/webp,image/png,image/jpeg";
  }

  if (pickerMode.value === "gif") {
    return "video/mp4,image/gif";
  }

  if (pickerMode.value === "media") {
    return "image/*,video/*";
  }

  if (pickerMode.value === "camera") {
    return "image/*";
  }

  if (pickerMode.value === "audio") {
    return "audio/*";
  }

  return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,image/*,video/*,audio/*";
});

const pickerCapture = computed(() => {
  if (pickerMode.value === "camera") {
    return "environment";
  }

  return undefined;
});

const attachmentMenuItems = computed(() => {
  return [
    [
      {
        label: "Documento (sem compressao)",
        icon: "i-lucide-file-text",
        onSelect: () => openAttachmentPicker("document")
      },
      {
        label: "Fotos e videos",
        icon: "i-lucide-image",
        onSelect: () => openAttachmentPicker("media")
      },
      {
        label: "Camera",
        icon: "i-lucide-camera",
        onSelect: () => openAttachmentPicker("camera")
      },
      {
        label: "Audio",
        icon: "i-lucide-headphones",
        onSelect: () => openAttachmentPicker("audio")
      },
      {
        label: "Figurinha",
        icon: "i-lucide-sticky-note",
        onSelect: () => openAttachmentPicker("sticker")
      }
    ],
    [
      {
        label: "Contato",
        icon: "i-lucide-user-round",
        onSelect: () => openContactPrompt()
      },
      {
        label: "Enquete",
        icon: "i-lucide-list-filter",
        disabled: true
      },
      {
        label: "Evento",
        icon: "i-lucide-calendar-days",
        disabled: true
      }
    ]
  ];
});

const groupAvatarLookup = computed(() => {
  const byJid = new Map<string, string>();
  const byDigits = new Map<string, string>();
  const byName = new Map<string, string>();

  const registerAvatar = (params: { jid?: string | null; phone?: string | null; name?: string | null; avatarUrl?: string | null }) => {
    const avatarUrl = params.avatarUrl?.trim();
    if (!avatarUrl) {
      return;
    }

    const normalizedJid = normalizeJidForComparison(params.jid || "");
    if (normalizedJid) {
      byJid.set(normalizedJid, avatarUrl);
      const jidDigits = normalizeDigits(normalizedJid);
      if (jidDigits) {
        byDigits.set(jidDigits, avatarUrl);
      }
    }

    const phoneDigits = normalizeDigits(params.phone || "");
    if (phoneDigits) {
      byDigits.set(phoneDigits, avatarUrl);
    }

    const normalizedName = normalizeNameForComparison(params.name || "");
    if (normalizedName) {
      byName.set(normalizedName, avatarUrl);
    }
  };

  for (const participant of props.groupParticipants) {
    registerAvatar({
      jid: participant.jid,
      phone: participant.phone,
      name: participant.name,
      avatarUrl: participant.avatarUrl
    });
  }

  for (const item of props.messageRenderItems) {
    if (item.kind !== "message") {
      continue;
    }

    const messageEntry = item.message;
    registerAvatar({
      jid: resolveMessageParticipantJid(messageEntry),
      name: messageEntry.senderName,
      avatarUrl: messageEntry.senderAvatarUrl
    });
  }

  return {
    byJid,
    byDigits,
    byName
  };
});

function resetMentionContext() {
  mentionAnchorStart.value = null;
  mentionAnchorEnd.value = null;
  mentionQuery.value = "";
  mentionSelectedIndex.value = 0;
}

function resolveComposerTextareaElement() {
  if (composerTextareaRef.value) {
    return composerTextareaRef.value;
  }

  const element = document.querySelector<HTMLTextAreaElement>(".chat-composer__input textarea");
  if (!element) {
    return null;
  }

  composerTextareaRef.value = element;
  return element;
}

function extractMentionQueryFromCursor(draftValue: string, cursorIndex: number) {
  if (cursorIndex <= 0 || cursorIndex > draftValue.length) {
    return null;
  }

  const left = draftValue.slice(0, cursorIndex);
  const mentionIndex = left.lastIndexOf("@");
  if (mentionIndex < 0) {
    return null;
  }

  if (mentionIndex > 0) {
    const previousChar = left.slice(mentionIndex - 1, mentionIndex);
    if (!/[\s(\[{]/.test(previousChar)) {
      return null;
    }
  }

  const query = left.slice(mentionIndex + 1);
  if (/[\n\r\t]/.test(query) || query.includes("@")) {
    return null;
  }

  if (/\s/.test(query)) {
    return null;
  }

  return {
    mentionIndex,
    query
  };
}

function updateMentionContextFromCursor() {
  if (!props.isGroupConversation || !props.activeConversation) {
    resetMentionContext();
    return;
  }

  const textareaElement = resolveComposerTextareaElement();
  if (!textareaElement) {
    resetMentionContext();
    return;
  }

  const cursorIndex = textareaElement.selectionStart ?? draftModel.value.length;
  const mentionContext = extractMentionQueryFromCursor(draftModel.value, cursorIndex);
  if (!mentionContext) {
    resetMentionContext();
    return;
  }

  mentionAnchorStart.value = mentionContext.mentionIndex;
  mentionAnchorEnd.value = cursorIndex;
  mentionQuery.value = mentionContext.query;
  mentionSelectedIndex.value = 0;
}

function upsertDraftMentionSelection(jid: string, label: string) {
  const normalizedJid = jid.trim().toLowerCase();
  if (!normalizedJid) {
    return;
  }

  const next = draftMentionSelections.value.filter((entry) => entry.jid !== normalizedJid);
  next.push({
    jid: normalizedJid,
    label
  });
  draftMentionSelections.value = next;
}

function pruneDraftMentionSelections() {
  const draftValue = draftModel.value;
  draftMentionSelections.value = draftMentionSelections.value.filter((entry) => {
    return draftValue.includes(entry.label);
  });
}

function pickMentionOption(option: GroupParticipant) {
  const start = mentionAnchorStart.value;
  const end = mentionAnchorEnd.value;
  if (start === null || end === null) {
    return;
  }

  const mentionLabel = `@${option.name}`;
  const nextDraft = `${draftModel.value.slice(0, start)}${mentionLabel} ${draftModel.value.slice(end)}`;
  draftModel.value = nextDraft;
  upsertDraftMentionSelection(option.jid, mentionLabel);
  resetMentionContext();

  void nextTick(() => {
    const textareaElement = resolveComposerTextareaElement();
    if (!textareaElement) {
      return;
    }

    const cursor = start + mentionLabel.length + 1;
    textareaElement.focus();
    textareaElement.setSelectionRange(cursor, cursor);
  });
}

function loadRecentEmojis() {
  if (!import.meta.client) {
    recentEmojis.value = [];
    return;
  }

  const raw = localStorage.getItem(EMOJI_RECENTS_STORAGE_KEY);
  if (!raw) {
    recentEmojis.value = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      recentEmojis.value = [];
      return;
    }

    recentEmojis.value = parsed
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .slice(0, EMOJI_RECENTS_MAX);
  } catch {
    recentEmojis.value = [];
  }
}

function persistRecentEmojis() {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(EMOJI_RECENTS_STORAGE_KEY, JSON.stringify(recentEmojis.value.slice(0, EMOJI_RECENTS_MAX)));
}

function pushRecentEmoji(emoji: string) {
  const next = [emoji, ...recentEmojis.value.filter((entry) => entry !== emoji)].slice(0, EMOJI_RECENTS_MAX);
  recentEmojis.value = next;
  persistRecentEmojis();
}

function normalizeSavedStickerItem(value: unknown): SavedStickerItem | null {
  const entry = asRecord(value);
  if (!entry) {
    return null;
  }

  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const dataUrl = typeof entry.dataUrl === "string" ? entry.dataUrl : "";
  if (!id || !dataUrl.startsWith("data:image/")) {
    return null;
  }

  return {
    id,
    name: typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : "figurinha.webp",
    dataUrl,
    mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "image/webp",
    sizeBytes: typeof entry.sizeBytes === "number" ? Math.max(0, Math.trunc(entry.sizeBytes)) : 0,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    createdByUserId: typeof entry.createdByUserId === "string" ? entry.createdByUserId : null
  };
}

async function loadSavedStickers() {
  savedStickersLoading.value = true;
  try {
    const response = await apiFetch<SavedSticker[]>(`/stickers?limit=${SAVED_STICKERS_MAX}`);
    const normalized = Array.isArray(response)
      ? response
          .map((entry) => normalizeSavedStickerItem(entry))
          .filter((entry): entry is SavedStickerItem => Boolean(entry))
      : [];

    savedStickers.value = normalized;
    stickerError.value = "";
  } catch (error) {
    savedStickers.value = [];
    stickerError.value = error instanceof Error ? error.message : "Nao foi possivel carregar figurinhas salvas.";
  } finally {
    savedStickersLoading.value = false;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:")) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Nao foi possivel ler figurinha."));
    };
    reader.onerror = () => reject(new Error("Nao foi possivel ler figurinha."));
    reader.readAsDataURL(file);
  });
}

function getFileExtensionFromMime(mimeType: string) {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() || "";
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "jpg";
  }

  return "webp";
}

function dataUrlToStickerFile(item: SavedStickerItem) {
  const match = item.dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1] || item.mimeType || "image/webp";
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const safeName = item.name?.trim() || `figurinha-${item.id}.${getFileExtensionFromMime(mimeType)}`;
  return new File([bytes], safeName, {
    type: mimeType
  });
}

async function saveStickerFromFile(file: File) {
  const mimeType = file.type.toLowerCase();
  if (!mimeType.startsWith("image/")) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const duplicated = savedStickers.value.find((entry) => entry.dataUrl === dataUrl);
    if (duplicated) {
      stickerError.value = "";
      return;
    }

    const name = file.name?.trim() || `figurinha-${Date.now()}.${getFileExtensionFromMime(mimeType)}`;
    const created = await apiFetch<SavedSticker>("/stickers", {
      method: "POST",
      body: {
        name,
        dataUrl,
        mimeType: file.type || "image/webp",
        sizeBytes: file.size
      }
    });

    const normalized = normalizeSavedStickerItem(created);
    if (normalized) {
      savedStickers.value = [normalized, ...savedStickers.value.filter((entry) => entry.id !== normalized.id)]
        .slice(0, SAVED_STICKERS_MAX);
    } else {
      await loadSavedStickers();
    }

    stickerError.value = "";
  } catch (error) {
    stickerError.value = error instanceof Error ? error.message : "Nao foi possivel salvar figurinha.";
  }
}

function selectSavedSticker(item: SavedStickerItem) {
  const file = dataUrlToStickerFile(item);
  if (!file) {
    stickerError.value = "Figurinha salva invalida. Remova e adicione novamente.";
    return;
  }

  emit("pick-attachment", {
    file,
    mode: "sticker"
  });
  closeEmojiPanel({ resetSearch: false });
}

async function removeSavedSticker(stickerId: string) {
  try {
    await apiFetch(`/stickers/${stickerId}`, {
      method: "DELETE"
    });

    savedStickers.value = savedStickers.value.filter((entry) => entry.id !== stickerId);
    stickerError.value = "";
  } catch (error) {
    stickerError.value = error instanceof Error ? error.message : "Nao foi possivel remover figurinha.";
  }
}

function updateEmojiCategory(value: EmojiCategoryId) {
  emojiCategory.value = value;
}

function toggleEmojiPanel() {
  if (!props.activeConversation || !props.canManageConversation) {
    return;
  }

  emojiPanelOpen.value = !emojiPanelOpen.value;
  emojiPanelTab.value = "emoji";
  if (emojiPanelOpen.value) {
    void nextTick(() => {
      const input = document.querySelector<HTMLInputElement>(".chat-composer__emoji-panel input");
      input?.focus();
    });
  }
}

function closeEmojiPanel(options: { resetSearch?: boolean } = {}) {
  emojiPanelOpen.value = false;
  clearGifSearchTimer();
  if (options.resetSearch !== false) {
    emojiSearch.value = "";
    gifSearch.value = "";
    gifError.value = "";
  }
}

function insertTextAtComposerCursor(value: string) {
  const textareaElement = resolveComposerTextareaElement();
  if (!textareaElement) {
    draftModel.value = `${draftModel.value}${value}`;
    return;
  }

  const start = textareaElement.selectionStart ?? draftModel.value.length;
  const end = textareaElement.selectionEnd ?? start;
  const nextDraft = `${draftModel.value.slice(0, start)}${value}${draftModel.value.slice(end)}`;
  draftModel.value = nextDraft;

  void nextTick(() => {
    const target = resolveComposerTextareaElement();
    if (!target) {
      return;
    }

    const nextCursor = start + value.length;
    target.focus();
    target.setSelectionRange(nextCursor, nextCursor);
    pruneDraftMentionSelections();
    updateMentionContextFromCursor();
  });
}

function insertEmoji(emoji: string) {
  insertTextAtComposerCursor(emoji);
  pushRecentEmoji(emoji);
}

function onEmojiPanelPointerDownOutside(event: MouseEvent) {
  if (!emojiPanelOpen.value) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }

  if (emojiPanelRef.value?.contains(target) || target.closest(".chat-composer__emoji-trigger")) {
    return;
  }

  closeEmojiPanel();
}

function normalizeReactionEmoji(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }

  return [...trimmed].slice(0, 8).join("") || null;
}

function getMessageReactionEntries(messageEntry: Message) {
  const metadata = asRecord(messageEntry.metadataJson);
  const reactions = metadata ? asRecord(metadata.reactions) : null;
  const rawItems = Array.isArray(reactions?.items) ? reactions.items : [];
  const entries: MessageReactionEntry[] = [];

  for (const item of rawItems) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const actorKey = typeof record.actorKey === "string" ? record.actorKey.trim() : "";
    const emoji = normalizeReactionEmoji(typeof record.emoji === "string" ? record.emoji : null);
    if (!actorKey || !emoji) {
      continue;
    }

    entries.push({
      actorKey,
      actorUserId: typeof record.actorUserId === "string" ? record.actorUserId : null,
      actorName: typeof record.actorName === "string" ? record.actorName : null,
      actorJid: typeof record.actorJid === "string" ? record.actorJid : null,
      emoji
    });
  }

  return entries;
}

function getReactionBadges(messageEntry: Message) {
  const grouped = new Map<string, MessageReactionBadge>();
  const entries = getMessageReactionEntries(messageEntry);

  for (const entry of entries) {
    const existing = grouped.get(entry.emoji);
    const actorLabel = entry.actorName?.trim() || entry.actorJid?.trim() || "Contato";
    const reactedByCurrentUser = Boolean(entry.actorUserId && entry.actorUserId === props.currentUserId);

    if (!existing) {
      grouped.set(entry.emoji, {
        emoji: entry.emoji,
        count: 1,
        reactedByCurrentUser,
        actors: [actorLabel]
      });
      continue;
    }

    existing.count += 1;
    existing.reactedByCurrentUser = existing.reactedByCurrentUser || reactedByCurrentUser;
    if (!existing.actors.includes(actorLabel)) {
      existing.actors.push(actorLabel);
    }
  }

  return [...grouped.values()].sort((left, right) => right.count - left.count);
}

function getCurrentUserReaction(messageEntry: Message) {
  const entries = getMessageReactionEntries(messageEntry);
  const current = entries.find((entry) => entry.actorUserId === props.currentUserId);
  return current?.emoji ?? null;
}

function setMessageReaction(messageEntry: Message, emoji: string | null) {
  emit("set-reaction", {
    messageId: messageEntry.id,
    emoji: normalizeReactionEmoji(emoji)
  });
}

function toggleReactionBadge(messageEntry: Message, badge: MessageReactionBadge) {
  if (!props.canManageConversation) {
    return;
  }

  const currentReaction = getCurrentUserReaction(messageEntry);
  const nextEmoji = currentReaction === badge.emoji ? null : badge.emoji;
  setMessageReaction(messageEntry, nextEmoji);
}

function buildReactionMenuItems(messageEntry: Message) {
  const currentReaction = getCurrentUserReaction(messageEntry);
  const items = QUICK_REACTION_EMOJIS.map((emoji) => ({
    label: currentReaction === emoji ? `${emoji} Remover` : `${emoji}`,
    onSelect: () => {
      const nextEmoji = currentReaction === emoji ? null : emoji;
      setMessageReaction(messageEntry, nextEmoji);
    }
  }));

  if (currentReaction) {
    items.push({
      label: "Remover reacao",
      onSelect: () => setMessageReaction(messageEntry, null)
    });
  }

  return [items];
}

function clearGifSearchTimer() {
  if (!import.meta.client) {
    return;
  }

  if (gifSearchTimer !== null) {
    window.clearTimeout(gifSearchTimer);
    gifSearchTimer = null;
  }
}

async function fetchGifResults() {
  const query = gifSearch.value.trim();
  if (!query) {
    gifResults.value = [];
    gifError.value = "";
    return;
  }

  gifLoading.value = true;
  gifError.value = "";

  try {
    const response = await $fetch<{ items?: GifSearchResultItem[]; error?: string }>("/api/gif/search", {
      query: {
        q: query,
        limit: 24
      }
    });

    gifError.value = typeof response.error === "string" ? response.error : "";
    gifResults.value = Array.isArray(response.items) ? response.items : [];
  } catch (error) {
    gifError.value = error instanceof Error ? error.message : "Nao foi possivel consultar GIFs.";
    gifResults.value = [];
  } finally {
    gifLoading.value = false;
  }
}

function queueGifSearch() {
  if (!import.meta.client) {
    return;
  }

  clearGifSearchTimer();
  gifSearchTimer = window.setTimeout(() => {
    void fetchGifResults();
  }, 250);
}

async function pickGifResult(item: GifSearchResultItem) {
  if (!item.mediaUrl) {
    return;
  }

  gifError.value = "";
  try {
    const response = await fetch(`/api/gif/media?url=${encodeURIComponent(item.mediaUrl)}`);
    if (!response.ok) {
      throw new Error("Falha ao carregar GIF selecionado.");
    }

    const blob = await response.blob();
    const mimeType = blob.type || item.mimeType || "video/mp4";
    const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("gif") ? "gif" : "bin";
    const safeTitle = (item.title || "gif").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32) || "gif";
    const file = new File([blob], `${safeTitle}-${Date.now()}.${extension}`, {
      type: mimeType
    });

    emit("pick-attachment", {
      file,
      mode: "gif"
    });
    closeEmojiPanel({ resetSearch: false });
  } catch (error) {
    gifError.value = error instanceof Error ? error.message : "Nao foi possivel anexar o GIF.";
  }
}

function openStickerFromEmojiPanel() {
  closeEmojiPanel({ resetSearch: false });
  openAttachmentPicker("sticker");
}

function toggleLinkPreview() {
  linkPreviewEnabled.value = !linkPreviewEnabled.value;
}

function emitSendFromComposer() {
  pruneDraftMentionSelections();
  const mentionedJids = draftMentionSelections.value
    .filter((entry) => draftModel.value.includes(entry.label))
    .map((entry) => entry.jid);
  const uniqueMentionedJids = [...new Set(mentionedJids)];
  const sendPayload: MentionSendPayload = {
    mentionedJids: uniqueMentionedJids
  };

  if (showLinkPreviewToggle.value) {
    sendPayload.linkPreviewEnabled = linkPreviewEnabled.value;
  }

  if (uniqueMentionedJids.length > 0 || showLinkPreviewToggle.value) {
    emit("send", sendPayload);
  } else {
    emit("send");
  }

  draftMentionSelections.value = [];
  resetMentionContext();
  closeEmojiPanel({ resetSearch: false });
}

function onComposerInput() {
  pruneDraftMentionSelections();
  updateMentionContextFromCursor();

  if (!draftModel.value.trim()) {
    emojiCategory.value = "recents";
  }
}

function onComposerCursorUpdate() {
  updateMentionContextFromCursor();
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && emojiPanelOpen.value) {
    event.preventDefault();
    closeEmojiPanel({ resetSearch: false });
    return;
  }

  if (isMentionPickerVisible.value) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionSelectedIndex.value = (mentionSelectedIndex.value + 1) % mentionOptions.value.length;
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value - 1 + mentionOptions.value.length) % mentionOptions.value.length;
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const option = mentionOptions.value[mentionSelectedIndex.value];
      if (option) {
        pickMentionOption(option);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      resetMentionContext();
      return;
    }
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    emitSendFromComposer();
  }
}

onMounted(() => {
  emit("body-mounted", chatBodyRef.value);
  composerTextareaRef.value = resolveComposerTextareaElement();
  loadRecentEmojis();
  void loadSavedStickers();
  if (import.meta.client) {
    document.addEventListener("mousedown", onEmojiPanelPointerDownOutside);
  }
});

onBeforeUnmount(() => {
  stopRecording(true);
  stopRecordingWaveCapture();
  if (replyFocusTimer !== null) {
    window.clearTimeout(replyFocusTimer);
    replyFocusTimer = null;
  }
  resetMentionContext();
  draftMentionSelections.value = [];
  closeEmojiPanel();
  if (import.meta.client) {
    document.removeEventListener("mousedown", onEmojiPanelPointerDownOutside);
  }
  emit("body-mounted", null);
});

function clearRecordingTicker() {
  if (recordingTicker !== null) {
    window.clearInterval(recordingTicker);
    recordingTicker = null;
  }
}

function clearRecordingWaveRaf() {
  if (recordingWaveRaf !== null) {
    window.cancelAnimationFrame(recordingWaveRaf);
    recordingWaveRaf = null;
  }
}

function resetRecordingWaveLevels() {
  recordingWaveLevels.value = Array.from({ length: 42 }, () => 0.12);
}

function stopRecordingWaveCapture() {
  clearRecordingWaveRaf();

  if (recordingSourceNode) {
    recordingSourceNode.disconnect();
    recordingSourceNode = null;
  }

  if (recordingAnalyser) {
    recordingAnalyser.disconnect();
    recordingAnalyser = null;
  }

  if (recordingAudioContext) {
    void recordingAudioContext.close();
    recordingAudioContext = null;
  }
}

function startRecordingWaveCapture(stream: MediaStream) {
  if (!import.meta.client) {
    return;
  }

  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  stopRecordingWaveCapture();
  resetRecordingWaveLevels();

  recordingAudioContext = new AudioContextCtor();
  recordingSourceNode = recordingAudioContext.createMediaStreamSource(stream);
  recordingAnalyser = recordingAudioContext.createAnalyser();
  recordingAnalyser.fftSize = 256;
  recordingAnalyser.smoothingTimeConstant = 0.7;
  recordingSourceNode.connect(recordingAnalyser);

  const buffer = new Uint8Array(recordingAnalyser.fftSize);

  const tick = () => {
    if (!recordingAnalyser) {
      return;
    }

    recordingAnalyser.getByteTimeDomainData(buffer);
    let sumSquares = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      const normalized = (buffer[index] - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    const level = Math.max(0.08, Math.min(1, rms * 6));
    recordingWaveLevels.value = [...recordingWaveLevels.value.slice(1), level];
    recordingWaveRaf = window.requestAnimationFrame(tick);
  };

  recordingWaveRaf = window.requestAnimationFrame(tick);
}

function stopRecordingStream() {
  if (!mediaStream) {
    return;
  }

  for (const track of mediaStream.getTracks()) {
    track.stop();
  }

  mediaStream = null;
}

function startRecordingTicker() {
  clearRecordingTicker();
  recordingTicker = window.setInterval(() => {
    if (!recordingStartedAt.value) {
      recordingElapsedMs.value = 0;
      return;
    }
    recordingElapsedMs.value = Date.now() - recordingStartedAt.value;
  }, 250);
}

async function startRecording() {
  if (!import.meta.client || isRecording.value || !props.activeConversation) {
    return;
  }

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    recordingError.value = "Gravacao nao suportada neste navegador.";
    return;
  }

  try {
    recordingError.value = "";
    recorderChunks = [];
    discardRecordingOnStop = false;
    shouldAutoSendOnRecordingStop = false;

    mediaStream = await mediaDevices.getUserMedia({ audio: true });
    startRecordingWaveCapture(mediaStream);

    const candidates = [
      "audio/ogg;codecs=opus",
      "audio/webm;codecs=opus",
      "audio/ogg",
      "audio/webm",
      "audio/mpeg"
    ];
    const mimeType = candidates.find((entry) =>
      typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(entry) : true
    );

    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recorderChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = () => {
      recordingError.value = "Falha ao gravar audio.";
      stopRecording(true);
    };

    mediaRecorder.onstop = () => {
      const chunks = recorderChunks;
      const shouldDiscard = discardRecordingOnStop;
      const shouldAutoSend = shouldAutoSendOnRecordingStop;
      recorderChunks = [];
      discardRecordingOnStop = false;
      shouldAutoSendOnRecordingStop = false;
      const recorderMimeType = mediaRecorder?.mimeType || chunks[0]?.type || "audio/webm";

      isRecording.value = false;
      recordingStartedAt.value = null;
      recordingElapsedMs.value = 0;
      clearRecordingTicker();
      stopRecordingWaveCapture();
      resetRecordingWaveLevels();
      stopRecordingStream();

      if (!chunks.length || shouldDiscard) {
        mediaRecorder = null;
        return;
      }

      const extension = recorderMimeType.includes("ogg")
        ? "ogg"
        : recorderMimeType.includes("mpeg")
          ? "mp3"
          : "webm";

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([new Blob(chunks, { type: recorderMimeType })], `audio-${timestamp}.${extension}`, {
        type: recorderMimeType
      });

      emit("pick-attachment", {
        file,
        mode: "audio"
      });

      if (shouldAutoSend) {
        emit("send");
      }

      mediaRecorder = null;
    };

    mediaRecorder.start(250);
    isRecording.value = true;
    recordingStartedAt.value = Date.now();
    recordingElapsedMs.value = 0;
    startRecordingTicker();
  } catch {
    recordingError.value = "Nao foi possivel acessar o microfone.";
    stopRecording(true);
  }
}

function stopRecording(silent = false, autoSend = false) {
  discardRecordingOnStop = silent;
  shouldAutoSendOnRecordingStop = !silent && autoSend;

  if (!isRecording.value && !mediaRecorder) {
    clearRecordingTicker();
    stopRecordingWaveCapture();
    resetRecordingWaveLevels();
    stopRecordingStream();
    discardRecordingOnStop = false;
    shouldAutoSendOnRecordingStop = false;
    return;
  }

  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      isRecording.value = false;
      recordingStartedAt.value = null;
      recordingElapsedMs.value = 0;
      clearRecordingTicker();
      stopRecordingWaveCapture();
      resetRecordingWaveLevels();
      stopRecordingStream();
      mediaRecorder = null;
      discardRecordingOnStop = false;
      shouldAutoSendOnRecordingStop = false;
    }
  } catch {
    if (!silent) {
      recordingError.value = "Falha ao finalizar a gravacao.";
    }
    isRecording.value = false;
    recordingStartedAt.value = null;
    recordingElapsedMs.value = 0;
    clearRecordingTicker();
    stopRecordingWaveCapture();
    resetRecordingWaveLevels();
    stopRecordingStream();
    mediaRecorder = null;
    discardRecordingOnStop = false;
    shouldAutoSendOnRecordingStop = false;
  }
}

function toggleRecording() {
  if (isRecording.value) {
    stopRecording();
    return;
  }

  void startRecording();
}

function cancelRecording() {
  stopRecording(true);
}

function sendRecordedAudio() {
  stopRecording(false, true);
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeNameForComparison(value: string) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJidForComparison(value: string) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/, "")
    .replace(/@c\.us$/, "@s.whatsapp.net");
}

function normalizeLinkUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
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

function extractFirstLinkFromText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
  if (!match) {
    return null;
  }

  const candidate = match[0].replace(/[),.!?;:]+$/g, "");
  return normalizeLinkUrl(candidate);
}

function extractLinksFromText(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const matches = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
  const links = new Set<string>();

  for (const raw of matches) {
    const candidate = raw.replace(/[),.!?;:]+$/g, "");
    const normalized = normalizeLinkUrl(candidate);
    if (normalized) {
      links.add(normalized);
    }
  }

  return [...links];
}

function extractLinkHost(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function resolveMessageParticipantJid(messageEntry: Message) {
  const metadata = asRecord(messageEntry.metadataJson);
  if (!metadata) {
    return null;
  }

  const participantJid = metadata.participantJid;
  if (typeof participantJid === "string" && participantJid.trim().length > 0) {
    return participantJid.trim();
  }

  return null;
}

function findAvatarByDigits(digits: string) {
  if (!digits) {
    return null;
  }

  const direct = groupAvatarLookup.value.byDigits.get(digits);
  if (direct) {
    return direct;
  }

  for (const [candidateDigits, avatarUrl] of groupAvatarLookup.value.byDigits.entries()) {
    if (candidateDigits.endsWith(digits) || digits.endsWith(candidateDigits)) {
      return avatarUrl;
    }
  }

  return null;
}

function getMentionDisplayFromMetadata(messageEntry: Message, mentionToken: string) {
  const metadata = asRecord(messageEntry.metadataJson);
  const mentions = metadata ? asRecord(metadata.mentions) : null;
  if (!mentions) {
    return null;
  }

  const mentionJidCandidates = buildMentionJidCandidates(mentionToken);
  const mentionedValue = mentionToken.startsWith("@") ? mentionToken.slice(1) : mentionToken;
  const mentionDigits = normalizeDigits(mentionedValue);

  const displayByPhone = asRecord(mentions.displayByPhone);
  if (displayByPhone && mentionDigits) {
    const direct = displayByPhone[mentionDigits];
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim();
    }

    for (const [phoneKey, value] of Object.entries(displayByPhone)) {
      if (typeof value !== "string") {
        continue;
      }

      const normalizedPhoneKey = normalizeDigits(phoneKey);
      if (!normalizedPhoneKey) {
        continue;
      }

      if (normalizedPhoneKey.endsWith(mentionDigits) || mentionDigits.endsWith(normalizedPhoneKey)) {
        const candidate = value.trim();
        if (candidate.length > 0) {
          return candidate;
        }
      }
    }
  }

  const displayByJid = asRecord(mentions.displayByJid);
  if (displayByJid) {
    for (const [jidKey, value] of Object.entries(displayByJid)) {
      if (typeof value !== "string") {
        continue;
      }

      const normalizedJid = normalizeMentionJid(jidKey);
      if (!normalizedJid || !mentionJidCandidates.includes(normalizedJid)) {
        continue;
      }

      const candidate = value.trim();
      if (candidate.length > 0) {
        return candidate;
      }
    }

    if (!mentionDigits) {
      return null;
    }

    for (const [jidKey, value] of Object.entries(displayByJid)) {
      if (typeof value !== "string") {
        continue;
      }
      const jidDigits = normalizeDigits(jidKey);
      if (!jidDigits) {
        continue;
      }

      if (jidDigits.endsWith(mentionDigits) || mentionDigits.endsWith(jidDigits)) {
        const candidate = value.trim();
        if (candidate.length > 0) {
          return candidate;
        }
      }
    }
  }

  if (!mentionDigits) {
    return null;
  }

  for (const participant of props.groupParticipants) {
    const participantDigitsCandidates = [
      normalizeDigits(participant.phone || ""),
      normalizeDigits(participant.jid || "")
    ].filter((entry) => entry.length > 0);

    for (const participantDigits of participantDigitsCandidates) {
      if (participantDigits.endsWith(mentionDigits) || mentionDigits.endsWith(participantDigits)) {
        const candidate = participant.name?.trim();
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  for (const item of props.messageRenderItems) {
    if (item.kind !== "message") {
      continue;
    }

    const metadataFromMessage = asRecord(item.message.metadataJson);
    const participantJidFromMessage = metadataFromMessage && typeof metadataFromMessage.participantJid === "string"
      ? metadataFromMessage.participantJid
      : "";
    if (!participantJidFromMessage) {
      continue;
    }

    const participantDigits = normalizeDigits(participantJidFromMessage);
    if (!participantDigits) {
      continue;
    }

    if (participantDigits.endsWith(mentionDigits) || mentionDigits.endsWith(participantDigits)) {
      const candidate = item.message.senderName?.trim();
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function normalizeMentionJid(value: string | null | undefined) {
  const normalized = normalizeJidForComparison(value ?? "");
  if (!normalized) {
    return null;
  }
  return normalized;
}

function buildMentionJidCandidates(mentionToken: string) {
  const rawMention = (mentionToken.startsWith("@") ? mentionToken.slice(1) : mentionToken).trim();
  if (!rawMention) {
    return [];
  }

  const candidates = new Set<string>();
  const normalizedRaw = normalizeMentionJid(rawMention);
  if (normalizedRaw) {
    candidates.add(normalizedRaw);
  }

  const mentionDigits = normalizeDigits(rawMention);
  if (mentionDigits) {
    candidates.add(`${mentionDigits}@s.whatsapp.net`);
    candidates.add(`${mentionDigits}@lid`);
  }

  return [...candidates];
}

function resolveMentionRouteTarget(messageEntry: Message, mentionToken: string) {
  const mentionedValue = mentionToken.startsWith("@") ? mentionToken.slice(1) : mentionToken;
  const mentionDigits = normalizeDigits(mentionedValue);
  const mentionJidCandidates = buildMentionJidCandidates(mentionToken);
  if (!mentionDigits) {
    if (mentionJidCandidates.length > 0) {
      return {
        jid: mentionJidCandidates[0],
        phone: null
      };
    }

    return {
      jid: null,
      phone: null
    };
  }

  const metadata = asRecord(messageEntry.metadataJson);
  const mentions = metadata ? asRecord(metadata.mentions) : null;

  const displayByJid = mentions ? asRecord(mentions.displayByJid) : null;
  if (displayByJid) {
    for (const [jidKey, value] of Object.entries(displayByJid)) {
      const normalizedJid = normalizeMentionJid(jidKey);
      if (!normalizedJid || !mentionJidCandidates.includes(normalizedJid)) {
        continue;
      }

      return {
        jid: normalizedJid,
        phone: mentionDigits || null
      };
    }

    for (const jidKey of Object.keys(displayByJid)) {
      const jidDigits = normalizeDigits(jidKey);
      if (!jidDigits) {
        continue;
      }
      if (jidDigits.endsWith(mentionDigits) || mentionDigits.endsWith(jidDigits)) {
        return {
          jid: normalizeMentionJid(jidKey),
          phone: mentionDigits
        };
      }
    }
  }

  const mentionedValues = mentions ? mentions.mentioned : null;
  if (Array.isArray(mentionedValues)) {
    for (const item of mentionedValues) {
      if (typeof item !== "string") {
        continue;
      }

      const normalizedMentionedJid = normalizeMentionJid(item);
      if (normalizedMentionedJid && mentionJidCandidates.includes(normalizedMentionedJid)) {
        return {
          jid: normalizedMentionedJid,
          phone: mentionDigits || null
        };
      }

      const jidDigits = normalizeDigits(item);
      if (!jidDigits) {
        continue;
      }
      if (jidDigits.endsWith(mentionDigits) || mentionDigits.endsWith(jidDigits)) {
        return {
          jid: normalizeMentionJid(item),
          phone: mentionDigits
        };
      }
    }
  }

  for (const participant of props.groupParticipants) {
    const participantJid = normalizeMentionJid(participant.jid);
    if (!participantJid) {
      continue;
    }
    const digitsByPhone = normalizeDigits(participant.phone || "");
    const digitsByJid = normalizeDigits(participantJid);
    const hasPhoneMatch =
      Boolean(digitsByPhone) &&
      (digitsByPhone.endsWith(mentionDigits) || mentionDigits.endsWith(digitsByPhone));
    const hasJidMatch =
      Boolean(digitsByJid) &&
      (digitsByJid.endsWith(mentionDigits) || mentionDigits.endsWith(digitsByJid));

    if (hasPhoneMatch || hasJidMatch) {
      return {
        jid: participantJid,
        phone: mentionDigits
      };
    }
  }

  return {
    jid: `${mentionDigits}@s.whatsapp.net`,
    phone: mentionDigits
  };
}

function renderMessageHtml(value: string, messageEntry: Message) {
  const mentionAnchors: string[] = [];
  const mentionPlaceholderPrefix = "__OMNI_MENTION__";

  const withMentionPlaceholders = escapeHtml(value).replace(
    /(^|[\s(])(@[0-9A-Za-z._-]{3,40})(?=\s|$|[),.!?])/g,
    (_, prefix: string, mention: string) => {
      const display = getMentionDisplayFromMetadata(messageEntry, mention);
      const renderedMention = display ? `@${display}` : mention;
      const routeTarget = resolveMentionRouteTarget(messageEntry, mention);
      const jidAttr = routeTarget.jid
        ? ` data-mention-jid="${escapeHtmlAttribute(routeTarget.jid)}"`
        : "";
      const phoneAttr = routeTarget.phone
        ? ` data-mention-phone="${escapeHtmlAttribute(routeTarget.phone)}"`
        : "";

      const anchor = `<a href="#" class="chat-message__mention chat-message__mention-link"${jidAttr}${phoneAttr}>${escapeHtml(renderedMention)}</a>`;
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
      const href = normalizeLinkUrl(sanitized);
      if (!href) {
        return rawLink;
      }

      const external = `<a href="${escapeHtmlAttribute(href)}" class="chat-message__external-link" target="_blank" rel="noopener noreferrer">${escapeHtml(sanitized)}</a>`;
      return `${external}${escapeHtml(trailing)}`;
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

function onMessageTextClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const mentionLink = target?.closest(".chat-message__mention-link") as HTMLElement | null;
  if (!mentionLink) {
    return;
  }

  event.preventDefault();

  const jid = mentionLink.dataset.mentionJid?.trim() || null;
  const phone = mentionLink.dataset.mentionPhone?.trim() || null;
  const text = mentionLink.textContent?.trim() ?? "";
  const label = text.replace(/^@/, "").trim() || null;

  emit("open-mention", {
    jid,
    phone,
    label
  });
}

function formatFileSize(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "0 KB";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

function parseUnsupportedLabelFromPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^\[conteudo nao suportado:\s*(.+)\]$/i);
  if (!match?.[1]) {
    return null;
  }

  return match[1].trim();
}

function getUnsupportedMetadata(messageEntry: Message) {
  const metadata = asRecord(messageEntry.metadataJson);
  const unsupported = metadata ? asRecord(metadata.unsupported) : null;
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
  return content.startsWith(UNSUPPORTED_PLACEHOLDER_PREFIX);
}

function getUnsupportedLabel(messageEntry: Message) {
  const fromMetadata = getUnsupportedMetadata(messageEntry);
  if (fromMetadata?.label) {
    return fromMetadata.label;
  }

  return parseUnsupportedLabelFromPlaceholder(messageEntry.content) ?? "tipo desconhecido";
}

function buildUnsupportedOpenUrl() {
  const externalId = props.activeConversation?.externalId ?? "";
  if (!externalId || externalId.endsWith("@g.us")) {
    return "https://web.whatsapp.com/";
  }

  const digits = externalId.replace(/\D/g, "");
  if (!digits) {
    return "https://web.whatsapp.com/";
  }

  return `https://wa.me/${digits}`;
}

function resolveMessageType(messageEntry: Message): MessageType {
  return messageEntry.messageType ?? "TEXT";
}

function isMentionAlertMessage(messageEntry: Message) {
  if (!props.isGroupConversation || messageEntry.direction !== "INBOUND") {
    return false;
  }

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

function isMediaPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return MEDIA_PLACEHOLDER_VALUES.has(normalized);
}

function asRecord(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function splitLegacyReplyContent(value: string) {
  const match = value.match(/^>\s*(.+?)\n\n([\s\S]*)$/);
  if (!match) {
    return null;
  }

  return {
    quoted: match[1].trim(),
    content: match[2].trim()
  };
}

function getReplyPreview(messageEntry: Message): ReplyPreview | null {
  const metadata = asRecord(messageEntry.metadataJson);
  const reply = metadata ? asRecord(metadata.reply) : null;

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

  const fallback = splitLegacyReplyContent(messageEntry.content ?? "");
  if (!fallback) {
    return null;
  }

  return {
    content: fallback.quoted,
    author: "Mensagem anterior",
    messageType: "TEXT" as MessageType,
    messageId: null
  };
}

function getRenderedMessageText(messageEntry: Message) {
  const fallback = splitLegacyReplyContent(messageEntry.content ?? "");
  if (fallback) {
    return fallback.content;
  }

  return messageEntry.content ?? "";
}

function getMessageLinkPreview(messageEntry: Message): MessageLinkPreview | null {
  const metadata = asRecord(messageEntry.metadataJson);
  const linkPreview = metadata ? asRecord(metadata.linkPreview) : null;
  const text = getRenderedMessageText(messageEntry);
  const fallbackUrl = extractFirstLinkFromText(text);

  if (linkPreview && linkPreview.enabled === false) {
    return null;
  }

  const url = normalizeLinkUrl(typeof linkPreview?.url === "string" ? linkPreview.url : null) ?? fallbackUrl;
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
  const host = extractLinkHost(url);

  return {
    url,
    title: titleRaw || host || url,
    description: descriptionRaw || null,
    thumbnailUrl: thumbnailRaw || null,
    host,
    enabled: true
  };
}

function getMessageContactCard(messageEntry: Message) {
  const metadata = asRecord(messageEntry.metadataJson);
  const contact = metadata ? asRecord(metadata.contact) : null;
  if (!contact) {
    return null;
  }

  const name = typeof contact.name === "string" ? contact.name.trim() : "";
  const phone = typeof contact.phone === "string" ? contact.phone.trim() : "";
  const vcard = typeof contact.vcard === "string" ? contact.vcard.trim() : "";

  if (!name && !phone && !vcard) {
    return null;
  }

  const label = name || phone || "Contato";
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return {
    name: label,
    phone: phone || null,
    tel,
    vcard: vcard || null
  };
}

function shouldRenderMessageText(messageEntry: Message) {
  if (hasUnsupportedNotice(messageEntry)) {
    return false;
  }

  const text = getRenderedMessageText(messageEntry).trim();
  if (!text) {
    return false;
  }

  if (resolveMessageType(messageEntry) !== "TEXT" && isMediaPlaceholder(text)) {
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
  if (text && !(resolveMessageType(messageEntry) !== "TEXT" && isMediaPlaceholder(text))) {
    return text;
  }

  return getMediaTypeLabel(resolveMessageType(messageEntry), messageEntry);
}

function getReplyTypeIcon(messageType: MessageType | null | undefined) {
  if (messageType === "IMAGE") {
    return "i-lucide-image";
  }

  if (messageType === "VIDEO") {
    return "i-lucide-clapperboard";
  }

  if (messageType === "AUDIO") {
    return "i-lucide-audio-lines";
  }

  if (messageType === "DOCUMENT") {
    return "i-lucide-file-text";
  }

  return "i-lucide-message-square";
}

function hasReplyJumpTarget(messageEntry: Message) {
  return Boolean(getReplyPreview(messageEntry)?.messageId);
}

function focusMessageRowById(messageId: string) {
  if (!import.meta.client) {
    return;
  }

  const target = document.getElementById(messageRowId(messageId));
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

function openAttachmentPicker(mode: AttachmentPickerMode) {
  if (isRecording.value) {
    stopRecording(true);
  }

  pickerMode.value = mode;
  fileInputRef.value?.click();
}

function openContactPrompt() {
  if (!import.meta.client || !props.activeConversation || !props.canManageConversation) {
    return;
  }

  const rawName = window.prompt("Nome do contato");
  if (rawName === null) {
    return;
  }

  const rawPhone = window.prompt("Telefone do contato (com DDI)");
  if (rawPhone === null) {
    return;
  }

  const phone = rawPhone.trim().replace(/[^\d+]/g, "");
  if (phone.length < 7) {
    return;
  }

  const name = rawName.trim() || phone;
  emit("send-contact", {
    name,
    phone
  });
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0] ?? null;

  if (file && pickerMode.value === "sticker") {
    void saveStickerFromFile(file);
  }

  emit("pick-attachment", {
    file,
    mode: pickerMode.value
  });

  if (target) {
    target.value = "";
  }
}

function markImageFailed(messageId: string) {
  failedImageMessageIds.value = {
    ...failedImageMessageIds.value,
    [messageId]: true
  };
}

function isImageFailed(messageId: string) {
  return Boolean(failedImageMessageIds.value[messageId]);
}

function getMessageMediaUrl(messageEntry: Message) {
  return messageEntry.mediaUrl ?? undefined;
}

function setMediaActionLoading(messageId: string, loading: boolean) {
  if (loading) {
    mediaActionLoadingByMessageId.value = {
      ...mediaActionLoadingByMessageId.value,
      [messageId]: true
    };
    return;
  }

  if (!mediaActionLoadingByMessageId.value[messageId]) {
    return;
  }

  const next = { ...mediaActionLoadingByMessageId.value };
  delete next[messageId];
  mediaActionLoadingByMessageId.value = next;
}

function isMediaActionLoading(messageId: string) {
  return Boolean(mediaActionLoadingByMessageId.value[messageId]);
}

function buildMediaProxyPath(messageEntry: Message, disposition: "inline" | "attachment") {
  const conversationId = encodeURIComponent(messageEntry.conversationId);
  const messageId = encodeURIComponent(messageEntry.id);
  return `/api/bff/conversations/${conversationId}/messages/${messageId}/media?disposition=${disposition}`;
}

async function fetchMessageMediaBlob(messageEntry: Message, disposition: "inline" | "attachment") {
  const headers = new Headers();
  if (token.value) {
    headers.set("Authorization", `Bearer ${token.value}`);
  }

  const response = await fetch(buildMediaProxyPath(messageEntry, disposition), {
    method: "GET",
    headers
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar midia (${response.status})`);
  }

  return response.blob();
}

function triggerDownloadFromUrl(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

async function openMessageMedia(messageEntry: Message) {
  const fallbackUrl = getMessageMediaUrl(messageEntry);
  const popup = window.open("", "_blank", "noopener,noreferrer");
  setMediaActionLoading(messageEntry.id, true);

  try {
    const blob = await fetchMessageMediaBlob(messageEntry, "inline");
    const objectUrl = URL.createObjectURL(blob);

    if (popup) {
      popup.location.href = objectUrl;
    } else {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    }

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  } catch {
    if (popup) {
      if (fallbackUrl) {
        popup.location.href = fallbackUrl;
      } else {
        popup.close();
      }
    } else if (fallbackUrl) {
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    }
  } finally {
    setMediaActionLoading(messageEntry.id, false);
  }
}

async function downloadMessageMedia(messageEntry: Message) {
  const fallbackUrl = getMessageMediaUrl(messageEntry);
  const downloadName = buildMediaDownloadName(messageEntry);
  setMediaActionLoading(messageEntry.id, true);

  try {
    const blob = await fetchMessageMediaBlob(messageEntry, "attachment");
    const objectUrl = URL.createObjectURL(blob);
    triggerDownloadFromUrl(objectUrl, downloadName);
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  } catch {
    if (fallbackUrl) {
      triggerDownloadFromUrl(fallbackUrl, downloadName);
    }
  } finally {
    setMediaActionLoading(messageEntry.id, false);
  }
}

function resolveMediaExtensionByMime(messageEntry: Message) {
  const mimeType = messageEntry.mediaMimeType?.trim().toLowerCase() || "";
  const mimeExtensionMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/x-rar-compressed": ".rar",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    "text/plain": ".txt",
    "text/csv": ".csv"
  };

  if (mimeType && mimeExtensionMap[mimeType]) {
    return mimeExtensionMap[mimeType];
  }

  const type = resolveMessageType(messageEntry);
  if (type === "IMAGE") {
    return ".jpg";
  }
  if (type === "VIDEO") {
    return ".mp4";
  }
  if (type === "AUDIO") {
    return ".ogg";
  }

  return ".bin";
}

function sanitizeEncryptedFileName(fileName: string, messageEntry: Message) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }

  if (!/\.enc(?:[?#].*)?$/i.test(trimmed)) {
    return trimmed;
  }

  const withoutEnc = trimmed
    .replace(/[?#].*$/, "")
    .replace(/\.enc$/i, "")
    .trim()
    .replace(/[.\-_ ]+$/g, "");

  if (!withoutEnc) {
    return `arquivo${resolveMediaExtensionByMime(messageEntry)}`;
  }

  if (/\.[a-z0-9]{2,6}$/i.test(withoutEnc)) {
    return withoutEnc;
  }

  return `${withoutEnc}${resolveMediaExtensionByMime(messageEntry)}`;
}

function resolveMessageFileName(messageEntry: Message) {
  const rawName = messageEntry.mediaFileName?.trim();
  if (rawName) {
    return sanitizeEncryptedFileName(rawName, messageEntry);
  }

  return "";
}

function buildMediaDownloadName(messageEntry: Message) {
  const normalized = resolveMessageFileName(messageEntry);
  if (normalized) {
    return normalized;
  }

  const type = resolveMessageType(messageEntry).toLowerCase();
  return `${type}-${messageEntry.id}${resolveMediaExtensionByMime(messageEntry)}`;
}

function resolveMessageAuthor(messageEntry: Message) {
  if (messageEntry.direction === "OUTBOUND") {
    return messageEntry.senderName?.trim() || "Voce";
  }

  return messageEntry.senderName?.trim() || "Participante";
}

function resolveOutboundOperatorLabel(messageEntry: Message) {
  if (messageEntry.direction !== "OUTBOUND") {
    return "";
  }

  if (!messageEntry.senderUserId) {
    return "";
  }

  const senderName = messageEntry.senderName?.trim();
  if (!senderName) {
    return "Atendente";
  }

  if (props.currentUserId && messageEntry.senderUserId === props.currentUserId) {
    return "Voce";
  }

  return senderName;
}

function resolveGroupParticipantAvatar(messageEntry: Message) {
  if (!props.isGroupConversation) {
    return undefined;
  }

  const participantJid = resolveMessageParticipantJid(messageEntry);
  const normalizedParticipantJid = normalizeJidForComparison(participantJid || "");
  if (normalizedParticipantJid) {
    const byJid = groupAvatarLookup.value.byJid.get(normalizedParticipantJid);
    if (byJid) {
      return byJid;
    }
  }

  const participantDigitsCandidates = [
    normalizeDigits(participantJid || ""),
    normalizeDigits(messageEntry.senderName || "")
  ].filter((entry) => entry.length > 0);

  for (const digits of participantDigitsCandidates) {
    const byDigits = findAvatarByDigits(digits);
    if (byDigits) {
      return byDigits;
    }
  }

  const normalizedSenderName = normalizeNameForComparison(messageEntry.senderName || "");
  if (normalizedSenderName) {
    const directByName = groupAvatarLookup.value.byName.get(normalizedSenderName);
    if (directByName) {
      return directByName;
    }

    for (const [candidateName, avatarUrl] of groupAvatarLookup.value.byName.entries()) {
      if (!candidateName) {
        continue;
      }

      if (
        candidateName === normalizedSenderName ||
        candidateName.includes(normalizedSenderName) ||
        normalizedSenderName.includes(candidateName)
      ) {
        return avatarUrl;
      }
    }
  }

  return undefined;
}

function resolveMessageAvatarUrl(messageEntry: Message) {
  const fromMessage = messageEntry.senderAvatarUrl?.trim();
  if (fromMessage) {
    return fromMessage;
  }

  const fromGroupParticipants = resolveGroupParticipantAvatar(messageEntry);
  if (fromGroupParticipants) {
    return fromGroupParticipants;
  }

  if (!props.activeConversation || props.isGroupConversation) {
    return undefined;
  }

  if (messageEntry.direction === "INBOUND") {
    return props.activeConversation.contactAvatarUrl || undefined;
  }

  return undefined;
}

function resolveAudioAvatarUrl(messageEntry: Message) {
  return resolveMessageAvatarUrl(messageEntry);
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
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="!activeConversation || !canManageConversation"
            @click="emit('close-conversation')"
          >
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
                  <div v-if="isGroupConversation" class="chat-message__author-row">
                    <UAvatar
                      :src="resolveMessageAvatarUrl(item.message)"
                      :alt="resolveMessageAuthor(item.message)"
                      :text="getInitials(resolveMessageAuthor(item.message))"
                      size="2xs"
                    />
                    <p class="chat-message__author">{{ resolveMessageAuthor(item.message) }}</p>
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
                    <div class="chat-message__reply-head">
                      <UIcon :name="getReplyTypeIcon(getReplyPreview(item.message)?.messageType)" class="chat-message__reply-icon" />
                      <p class="chat-message__reply-author">{{ getReplyAuthorLabel(item.message) }}</p>
                      <span class="chat-message__reply-type">
                        {{ getMediaTypeLabel(getReplyPreview(item.message)?.messageType) }}
                      </span>
                    </div>
                    <p class="chat-message__reply-text">
                      {{ getReplyPreview(item.message)?.content }}
                    </p>
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
                      <a
                        class="chat-message__media-link"
                        :href="buildUnsupportedOpenUrl()"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir no WhatsApp
                      </a>
                    </div>
                  </div>

                  <div v-if="hasImagePreview(item.message)" class="chat-message__media">
                    <img
                      v-if="!isImageFailed(item.message.id)"
                      :src="getMessageMediaUrl(item.message)"
                      alt="Imagem"
                      class="chat-message__media-image"
                      :class="{ 'chat-message__media-image--sticker': isStickerMessage(item.message) }"
                      loading="lazy"
                      @error="markImageFailed(item.message.id)"
                    >
                    <div v-else class="chat-message__media-fallback">
                      <UIcon name="i-lucide-image-off" class="chat-message__media-fallback-icon" />
                      <span>Nao foi possivel carregar o preview.</span>
                    </div>

                    <div class="chat-message__media-actions">
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="openMessageMedia(item.message)"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="downloadMessageMedia(item.message)"
                      >
                        Baixar
                      </button>
                    </div>
                  </div>

                  <div v-else-if="hasVideoPreview(item.message)" class="chat-message__media">
                    <video :src="getMessageMediaUrl(item.message)" class="chat-message__media-video" controls preload="metadata"></video>
                    <div class="chat-message__media-actions">
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="openMessageMedia(item.message)"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="downloadMessageMedia(item.message)"
                      >
                        Baixar
                      </button>
                    </div>
                  </div>

                  <div v-else-if="hasAudioPreview(item.message)" class="chat-message__media">
                    <InboxAudioMessagePlayer
                      :src="getMessageMediaUrl(item.message)"
                      :direction="item.message.direction"
                      :avatar-url="resolveAudioAvatarUrl(item.message)"
                      :avatar-text="getInitials(resolveMessageAuthor(item.message))"
                    />
                  </div>

                  <div v-else-if="hasDocumentPreview(item.message)" class="chat-message__document">
                    <UIcon name="i-lucide-paperclip" class="chat-message__document-icon" />
                    <span class="chat-message__document-name">{{ resolveMessageFileName(item.message) || "Arquivo" }}</span>
                    <div class="chat-message__media-actions">
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="openMessageMedia(item.message)"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        class="chat-message__media-link"
                        :disabled="isMediaActionLoading(item.message.id)"
                        @click="downloadMessageMedia(item.message)"
                      >
                        Baixar
                      </button>
                    </div>
                  </div>

                  <div v-else-if="hasPendingMediaPreview(item.message)" class="chat-message__media-fallback">
                    <UIcon name="i-lucide-loader-circle" class="chat-message__media-fallback-icon" />
                    <span>{{ getPendingMediaLabel(item.message) }}</span>
                  </div>

                  <div v-if="getMessageContactCard(item.message)" class="chat-message__contact-card">
                    <UIcon name="i-lucide-user-round" class="chat-message__contact-icon" />
                    <div class="chat-message__contact-content">
                      <p class="chat-message__contact-name">{{ getMessageContactCard(item.message)?.name }}</p>
                      <a
                        v-if="getMessageContactCard(item.message)?.tel && getMessageContactCard(item.message)?.phone"
                        :href="getMessageContactCard(item.message)?.tel || '#'"
                        class="chat-message__contact-phone"
                      >
                        {{ getMessageContactCard(item.message)?.phone }}
                      </a>
                      <p v-else-if="getMessageContactCard(item.message)?.phone" class="chat-message__contact-phone">
                        {{ getMessageContactCard(item.message)?.phone }}
                      </p>
                    </div>
                  </div>

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
                    <UDropdownMenu
                      :items="buildReactionMenuItems(item.message)"
                      :content="{ side: 'top', align: 'end', sideOffset: 8 }"
                    >
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-smile"
                        :disabled="!canManageConversation"
                      />
                    </UDropdownMenu>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="!canManageConversation"
                      @click="emit('set-reply', item.message)"
                    >
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
            <p class="chat-reply__meta">
              <UIcon :name="getReplyTypeIcon(resolveMessageType(replyTarget))" />
              <span>{{ getMediaTypeLabel(resolveMessageType(replyTarget)) }}</span>
            </p>
            <p class="chat-reply__text">{{ getReplyTargetText(replyTarget) }}</p>
          </div>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="emit('clear-reply')" />
        </div>

        <div v-if="hasAttachment" class="chat-attachment">
          <div class="chat-attachment__preview">
            <img
              v-if="attachmentPreviewUrl && attachmentType === 'IMAGE'"
              :src="attachmentPreviewUrl"
              alt="Imagem selecionada"
              class="chat-attachment__image"
            >
            <video
              v-else-if="attachmentPreviewUrl && attachmentType === 'VIDEO'"
              :src="attachmentPreviewUrl"
              class="chat-attachment__video"
              controls
              preload="metadata"
            ></video>
            <InboxAudioMessagePlayer
              v-else-if="attachmentPreviewUrl && attachmentType === 'AUDIO'"
              :src="attachmentPreviewUrl"
              :direction="'OUTBOUND'"
              :compact="true"
              class="chat-attachment__audio-player"
            />
            <div v-else class="chat-attachment__icon">
              <UIcon name="i-lucide-paperclip" />
            </div>
          </div>

          <div class="chat-attachment__meta">
            <p class="chat-attachment__name">{{ attachmentName || "Arquivo" }}</p>
            <p class="chat-attachment__info">
              {{ getMediaTypeLabel(attachmentType) }} - {{ attachmentMimeType || "arquivo" }} - {{ formatFileSize(attachmentSizeBytes) }}
            </p>
          </div>

          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="emit('clear-attachment')" />
        </div>

        <div v-if="isRecording" class="chat-composer__recording-shell">
          <button type="button" class="chat-composer__record-action chat-composer__record-action--cancel" @click="cancelRecording">
            <UIcon name="i-lucide-trash-2" />
          </button>
          <span class="chat-composer__record-dot"></span>
          <span class="chat-composer__record-time">{{ recordingElapsedLabel }}</span>

          <div class="chat-composer__record-wave">
            <span
              v-for="(level, index) in recordingWaveLevels"
              :key="`record-level-${index}`"
              class="chat-composer__record-wave-bar"
              :style="{ height: `${Math.round(8 + level * 16)}px` }"
            />
          </div>

          <button type="button" class="chat-composer__record-action chat-composer__record-action--send" @click="sendRecordedAudio">
            <UIcon name="i-lucide-send-horizontal" />
          </button>
        </div>

        <div v-else-if="recordingError" class="chat-composer__recording-error">
          {{ recordingError }}
        </div>

        <div v-if="sendError" class="chat-composer__send-error">
          {{ sendError }}
        </div>

        <div v-if="sendingMessage" class="chat-composer__sending-hint">
          Enviando mensagem...
        </div>

        <div v-if="isComposerReadOnly" class="chat-composer__readonly-hint">
          Seu perfil esta em modo somente leitura nesta conversa.
        </div>

        <div v-if="!isRecording" class="chat-composer">
          <input
            ref="fileInputRef"
            class="chat-page__file-input"
            type="file"
            :accept="pickerAccept"
            :capture="pickerCapture"
            @change="onFileChange"
          >

          <UDropdownMenu
            :items="attachmentMenuItems"
            :content="{ side: 'top', align: 'start', sideOffset: 10 }"
            :ui="{ content: 'chat-composer__menu' }"
          >
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :disabled="!activeConversation || isRecording || !canManageConversation"
              icon="i-lucide-plus"
              aria-label="Adicionar anexo"
            />
          </UDropdownMenu>

          <div class="chat-composer__emoji-wrap">
            <button
              type="button"
              class="chat-composer__emoji-trigger"
              :class="{ 'chat-composer__emoji-trigger--active': emojiPanelOpen }"
              :disabled="!activeConversation || !canManageConversation"
              aria-label="Abrir painel de emoji"
              @click="toggleEmojiPanel"
            >
              <UIcon name="i-lucide-smile-plus" />
            </button>

            <div
              v-if="emojiPanelOpen"
              ref="emojiPanelRef"
              class="chat-composer__emoji-panel"
              role="dialog"
              aria-label="Painel de emoji, GIF e figurinhas"
            >
              <div class="chat-composer__emoji-tab-row">
                <button
                  v-for="item in EMOJI_PANEL_TAB_ITEMS"
                  :key="item.id"
                  type="button"
                  class="chat-composer__emoji-tab"
                  :class="{ 'chat-composer__emoji-tab--active': emojiPanelTab === item.id }"
                  @click="emojiPanelTab = item.id"
                >
                  {{ item.label }}
                </button>
              </div>

              <template v-if="emojiPanelTab === 'emoji'">
                <UInput
                  v-model="emojiSearch"
                  icon="i-lucide-search"
                  placeholder="Pesquisar emoji"
                  size="sm"
                />

                <div v-if="showEmojiCategoryTabs" class="chat-composer__emoji-categories">
                  <button
                    v-for="category in emojiCategories"
                    :key="category.id"
                    type="button"
                    class="chat-composer__emoji-category"
                    :class="{ 'chat-composer__emoji-category--active': emojiCategory === category.id }"
                    :title="category.label"
                    @click="updateEmojiCategory(category.id)"
                  >
                    {{ category.icon }}
                  </button>
                </div>

                <p class="chat-composer__emoji-section-title">
                  {{ emojiSearch.trim().length > 0 ? `Busca: ${emojiSearch.trim()}` : activeEmojiCategoryLabel }}
                </p>

                <div class="chat-composer__emoji-grid">
                  <button
                    v-for="emoji in filteredEmojiList"
                    :key="`emoji-${emoji}`"
                    type="button"
                    class="chat-composer__emoji-item"
                    @click="insertEmoji(emoji)"
                  >
                    {{ emoji }}
                  </button>
                </div>

                <p v-if="filteredEmojiList.length === 0" class="chat-composer__emoji-empty">
                  Nenhum emoji encontrado para essa busca.
                </p>
              </template>

              <template v-else-if="emojiPanelTab === 'gif'">
                <UInput
                  v-model="gifSearch"
                  icon="i-lucide-search"
                  placeholder="Pesquisar GIF"
                  size="sm"
                />

                <div v-if="gifLoading" class="chat-composer__emoji-coming-soon">
                  Carregando GIFs...
                </div>
                <div v-else-if="gifError" class="chat-composer__emoji-empty">
                  {{ gifError }}
                </div>
                <div v-else-if="gifResults.length === 0" class="chat-composer__emoji-empty">
                  Digite um termo para buscar GIFs.
                </div>
                <div v-else class="chat-composer__gif-grid">
                  <button
                    v-for="item in gifResults"
                    :key="`gif-${item.id}`"
                    type="button"
                    class="chat-composer__gif-item"
                    :title="item.title || 'GIF'"
                    :disabled="!canManageConversation"
                    @click="pickGifResult(item)"
                  >
                    <img
                      v-if="item.previewUrl || item.mediaUrl"
                      :src="item.previewUrl || item.mediaUrl || ''"
                      :alt="item.title || 'GIF'"
                      loading="lazy"
                    >
                    <span v-else>Sem preview</span>
                  </button>
                </div>
              </template>

              <template v-else>
                <div class="chat-composer__sticker-pane">
                  <p class="chat-composer__emoji-section-title">
                    Envie figurinha personalizada (WEBP, PNG ou JPG).
                  </p>

                  <p v-if="savedStickersLoading" class="chat-composer__emoji-empty">
                    Carregando figurinhas salvas...
                  </p>
                  <div v-else-if="savedStickers.length > 0" class="chat-composer__sticker-grid">
                    <div
                      v-for="item in savedStickers"
                      :key="`saved-sticker-${item.id}`"
                      class="chat-composer__sticker-card"
                    >
                      <button
                        type="button"
                        class="chat-composer__sticker-item"
                        :disabled="!canManageConversation"
                        :title="item.name"
                        @click="selectSavedSticker(item)"
                      >
                        <img :src="item.dataUrl" :alt="item.name" loading="lazy">
                      </button>
                      <button
                        type="button"
                        class="chat-composer__sticker-remove"
                        title="Remover figurinha"
                        @click="removeSavedSticker(item.id)"
                      >
                        <UIcon name="i-lucide-x" />
                      </button>
                    </div>
                  </div>
                  <p v-else class="chat-composer__emoji-empty">
                    Nenhuma figurinha salva ainda.
                  </p>

                  <p v-if="stickerError" class="chat-composer__emoji-empty">
                    {{ stickerError }}
                  </p>

                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-sticky-note"
                    :disabled="!canManageConversation"
                    @click="openStickerFromEmojiPanel"
                  >
                    Adicionar figurinha
                  </UButton>
                </div>
              </template>
            </div>
          </div>

          <div class="chat-composer__input-wrap">
            <UTextarea
              v-model="draftModel"
              class="chat-composer__input"
              :disabled="!activeConversation || !canManageConversation"
              :rows="1"
              autoresize
              placeholder="Digite uma mensagem"
              @keydown="onComposerKeydown"
              @input="onComposerInput"
              @click="onComposerCursorUpdate"
              @keyup="onComposerCursorUpdate"
            />

            <div v-if="isMentionPickerVisible" class="chat-composer__mentions">
              <button
                v-for="(option, index) in mentionOptions"
                :key="`mention-option-${option.jid}`"
                type="button"
                class="chat-composer__mention-item"
                :class="{ 'chat-composer__mention-item--active': index === mentionSelectedIndex }"
                @click="pickMentionOption(option)"
              >
                <UAvatar
                  :src="option.avatarUrl || undefined"
                  :text="getInitials(option.name)"
                  size="2xs"
                />
                <span class="chat-composer__mention-name">{{ option.name }}</span>
                <span class="chat-composer__mention-phone">{{ option.phone }}</span>
              </button>
              <p v-if="loadingGroupParticipants && mentionOptions.length === 0" class="chat-composer__mention-empty">
                Carregando participantes...
              </p>
            </div>
          </div>

          <UButton
            v-if="showLinkPreviewToggle"
            size="xs"
            color="neutral"
            :variant="linkPreviewEnabled ? 'soft' : 'ghost'"
            icon="i-lucide-link"
            :disabled="!activeConversation || !canManageConversation"
            :title="linkPreviewEnabled ? 'Previa de link ativada' : 'Previa de link desativada'"
            @click="toggleLinkPreview"
          >
            Previa
          </UButton>

          <UButton
            v-if="composerHasContent"
            size="sm"
            color="primary"
            variant="solid"
            icon="i-lucide-send-horizontal"
            :disabled="!activeConversation || !canManageConversation"
            aria-label="Enviar"
            @click="emitSendFromComposer"
          />
          <UButton
            v-else
            size="sm"
            :color="isRecording ? 'error' : 'neutral'"
            :variant="isRecording ? 'soft' : 'ghost'"
            :icon="isRecording ? 'i-lucide-stop-circle' : 'i-lucide-mic'"
            :disabled="!activeConversation || !canManageConversation"
            :aria-label="isRecording ? 'Parar gravacao' : 'Gravar audio'"
            @click="toggleRecording"
          />
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

.chat-message__link-card {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 0.5rem;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  background: rgb(var(--surface-2));
  padding: 0.35rem;
  margin-bottom: 0.4rem;
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
  display: block;
}

.chat-message__link-content {
  min-width: 0;
  display: grid;
  gap: 0.2rem;
  align-content: center;
}

.chat-message__link-title,
.chat-message__link-description,
.chat-message__link-host {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-message__link-title {
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.chat-message__link-description {
  font-size: 0.74rem;
  color: rgb(var(--muted));
  line-height: 1.3;
  max-height: 2.6em;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.chat-message__link-host {
  font-size: 0.7rem;
  color: rgb(var(--muted));
  white-space: nowrap;
}

.chat-message__contact-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.45rem;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  background: rgb(var(--surface-2));
  padding: 0.4rem 0.5rem;
  margin-bottom: 0.4rem;
}

.chat-message__contact-icon {
  width: 16px;
  height: 16px;
  margin-top: 0.1rem;
  color: rgb(var(--primary));
}

.chat-message__contact-content {
  min-width: 0;
}

.chat-message__contact-name,
.chat-message__contact-phone {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-message__contact-name {
  font-size: 0.8rem;
  font-weight: 700;
}

.chat-message__contact-phone {
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

.chat-message__reply {
  margin-bottom: 0.45rem;
  border-left: 3px solid rgb(var(--primary));
  background: rgb(var(--primary) / 0.08);
  border-radius: var(--radius-xs);
  padding: 0.35rem 0.5rem;
}

.chat-message__reply--clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.chat-message__reply--clickable:hover {
  background: rgb(var(--primary) / 0.14);
}

.chat-message__reply-head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.chat-message__reply-icon {
  color: rgb(var(--primary));
}

.chat-message__reply-author {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgb(var(--primary));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-message__reply-type {
  font-size: 0.68rem;
  color: rgb(var(--muted));
  font-weight: 600;
  margin-left: auto;
  text-transform: uppercase;
}

.chat-message__reply-text {
  margin: 0.12rem 0 0;
  font-size: 0.78rem;
  color: rgb(var(--muted));
  line-height: 1.35;
  max-height: 2.7em;
  overflow: hidden;
}

.chat-message__unsupported {
  margin-bottom: 0.45rem;
  border: 1px solid rgb(var(--warning) / 0.5);
  background: rgb(var(--warning) / 0.08);
  border-radius: var(--radius-xs);
  padding: 0.45rem 0.55rem;
  display: grid;
  gap: 0.4rem;
}

.chat-message__unsupported-head {
  display: flex;
  align-items: flex-start;
  gap: 0.42rem;
}

.chat-message__unsupported-icon {
  width: 0.95rem;
  height: 0.95rem;
  color: rgb(var(--warning));
  margin-top: 0.1rem;
}

.chat-message__unsupported-title,
.chat-message__unsupported-label {
  margin: 0;
}

.chat-message__unsupported-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: rgb(var(--text));
}

.chat-message__unsupported-label {
  font-size: 0.76rem;
  color: rgb(var(--muted));
}

.chat-message__media {
  margin-bottom: 0.4rem;
  display: grid;
  gap: 0.35rem;
}

.chat-message__media-image {
  max-width: min(360px, 100%);
  max-height: 420px;
  border-radius: var(--radius-sm);
  display: block;
}

.chat-message__media-image--sticker {
  width: min(220px, 100%);
  max-width: min(220px, 100%);
  max-height: 220px;
  object-fit: contain;
}

.chat-message__media-video {
  max-width: min(360px, 100%);
  border-radius: var(--radius-sm);
  display: block;
}

.chat-message__media-audio {
  width: min(320px, 100%);
}

.chat-message__media-fallback {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: rgb(var(--muted));
  font-size: 0.78rem;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  padding: 0.45rem;
}

.chat-message__media-fallback-icon {
  width: 16px;
  height: 16px;
}

.chat-message__media-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
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

.chat-message__media-link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-message__document {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  padding: 0.42rem 0.52rem;
}

.chat-message__document-icon {
  width: 16px;
  height: 16px;
}

.chat-message__document-name {
  font-size: 0.82rem;
  font-weight: 600;
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

.chat-message__reaction-badge:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.chat-message__reaction-badge--active {
  border-color: rgb(var(--primary) / 0.55);
  background: rgb(var(--primary) / 0.14);
  color: rgb(var(--primary));
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

.chat-message__mention-indicator .iconify {
  width: 0.7rem;
  height: 0.7rem;
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

.chat-message-row--reply-focus :deep(.chat-message__bubble) {
  box-shadow: 0 0 0 1px rgb(var(--primary) / 0.6), 0 0 0 4px rgb(var(--primary) / 0.12);
}

.chat-page__panel-footer {
  display: grid;
  gap: 0.55rem;
}

.chat-reply {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  border-left: 3px solid rgb(var(--primary));
  background: rgb(var(--primary) / 0.08);
  border-radius: var(--radius-xs);
  padding: 0.4rem 0.55rem;
}

.chat-reply__label,
.chat-reply__text {
  margin: 0;
}

.chat-reply__meta {
  margin: 0.1rem 0 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.68rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.chat-reply__label {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  font-weight: 600;
}

.chat-reply__text {
  font-size: 0.78rem;
  line-height: 1.35;
  max-height: 2.7em;
  overflow: hidden;
}

.chat-attachment {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--surface-2));
  border-radius: var(--radius-xs);
  padding: 0.45rem 0.55rem;
}

.chat-attachment__preview {
  flex-shrink: 0;
}

.chat-attachment__image,
.chat-attachment__video {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-xs);
  object-fit: cover;
}

.chat-attachment__audio-player {
  width: min(260px, 100%);
}

.chat-attachment__icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-xs);
  display: grid;
  place-items: center;
  border: 1px solid rgb(var(--border));
}

.chat-attachment__meta {
  min-width: 0;
  flex: 1;
}

.chat-attachment__name,
.chat-attachment__info {
  margin: 0;
}

.chat-attachment__name {
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-attachment__info {
  margin-top: 0.08rem;
  font-size: 0.72rem;
  color: rgb(var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-composer__recording-shell {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.28rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--error) / 0.35);
  background: rgb(var(--surface-2));
}

.chat-composer__record-time {
  font-size: 0.86rem;
  font-weight: 600;
  color: rgb(var(--text));
}

.chat-composer__record-action {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.chat-composer__record-action--cancel {
  background: rgb(var(--surface));
  color: rgb(var(--muted));
}

.chat-composer__record-action--send {
  background: rgb(var(--primary));
  color: rgb(var(--primary-foreground));
}

.chat-composer__record-wave {
  min-width: 0;
  height: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.chat-composer__record-wave-bar {
  width: 0.12rem;
  border-radius: 999px;
  background: rgb(var(--primary) / 0.75);
  animation: chat-record-wave-pulse 1.2s ease-in-out infinite;
}

.chat-composer__record-wave-bar:nth-child(3n) {
  animation-delay: 0.08s;
}

.chat-composer__record-wave-bar:nth-child(4n) {
  animation-delay: 0.16s;
}

.chat-composer__record-dot {
  width: 0.46rem;
  height: 0.46rem;
  border-radius: 999px;
  background: rgb(var(--error));
  animation: chat-record-blink 1.1s ease-in-out infinite;
}

.chat-composer__recording-error {
  font-size: 0.72rem;
  color: rgb(var(--error));
}

.chat-composer__send-error {
  font-size: 0.72rem;
  color: rgb(var(--error));
}

.chat-composer__readonly-hint {
  font-size: 0.72rem;
  color: rgb(var(--primary));
}

.chat-composer__sending-hint {
  font-size: 0.72rem;
  color: rgb(var(--muted));
}

.chat-composer {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  background: rgb(var(--surface));
}

.chat-composer__emoji-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.chat-composer__emoji-trigger {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgb(var(--muted));
  display: grid;
  place-items: center;
  cursor: pointer;
}

.chat-composer__emoji-trigger:hover {
  background: rgb(var(--surface-2));
  color: rgb(var(--text));
}

.chat-composer__emoji-trigger--active {
  background: rgb(var(--primary) / 0.18);
  color: rgb(var(--primary));
}

.chat-composer__emoji-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.chat-composer__emoji-panel {
  position: absolute;
  bottom: calc(100% + 0.55rem);
  left: 0;
  z-index: 35;
  width: min(24rem, calc(100vw - 2rem));
  max-height: 24rem;
  display: grid;
  gap: 0.55rem;
  padding: 0.6rem;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  box-shadow: 0 14px 28px rgb(0 0 0 / 0.35);
}

.chat-composer__emoji-tab-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.chat-composer__emoji-tab {
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  padding: 0.22rem 0.45rem;
  font-size: 0.74rem;
  background: transparent;
  color: rgb(var(--muted));
  cursor: pointer;
}

.chat-composer__emoji-tab--active {
  color: rgb(var(--primary));
  border-color: rgb(var(--primary) / 0.5);
  background: rgb(var(--primary) / 0.12);
}

.chat-composer__emoji-categories {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  overflow-x: auto;
  padding-bottom: 0.2rem;
}

.chat-composer__emoji-category {
  min-width: 1.9rem;
  height: 1.9rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--border));
  background: transparent;
  cursor: pointer;
}

.chat-composer__emoji-category--active {
  border-color: rgb(var(--primary) / 0.5);
  background: rgb(var(--primary) / 0.12);
}

.chat-composer__emoji-section-title {
  margin: 0;
  font-size: 0.73rem;
  color: rgb(var(--muted));
}

.chat-composer__emoji-grid {
  max-height: 13.5rem;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.24rem;
  align-content: start;
}

.chat-composer__emoji-item {
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  cursor: pointer;
  font-size: 1.18rem;
  line-height: 1;
  padding: 0.3rem 0.1rem;
}

.chat-composer__emoji-item:hover {
  background: rgb(var(--surface-2));
}

.chat-composer__emoji-empty,
.chat-composer__emoji-coming-soon {
  margin: 0;
  font-size: 0.76rem;
  color: rgb(var(--muted));
  border: 1px dashed rgb(var(--border));
  border-radius: var(--radius-xs);
  padding: 0.55rem 0.6rem;
}

.chat-composer__gif-grid {
  max-height: 13.5rem;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.chat-composer__gif-item {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  background: rgb(var(--surface-2));
  min-height: 88px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.chat-composer__gif-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.chat-composer__sticker-pane {
  display: grid;
  gap: 0.45rem;
}

.chat-composer__sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 0.15rem;
}

.chat-composer__sticker-card {
  position: relative;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-xs);
  background: rgb(var(--surface-2));
  padding: 0.25rem;
}

.chat-composer__sticker-item {
  width: 100%;
  border: 0;
  border-radius: var(--radius-2xs);
  background: transparent;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
}

.chat-composer__sticker-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.chat-composer__sticker-remove {
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  width: 1.1rem;
  height: 1.1rem;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.chat-composer__sticker-remove:hover {
  color: rgb(var(--foreground));
  border-color: rgb(var(--primary) / 0.4);
}

.chat-composer__input-wrap {
  position: relative;
  min-width: 0;
}

.chat-composer__input {
  width: 100%;
}

.chat-composer__mentions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 0.4rem);
  z-index: 30;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  max-height: 280px;
  overflow-y: auto;
}

.chat-composer__mention-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  cursor: pointer;
}

.chat-composer__mention-item:hover,
.chat-composer__mention-item--active {
  background: rgb(var(--primary) / 0.12);
}

.chat-composer__mention-name {
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-composer__mention-phone {
  font-size: 0.72rem;
  color: rgb(var(--muted));
}

.chat-composer__mention-empty {
  margin: 0;
  padding: 0.5rem 0.6rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
}

.chat-composer__menu {
  min-width: 220px;
}

.chat-page__file-input {
  display: none;
}

.chat-page__composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

:deep(.chat-composer__input textarea) {
  border: 0;
  background: transparent;
  box-shadow: none;
  min-height: 32px;
  padding-top: 0.4rem;
  padding-bottom: 0.35rem;
}

@keyframes chat-record-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.2;
  }
}

@keyframes chat-record-wave-pulse {
  0%,
  100% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }
}
</style>
