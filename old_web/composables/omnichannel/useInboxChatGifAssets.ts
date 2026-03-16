import { ref } from "vue";

export type GifSearchResultItem = {
  id: string;
  title: string;
  previewUrl: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
};

export function useInboxChatGifAssets(options: {
  onPickAttachment: (payload: { file: File; mode: "gif" }) => void;
  onClosePanel: () => void;
}) {
  const gifSearch = ref("");
  const gifLoading = ref(false);
  const gifError = ref("");
  const gifResults = ref<GifSearchResultItem[]>([]);

  let gifSearchTimer: number | null = null;

  function updateGifSearch(value: string) {
    gifSearch.value = value;
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

      options.onPickAttachment({
        file,
        mode: "gif"
      });
      options.onClosePanel();
    } catch (error) {
      gifError.value = error instanceof Error ? error.message : "Nao foi possivel anexar o GIF.";
    }
  }

  return {
    gifSearch,
    gifLoading,
    gifError,
    gifResults,
    updateGifSearch,
    clearGifSearchTimer,
    queueGifSearch,
    pickGifResult
  };
}
