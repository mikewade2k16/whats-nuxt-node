import MarkdownIt from "markdown-it";
import { computed, ref } from "vue";

export type ProjectDocStatus = "none" | "todo" | "in_progress" | "done";
export type ProjectDocPriority = "P0" | "P1" | "P2";

export type ProjectDocChecklistStats = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  completionPercent: number | null;
  status: ProjectDocStatus;
};

export type ProjectDocChecklistItem = {
  text: string;
  status: Exclude<ProjectDocStatus, "none">;
  priority: ProjectDocPriority | null;
};

export type ProjectDocSectionStats = {
  title: string;
  level: number;
  checklist: ProjectDocChecklistStats;
  items: ProjectDocChecklistItem[];
};

export type ProjectDocPriorityStats = Record<ProjectDocPriority, ProjectDocChecklistStats>;

export type ProjectDocSummary = {
  slug: string;
  fileName: string;
  path: string;
  title: string;
  updatedAt: string;
  checklist: ProjectDocChecklistStats;
  sections: ProjectDocSectionStats[];
  priorities: ProjectDocPriorityStats;
};

export type ProjectDocDetails = ProjectDocSummary & {
  content: string;
};

type DocsListResponse = {
  docs: ProjectDocSummary[];
};

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

export function useProjectDocs() {
  const docs = ref<ProjectDocSummary[]>([]);
  const selectedDoc = ref<ProjectDocDetails | null>(null);
  const loadingList = ref(false);
  const loadingDoc = ref(false);
  const errorMessage = ref("");

  const selectedSlug = computed(() => selectedDoc.value?.slug ?? null);

  const metrics = computed(() => {
    let totalTasks = 0;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    for (const docItem of docs.value) {
      totalTasks += docItem.checklist.total;
      completed += docItem.checklist.completed;
      inProgress += docItem.checklist.inProgress;
      pending += docItem.checklist.pending;
    }

    const weightedDone = completed + inProgress * 0.5;
    const completionPercent = totalTasks > 0 ? Math.round((weightedDone / totalTasks) * 100) : null;

    return {
      docsCount: docs.value.length,
      totalTasks,
      completed,
      inProgress,
      pending,
      completionPercent
    };
  });

  const selectedDocHtml = computed(() => {
    if (!selectedDoc.value) {
      return "";
    }

    return markdown.render(selectedDoc.value.content);
  });

  function normalizeError(error: unknown) {
    if (error && typeof error === "object" && "data" in error) {
      const data = (error as { data?: { statusMessage?: string } }).data;
      if (data?.statusMessage) {
        return data.statusMessage;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Falha ao carregar documentacao.";
  }

  async function loadDocs() {
    loadingList.value = true;
    errorMessage.value = "";

    try {
      const response = await $fetch<DocsListResponse>("/api/docs");
      docs.value = response.docs ?? [];
    } catch (error) {
      errorMessage.value = normalizeError(error);
      docs.value = [];
    } finally {
      loadingList.value = false;
    }
  }

  async function openDoc(slug: string) {
    if (!slug) {
      return;
    }

    loadingDoc.value = true;
    errorMessage.value = "";

    try {
      selectedDoc.value = await $fetch<ProjectDocDetails>(`/api/docs/${encodeURIComponent(slug)}`);
    } catch (error) {
      errorMessage.value = normalizeError(error);
      selectedDoc.value = null;
    } finally {
      loadingDoc.value = false;
    }
  }

  async function reloadCurrentDoc() {
    if (!selectedSlug.value) {
      return;
    }

    await openDoc(selectedSlug.value);
  }

  return {
    docs,
    selectedDoc,
    selectedSlug,
    selectedDocHtml,
    loadingList,
    loadingDoc,
    errorMessage,
    metrics,
    loadDocs,
    openDoc,
    reloadCurrentDoc
  };
}
