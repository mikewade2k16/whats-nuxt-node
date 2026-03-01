<script setup lang="ts">
import { UAlert, UBadge, UButton, UCard, UInput, USelect } from "#components";
import { computed, onMounted, ref, watch } from "vue";
import { useProjectDocs } from "~/composables/docs/useProjectDocs";
import type { ProjectDocChecklistStats, ProjectDocStatus, ProjectDocSummary } from "~/composables/docs/useProjectDocs";

type StatusFilter = "all" | ProjectDocStatus;

const route = useRoute();
const router = useRouter();

const {
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
} = useProjectDocs();

const search = ref("");
const statusFilter = ref<StatusFilter>("all");

const statusFilterItems = [
  { label: "Todos", value: "all" },
  { label: "Concluidos", value: "done" },
  { label: "Em andamento", value: "in_progress" },
  { label: "Pendentes", value: "todo" },
  { label: "Sem checklist", value: "none" }
];

const filteredDocs = computed(() => {
  const searchNormalized = search.value.trim().toLowerCase();

  return docs.value.filter((docItem) => {
    const statusMatches = statusFilter.value === "all" || docItem.checklist.status === statusFilter.value;
    if (!statusMatches) {
      return false;
    }

    if (!searchNormalized) {
      return true;
    }

    const haystack = `${docItem.title} ${docItem.fileName} ${docItem.path}`.toLowerCase();
    return haystack.includes(searchNormalized);
  });
});

const selectedDocStatusColor = computed(() => {
  if (!selectedDoc.value) {
    return "neutral";
  }

  return getStatusColor(selectedDoc.value.checklist.status);
});

const backlogDoc = computed(() =>
  docs.value.find((docItem) => docItem.fileName.toLowerCase() === "backlog-execucao.md") ?? null
);

const architectureDoc = computed(() =>
  docs.value.find((docItem) => docItem.fileName.toLowerCase() === "scorecard-arquitetura.md") ?? null
);

const roadmapDoc = computed(() =>
  docs.value.find((docItem) => docItem.fileName.toLowerCase() === "roadmap-whatsapp-parity.md") ?? null
);

const sprintsDoc = computed(() =>
  docs.value.find((docItem) => docItem.fileName.toLowerCase() === "sprints-execucao.md") ?? null
);

const p0Progress = computed(() => backlogDoc.value?.priorities.P0 ?? null);
const p1Progress = computed(() => backlogDoc.value?.priorities.P1 ?? null);
const p2Progress = computed(() => backlogDoc.value?.priorities.P2 ?? null);
const sprintSections = computed(() => {
  const sections = sprintsDoc.value?.sections ?? [];
  return sections.filter((sectionItem) => /^Sprint\s+\d+/i.test(sectionItem.title) || /Gate de liberacao/i.test(sectionItem.title));
});

const architectureScore = computed(() => {
  const percent = architectureDoc.value?.checklist.completionPercent;
  if (percent === null || percent === undefined) {
    return null;
  }
  return Number((percent / 10).toFixed(1));
});

const selectedDocSections = computed(() => selectedDoc.value?.sections ?? []);

function getStatusLabel(statusValue: ProjectDocStatus) {
  if (statusValue === "done") {
    return "Concluido";
  }
  if (statusValue === "in_progress") {
    return "Em andamento";
  }
  if (statusValue === "todo") {
    return "Pendente";
  }
  return "Sem checklist";
}

function getStatusColor(statusValue: ProjectDocStatus) {
  if (statusValue === "done") {
    return "success";
  }
  if (statusValue === "in_progress") {
    return "warning";
  }
  if (statusValue === "todo") {
    return "error";
  }
  return "neutral";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function getProgressWidth(docItem: ProjectDocSummary) {
  const percent = docItem.checklist.completionPercent;
  return `${percent ?? 0}%`;
}

function getChecklistProgressWidth(stats: ProjectDocChecklistStats | null | undefined) {
  const percent = stats?.completionPercent ?? 0;
  return `${percent}%`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value}%`;
}

async function openDocAndSync(slug: string) {
  await openDoc(slug);
}

async function loadAndSelectInitialDoc() {
  await loadDocs();

  if (!docs.value.length) {
    return;
  }

  const querySlug = typeof route.query.doc === "string" ? route.query.doc : null;
  const firstSlug = docs.value[0]?.slug ?? null;
  const selectedQuerySlug = querySlug && docs.value.some((docItem) => docItem.slug === querySlug) ? querySlug : null;

  const initialSlug = selectedQuerySlug ?? firstSlug;

  if (initialSlug) {
    await openDocAndSync(initialSlug);
  }
}

watch(selectedSlug, async (slugValue) => {
  const currentQuery = typeof route.query.doc === "string" ? route.query.doc : null;
  if (!slugValue || currentQuery === slugValue) {
    return;
  }

  await router.replace({
    query: {
      ...route.query,
      doc: slugValue
    }
  });
});

onMounted(async () => {
  await loadAndSelectInitialDoc();
});
</script>

<template>
  <div class="docs-page">
    <header class="docs-page__header">
      <div class="docs-page__headline">
        <h1 class="docs-page__title">Documentacao Operacional</h1>
        <p class="docs-page__subtitle">
          Visao central dos arquivos `.md` com checklist de progresso para acompanhar entrega tecnica.
        </p>
      </div>

      <div class="docs-page__actions">
        <UButton to="/" color="neutral" variant="outline">Inbox</UButton>
        <UButton to="/admin" color="neutral" variant="outline">Admin</UButton>
        <UButton color="neutral" variant="soft" :loading="loadingList" @click="loadAndSelectInitialDoc">
          Atualizar
        </UButton>
      </div>
    </header>

    <UAlert v-if="errorMessage" color="error" variant="soft" :title="errorMessage" />

    <section class="docs-page__metrics">
      <UCard class="docs-metric-card">
        <p class="docs-metric-card__label">Arquivos</p>
        <p class="docs-metric-card__value">{{ metrics.docsCount }}</p>
      </UCard>

      <UCard class="docs-metric-card">
        <p class="docs-metric-card__label">Total de tarefas</p>
        <p class="docs-metric-card__value">{{ metrics.totalTasks }}</p>
      </UCard>

      <UCard class="docs-metric-card">
        <p class="docs-metric-card__label">Em andamento</p>
        <p class="docs-metric-card__value">{{ metrics.inProgress }}</p>
      </UCard>

      <UCard class="docs-metric-card">
        <p class="docs-metric-card__label">Percentual geral</p>
        <p class="docs-metric-card__value">
          {{ metrics.completionPercent === null ? "--" : `${metrics.completionPercent}%` }}
        </p>
      </UCard>
    </section>
    <p class="docs-page__percent-note">Percentuais: concluido = 100%, em andamento = 50%, pendente = 0%.</p>

    <section class="docs-page__bi">
      <UCard class="docs-bi-card">
        <p class="docs-bi-card__label">Andamento funcionalidades (Backlog)</p>
        <p class="docs-bi-card__value">{{ formatPercent(backlogDoc?.checklist.completionPercent ?? null) }}</p>
        <p class="docs-bi-card__hint">
          {{ backlogDoc?.checklist.completed ?? 0 }}/{{ backlogDoc?.checklist.total ?? 0 }} tarefas concluidas
          <span v-if="(backlogDoc?.checklist.inProgress ?? 0) > 0">
            - {{ backlogDoc?.checklist.inProgress ?? 0 }} em andamento
          </span>
          <span v-if="(backlogDoc?.checklist.pending ?? 0) > 0">
            - {{ backlogDoc?.checklist.pending ?? 0 }} pendentes
          </span>
        </p>
      </UCard>

      <UCard class="docs-bi-card">
        <p class="docs-bi-card__label">MVP cliente (P0)</p>
        <p class="docs-bi-card__value">{{ formatPercent(p0Progress?.completionPercent ?? null) }}</p>
        <p class="docs-bi-card__hint">
          {{ p0Progress?.completed ?? 0 }}/{{ p0Progress?.total ?? 0 }} itens P0
          <span v-if="(p0Progress?.inProgress ?? 0) > 0"> - {{ p0Progress?.inProgress ?? 0 }} em andamento</span>
          <span v-if="(p0Progress?.pending ?? 0) > 0"> - {{ p0Progress?.pending ?? 0 }} pendentes</span>
        </p>
      </UCard>

      <UCard class="docs-bi-card">
        <p class="docs-bi-card__label">Roadmap paridade</p>
        <p class="docs-bi-card__value">{{ formatPercent(roadmapDoc?.checklist.completionPercent ?? null) }}</p>
        <p class="docs-bi-card__hint">
          {{ roadmapDoc?.checklist.completed ?? 0 }}/{{ roadmapDoc?.checklist.total ?? 0 }} itens
        </p>
      </UCard>

      <UCard class="docs-bi-card">
        <p class="docs-bi-card__label">Nota de arquitetura</p>
        <p class="docs-bi-card__value">{{ architectureScore === null ? "--" : `${architectureScore}/10` }}</p>
        <p class="docs-bi-card__hint">
          Baseada no scorecard de arquitetura
        </p>
      </UCard>
    </section>

    <section class="docs-page__priorities">
      <UCard class="docs-priority-card">
        <div class="docs-priority-card__row">
          <p class="docs-priority-card__label">Prioridade P0</p>
          <span class="docs-priority-card__value">{{ formatPercent(p0Progress?.completionPercent ?? null) }}</span>
        </div>
        <div class="docs-priority-card__track">
          <div class="docs-priority-card__fill" :style="{ width: getChecklistProgressWidth(p0Progress) }" />
        </div>
      </UCard>

      <UCard class="docs-priority-card">
        <div class="docs-priority-card__row">
          <p class="docs-priority-card__label">Prioridade P1</p>
          <span class="docs-priority-card__value">{{ formatPercent(p1Progress?.completionPercent ?? null) }}</span>
        </div>
        <div class="docs-priority-card__track">
          <div class="docs-priority-card__fill" :style="{ width: getChecklistProgressWidth(p1Progress) }" />
        </div>
      </UCard>

      <UCard class="docs-priority-card">
        <div class="docs-priority-card__row">
          <p class="docs-priority-card__label">Prioridade P2</p>
          <span class="docs-priority-card__value">{{ formatPercent(p2Progress?.completionPercent ?? null) }}</span>
        </div>
        <div class="docs-priority-card__track">
          <div class="docs-priority-card__fill" :style="{ width: getChecklistProgressWidth(p2Progress) }" />
        </div>
      </UCard>
    </section>

    <section class="docs-page__sprints">
      <UCard v-for="sprintItem in sprintSections" :key="sprintItem.title" class="docs-sprint-card">
        <div class="docs-sprint-card__head">
          <p class="docs-sprint-card__title">{{ sprintItem.title }}</p>
          <UBadge :color="getStatusColor(sprintItem.checklist.status)" variant="soft" size="sm">
            {{ formatPercent(sprintItem.checklist.completionPercent) }}
          </UBadge>
        </div>
        <p class="docs-sprint-card__meta">
          {{ sprintItem.checklist.completed }}/{{ sprintItem.checklist.total }} concluidos
          <span v-if="sprintItem.checklist.inProgress > 0"> - {{ sprintItem.checklist.inProgress }} em andamento</span>
          <span v-if="sprintItem.checklist.pending > 0"> - {{ sprintItem.checklist.pending }} pendentes</span>
        </p>
        <div class="docs-sprint-card__track">
          <div class="docs-sprint-card__fill" :style="{ width: getChecklistProgressWidth(sprintItem.checklist) }" />
        </div>
      </UCard>

      <UCard v-if="!sprintSections.length" class="docs-sprint-card docs-sprint-card--empty">
        <p class="docs-sprint-card__meta">Sem metas de sprint mapeadas.</p>
      </UCard>
    </section>

    <section class="docs-page__content">
      <aside class="docs-page__sidebar">
        <div class="docs-page__filters">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar por titulo, arquivo ou caminho" />
          <USelect v-model="statusFilter" :items="statusFilterItems" value-key="value" />
        </div>

        <div class="docs-page__list">
          <div v-if="loadingList" class="docs-page__empty">
            Carregando documentos...
          </div>

          <template v-else>
            <button
              v-for="docItem in filteredDocs"
              :key="docItem.slug"
              type="button"
              class="docs-entry"
              :class="{ 'docs-entry--active': selectedSlug === docItem.slug }"
              @click="openDocAndSync(docItem.slug)"
            >
              <div class="docs-entry__head">
                <p class="docs-entry__title">{{ docItem.title }}</p>
                <UBadge :color="getStatusColor(docItem.checklist.status)" variant="soft" size="sm">
                  {{ getStatusLabel(docItem.checklist.status) }}
                </UBadge>
              </div>

              <p class="docs-entry__path">{{ docItem.path }}</p>

              <div class="docs-entry__meta">
                <span>
                  Checklist:
                  {{ docItem.checklist.completed }}/{{ docItem.checklist.total }}
                </span>
                <span>
                  Atualizado em {{ formatDate(docItem.updatedAt) }}
                </span>
              </div>

              <div class="docs-entry__progress-track">
                <div class="docs-entry__progress-fill" :style="{ width: getProgressWidth(docItem) }" />
              </div>
            </button>

            <div v-if="!filteredDocs.length" class="docs-page__empty">
              Nenhum documento encontrado com os filtros atuais.
            </div>
          </template>
        </div>
      </aside>

      <article class="docs-page__reader">
        <div v-if="selectedDoc" class="docs-page__reader-header">
          <div class="docs-page__reader-title-wrap">
            <h2 class="docs-page__reader-title">{{ selectedDoc.title }}</h2>
            <p class="docs-page__reader-path">{{ selectedDoc.path }}</p>
          </div>

          <div class="docs-page__reader-actions">
            <UBadge :color="selectedDocStatusColor" variant="soft">
              {{ getStatusLabel(selectedDoc.checklist.status) }}
            </UBadge>
            <UButton color="neutral" variant="outline" :loading="loadingDoc" @click="reloadCurrentDoc">
              Recarregar documento
            </UButton>
          </div>
        </div>

        <div class="docs-page__reader-body">
          <div v-if="loadingDoc" class="docs-page__empty">Carregando conteudo...</div>
          <template v-else-if="selectedDoc">
            <section v-if="selectedDocSections.length" class="docs-sections">
              <h3 class="docs-sections__title">Andamento por secao</h3>
              <div class="docs-sections__grid">
                <article v-for="sectionItem in selectedDocSections" :key="sectionItem.title" class="docs-section-card">
                  <div class="docs-section-card__head">
                    <p class="docs-section-card__title">{{ sectionItem.title }}</p>
                    <UBadge :color="getStatusColor(sectionItem.checklist.status)" variant="soft" size="sm">
                      {{ formatPercent(sectionItem.checklist.completionPercent) }}
                    </UBadge>
                  </div>
                  <p class="docs-section-card__meta">
                    {{ sectionItem.checklist.completed }}/{{ sectionItem.checklist.total }} concluidos
                  </p>
                  <div class="docs-section-card__track">
                    <div class="docs-section-card__fill" :style="{ width: getChecklistProgressWidth(sectionItem.checklist) }" />
                  </div>
                </article>
              </div>
            </section>

            <div class="docs-markdown" v-html="selectedDocHtml" />
          </template>
          <div v-else class="docs-page__empty">Selecione um documento para abrir.</div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.docs-page {
  min-height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  padding: 1rem;
  display: grid;
  grid-template-rows: auto auto auto auto auto auto 1fr;
  gap: 0.75rem;
  background: rgb(var(--background));
}

.docs-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.docs-page__headline {
  display: grid;
  gap: 0.25rem;
}

.docs-page__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.docs-page__subtitle {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.88rem;
}

.docs-page__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.docs-page__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.docs-page__percent-note {
  margin: -0.25rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.74rem;
}

.docs-metric-card__label {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.76rem;
}

.docs-metric-card__value {
  margin: 0.2rem 0 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.docs-page__content {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(20rem, 28rem) 1fr;
  gap: 0.75rem;
}

.docs-page__bi,
.docs-page__priorities {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.docs-page__priorities {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.docs-page__sprints {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.docs-bi-card__label,
.docs-priority-card__label {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.76rem;
}

.docs-bi-card__value {
  margin: 0.2rem 0 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.docs-bi-card__hint {
  margin: 0.25rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.76rem;
}

.docs-priority-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.docs-priority-card__value {
  font-size: 0.88rem;
  font-weight: 600;
}

.docs-priority-card__track {
  margin-top: 0.45rem;
  width: 100%;
  height: 0.38rem;
  border-radius: 999px;
  background: rgb(var(--border));
  overflow: hidden;
}

.docs-priority-card__fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--primary));
}

.docs-sprint-card {
  display: grid;
  gap: 0.45rem;
}

.docs-sprint-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.docs-sprint-card__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.25;
}

.docs-sprint-card__meta {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.docs-sprint-card__track {
  width: 100%;
  height: 0.35rem;
  border-radius: 999px;
  background: rgb(var(--border));
  overflow: hidden;
}

.docs-sprint-card__fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--primary));
}

.docs-sprint-card--empty {
  grid-column: 1 / -1;
}

.docs-page__sidebar,
.docs-page__reader {
  min-height: 0;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-md);
  background: rgb(var(--surface));
}

.docs-page__sidebar {
  display: grid;
  grid-template-rows: auto 1fr;
}

.docs-page__filters {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgb(var(--border));
}

.docs-page__list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 0.5rem;
  padding: 0.75rem;
}

.docs-entry {
  width: 100%;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  padding: 0.65rem;
  text-align: left;
  display: grid;
  gap: 0.5rem;
  background: rgb(var(--surface));
  cursor: pointer;
}

.docs-entry--active {
  border-color: rgb(var(--primary));
  box-shadow: 0 0 0 1px rgb(var(--primary) / 0.35);
}

.docs-entry__head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.docs-entry__title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.docs-entry__path {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.78rem;
}

.docs-entry__meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.docs-entry__progress-track {
  width: 100%;
  height: 0.35rem;
  border-radius: 999px;
  background: rgb(var(--border));
  overflow: hidden;
}

.docs-entry__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--primary));
  transition: width 0.2s ease;
}

.docs-page__reader {
  display: grid;
  grid-template-rows: auto 1fr;
}

.docs-page__reader-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgb(var(--border));
}

.docs-page__reader-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.docs-page__reader-path {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: rgb(var(--muted));
}

.docs-page__reader-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.docs-page__reader-body {
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.docs-sections {
  margin-bottom: 1rem;
  display: grid;
  gap: 0.5rem;
}

.docs-sections__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}

.docs-sections__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.docs-section-card {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  padding: 0.55rem;
  background: rgb(var(--surface-muted));
}

.docs-section-card__head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.docs-section-card__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.docs-section-card__meta {
  margin: 0.35rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.docs-section-card__track {
  margin-top: 0.4rem;
  width: 100%;
  height: 0.3rem;
  border-radius: 999px;
  background: rgb(var(--border));
  overflow: hidden;
}

.docs-section-card__fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--primary));
}

.docs-page__empty {
  color: rgb(var(--muted));
  font-size: 0.85rem;
}

.docs-markdown {
  color: rgb(var(--text));
  font-size: 0.92rem;
  line-height: 1.45;
}

.docs-markdown :deep(h1),
.docs-markdown :deep(h2),
.docs-markdown :deep(h3) {
  margin: 1.1rem 0 0.6rem;
  font-weight: 700;
}

.docs-markdown :deep(h1) {
  font-size: 1.3rem;
}

.docs-markdown :deep(h2) {
  font-size: 1.1rem;
}

.docs-markdown :deep(h3) {
  font-size: 1rem;
}

.docs-markdown :deep(p),
.docs-markdown :deep(ul),
.docs-markdown :deep(ol) {
  margin: 0.45rem 0;
}

.docs-markdown :deep(ul),
.docs-markdown :deep(ol) {
  padding-left: 1.2rem;
}

.docs-markdown :deep(code) {
  background: rgb(var(--surface-muted));
  border: 1px solid rgb(var(--border));
  border-radius: 0.35rem;
  padding: 0.1rem 0.3rem;
  font-size: 0.84rem;
}

.docs-markdown :deep(pre) {
  border: 1px solid rgb(var(--border));
  border-radius: 0.65rem;
  padding: 0.75rem;
  overflow-x: auto;
  background: rgb(var(--surface-muted));
}

.docs-markdown :deep(pre code) {
  border: 0;
  background: transparent;
  padding: 0;
}

.docs-markdown :deep(a) {
  color: rgb(var(--primary));
}

@media (max-width: 1200px) {
  .docs-page__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .docs-page__bi,
  .docs-page__priorities {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .docs-page__sprints {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .docs-page__content {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(16rem, 34vh) 1fr;
  }

  .docs-sections__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .docs-page__metrics,
  .docs-page__bi,
  .docs-page__priorities,
  .docs-page__sprints {
    grid-template-columns: 1fr;
  }
}
</style>
