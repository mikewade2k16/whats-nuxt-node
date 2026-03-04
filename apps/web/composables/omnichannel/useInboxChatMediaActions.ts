import { ref } from "vue";
import type { Message, MessageType } from "~/types";

export function useInboxChatMediaActions(options: {
  getToken: () => string | null;
  resolveMessageType: (messageEntry: Message) => MessageType;
}) {
  const failedImageMessageIds = ref<Record<string, true>>({});
  const mediaActionLoadingByMessageId = ref<Record<string, true>>({});

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
    const token = options.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
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

    const type = options.resolveMessageType(messageEntry);
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

    const type = options.resolveMessageType(messageEntry).toLowerCase();
    return `${type}-${messageEntry.id}${resolveMediaExtensionByMime(messageEntry)}`;
  }

  return {
    markImageFailed,
    isImageFailed,
    getMessageMediaUrl,
    isMediaActionLoading,
    openMessageMedia,
    downloadMessageMedia,
    resolveMessageFileName
  };
}
