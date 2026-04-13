<script setup lang="ts">
import type { IndicatorsTemplateCatalogItem } from '~/types/indicators-management'

const props = defineProps<{
  templates: IndicatorsTemplateCatalogItem[]
  selectedTemplateId: string
}>()

const emit = defineEmits<{
  'update:selected-template-id': [value: string]
  publish: []
  duplicate: []
}>()

const selectedTemplate = computed(() => props.templates.find(template => template.id === props.selectedTemplateId) ?? props.templates[0] ?? null)

function badgeColor(status: IndicatorsTemplateCatalogItem['status']) {
  if (status === 'active') return 'success'
  if (status === 'draft') return 'warning'
  return 'neutral'
}
</script>

<template>
  <div class="indicators-governance-templates">
    <div class="indicators-governance-templates__list">
      <button
        v-for="template in props.templates"
        :key="template.id"
        type="button"
        class="indicators-governance-templates__template-card"
        :class="{ 'is-active': selectedTemplate?.id === template.id }"
        @click="emit('update:selected-template-id', template.id)"
      >
        <div class="indicators-governance-templates__template-head">
          <strong>{{ template.name }}</strong>
          <UBadge :color="badgeColor(template.status)" variant="soft">{{ template.status }}</UBadge>
        </div>
        <p>{{ template.description }}</p>
        <div class="indicators-governance-templates__template-meta">
          <span>{{ template.categoryCount }} categorias</span>
          <span>{{ template.indicatorCount }} indicadores</span>
          <span>{{ template.clientCount }} clientes</span>
        </div>
      </button>
    </div>

    <UCard v-if="selectedTemplate" class="indicators-governance-templates__detail" :ui="{ body: 'indicators-governance-templates__detail-body' }">
      <template #header>
        <div class="indicators-governance-templates__detail-head">
          <div>
            <p class="indicators-governance-templates__eyebrow">Template selecionado</p>
            <h3 class="indicators-governance-templates__title">{{ selectedTemplate.name }}</h3>
            <p class="indicators-governance-templates__copy">{{ selectedTemplate.code }} | Escopo default: {{ selectedTemplate.defaultScopeMode }}</p>
          </div>

          <div class="indicators-governance-templates__detail-actions">
            <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="emit('duplicate')">
              Duplicar
            </UButton>
            <UButton color="primary" icon="i-lucide-rocket" @click="emit('publish')">
              Publicar draft
            </UButton>
          </div>
        </div>
      </template>

      <div class="indicators-governance-templates__version-list">
        <article
          v-for="version in selectedTemplate.versions"
          :key="version.id"
          class="indicators-governance-templates__version-card"
        >
          <div class="indicators-governance-templates__version-head">
            <strong>{{ version.versionLabel }}</strong>
            <UBadge :color="badgeColor(version.status)" variant="soft">{{ version.status }}</UBadge>
          </div>
          <p>{{ version.note }}</p>
          <span v-if="version.publishedAt" class="indicators-governance-templates__version-date">Publicado em {{ version.publishedAt }}</span>
        </article>
      </div>

      <div class="indicators-governance-templates__highlight-grid">
        <article
          v-for="highlight in selectedTemplate.highlights"
          :key="highlight"
          class="indicators-governance-templates__highlight-card"
        >
          {{ highlight }}
        </article>
      </div>
    </UCard>
  </div>
</template>

<style scoped>
.indicators-governance-templates {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
}

.indicators-governance-templates__list {
  display: grid;
  gap: 0.85rem;
}

.indicators-governance-templates__template-card {
  display: grid;
  gap: 0.55rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
  color: rgb(var(--text));
  text-align: left;
}

.indicators-governance-templates__template-card.is-active {
  border-color: rgba(15, 118, 110, 0.48);
  background: rgba(15, 118, 110, 0.12);
}

.indicators-governance-templates__template-head,
.indicators-governance-templates__version-head,
.indicators-governance-templates__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicators-governance-templates__template-card p,
.indicators-governance-templates__copy,
.indicators-governance-templates__version-card p {
  margin: 0;
  color: rgb(var(--muted));
}

.indicators-governance-templates__template-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicators-governance-templates__detail {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.indicators-governance-templates__detail-body {
  display: grid;
  gap: 1rem;
}

.indicators-governance-templates__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-governance-templates__title {
  margin: 0;
  font-size: 1.05rem;
}

.indicators-governance-templates__detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.indicators-governance-templates__version-list,
.indicators-governance-templates__highlight-grid {
  display: grid;
  gap: 0.8rem;
}

.indicators-governance-templates__version-card,
.indicators-governance-templates__highlight-card {
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicators-governance-templates__version-date {
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

@media (max-width: 980px) {
  .indicators-governance-templates {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .indicators-governance-templates__detail-head,
  .indicators-governance-templates__template-head,
  .indicators-governance-templates__version-head {
    flex-direction: column;
  }
}
</style>