<script setup lang="ts">
import type {
  IndicatorSectionModel,
  IndicatorStoreCard,
  IndicatorTone
} from '~/types/indicators'

const props = defineProps<{
  section: IndicatorSectionModel
}>()

const detailOpen = ref(false)
const selectedStoreId = ref('')

const selectedStore = computed(() => {
  return props.section.stores.find((store) => store.id === selectedStoreId.value) ?? null
})

function openStoreDetails(store: IndicatorStoreCard) {
  selectedStoreId.value = store.id
  detailOpen.value = true
}

function badgeColor(tone?: IndicatorTone) {
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'
  if (tone === 'error') return 'error'
  return 'neutral'
}
</script>

<template>
  <section class="indicator-section">
    <div class="indicator-section__grid">
      <UCard class="indicator-section__chart-card" :ui="{ body: 'indicator-section__chart-body' }">
        <template #header>
          <div class="indicator-section__header">
            <div>
              <p class="indicator-section__eyebrow">Indicador {{ section.order }}</p>
              <h3 class="indicator-section__title">{{ section.order }} - {{ section.title }} ({{ section.weight }}%)</h3>
              <p class="indicator-section__description">{{ section.description }}</p>
            </div>
          </div>
        </template>

        <IndicatorsBarChart :items="section.chart" />
      </UCard>

      <UCard class="indicator-section__stores-card" :ui="{ body: 'indicator-section__stores-body' }">
        <div class="indicator-section__items-block">
          <p class="indicator-section__items-title">Itens avaliados nesse indicador</p>

          <div class="indicator-section__items-list">
            <span v-for="item in section.itemLabels" :key="item" class="indicator-section__item-chip">
              {{ item }}
            </span>
          </div>
        </div>

        <div class="indicator-section__stores-grid">
          <article
            v-for="store in section.stores"
            :key="store.id"
            class="indicator-section__store-card"
            :style="{ '--store-accent': store.accentColor }"
          >
            <div class="indicator-section__store-head">
              <div>
                <h4 class="indicator-section__store-name">{{ store.unitName }}</h4>
                <p class="indicator-section__store-score-label">{{ store.scoreLabel }}</p>
              </div>

              <div class="indicator-section__store-score-badge">
                {{ store.scoreValue }}
              </div>
            </div>

            <p v-if="store.scoreDescription" class="indicator-section__store-score-description">
              {{ store.scoreDescription }}
            </p>

            <div v-if="store.emptyMessage" class="indicator-section__empty-copy">
              {{ store.emptyMessage }}
            </div>

            <div v-else class="indicator-section__store-content">
              <div class="indicator-section__metrics">
                <div v-for="metric in store.metrics" :key="metric.id" class="indicator-section__metric-row">
                  <span class="indicator-section__metric-label">{{ metric.label }}</span>
                  <UBadge :color="badgeColor(metric.tone)" variant="soft">
                    {{ metric.value }}
                  </UBadge>
                </div>
              </div>

              <div v-if="store.bullets.length" class="indicator-section__bullets">
                <p v-if="store.bulletTitle" class="indicator-section__bullet-title">{{ store.bulletTitle }}</p>
                <ul class="indicator-section__bullet-list">
                  <li v-for="bullet in store.bullets" :key="bullet">{{ bullet }}</li>
                </ul>
              </div>

              <UButton
                v-if="store.detailEntries.length"
                icon="i-lucide-search"
                color="primary"
                variant="soft"
                size="sm"
                class="indicator-section__details-button"
                @click="openStoreDetails(store)"
              >
                {{ store.ctaLabel || 'Ver detalhes' }}
              </UButton>
            </div>
          </article>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="detailOpen"
      :title="selectedStore ? `${section.order}. ${section.title} - ${selectedStore.unitName}` : `${section.order}. ${section.title}`"
      :description="selectedStore?.scoreDescription || section.description"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #body>
        <div v-if="selectedStore" class="indicator-section__modal-body">
          <div class="indicator-section__modal-summary" :style="{ '--store-accent': selectedStore.accentColor }">
            <div>
              <p class="indicator-section__modal-summary-label">{{ selectedStore.scoreLabel }}</p>
              <strong class="indicator-section__modal-summary-value">{{ selectedStore.scoreValue }}</strong>
            </div>

            <div class="indicator-section__modal-metrics">
              <UBadge
                v-for="metric in selectedStore.metrics"
                :key="`${selectedStore.id}-${metric.id}`"
                :color="badgeColor(metric.tone)"
                variant="soft"
              >
                {{ metric.label }}: {{ metric.value }}
              </UBadge>
            </div>
          </div>

          <article
            v-for="entry in selectedStore.detailEntries"
            :key="entry.id"
            class="indicator-section__detail-card"
          >
            <div class="indicator-section__detail-header">
              <div>
                <h4 class="indicator-section__detail-title">Avaliador: {{ entry.evaluatorName }}</h4>
                <p class="indicator-section__detail-date">{{ entry.evaluatedAt }}</p>
              </div>

              <div class="indicator-section__detail-scores">
                <UBadge color="neutral" variant="soft">Nota bruta: {{ entry.rawScore }}</UBadge>
                <UBadge color="primary" variant="soft">Nota final: {{ entry.finalScore }}</UBadge>
              </div>
            </div>

            <div class="indicator-section__detail-lines">
              <div v-for="line in entry.lines" :key="line.id" class="indicator-section__detail-line">
                <span>{{ line.label }}</span>
                <UBadge :color="badgeColor(line.tone)" variant="soft">
                  {{ line.value }}
                </UBadge>
              </div>
            </div>

            <div v-if="entry.assets && entry.assets.length" class="indicator-section__assets-grid">
              <article
                v-for="asset in entry.assets"
                :key="asset.id"
                class="indicator-section__asset-card"
                :style="{ '--asset-accent': asset.accentColor || selectedStore.accentColor }"
              >
                <span class="indicator-section__asset-tag">Evidencia</span>
                <strong class="indicator-section__asset-title">{{ asset.title }}</strong>
                <p class="indicator-section__asset-preview">{{ asset.previewLabel }}</p>
              </article>
            </div>
          </article>

          <p v-if="selectedStore.detailFooter" class="indicator-section__detail-footer">
            {{ selectedStore.detailFooter }}
          </p>
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.indicator-section {
  display: grid;
}

.indicator-section__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
}

.indicator-section__chart-card,
.indicator-section__stores-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgb(var(--surface-2));
}

.indicator-section__chart-body,
.indicator-section__stores-body {
  display: grid;
  gap: 1rem;
}

.indicator-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicator-section__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicator-section__title {
  margin: 0;
  font-size: 1.05rem;
}

.indicator-section__description {
  margin: 0.45rem 0 0;
  color: rgb(var(--muted));
}

.indicator-section__items-block {
  display: grid;
  gap: 0.8rem;
}

.indicator-section__items-title {
  margin: 0;
  font-weight: 600;
}

.indicator-section__items-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.indicator-section__item-chip {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.84rem;
}

.indicator-section__stores-grid {
  display: grid;
  gap: 0.95rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicator-section__store-card {
  position: relative;
  display: grid;
  gap: 0.85rem;
  min-height: 100%;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--store-accent) 22%, rgba(148, 163, 184, 0.16));
  border-radius: 1rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(15, 23, 42, 0.12) 100%),
    rgba(15, 23, 42, 0.12);
}

.indicator-section__store-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicator-section__store-name {
  margin: 0;
  font-size: 1rem;
}

.indicator-section__store-score-label {
  margin: 0.25rem 0 0;
  font-size: 0.76rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicator-section__store-score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.8rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--store-accent) 16%, rgba(255, 255, 255, 0.04));
  font-weight: 700;
}

.indicator-section__store-score-description {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.84rem;
}

.indicator-section__store-content {
  display: grid;
  gap: 0.85rem;
}

.indicator-section__metrics {
  display: grid;
  gap: 0.55rem;
}

.indicator-section__metric-row,
.indicator-section__detail-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicator-section__metric-label {
  font-size: 0.84rem;
  color: rgb(var(--muted));
}

.indicator-section__bullets {
  display: grid;
  gap: 0.45rem;
}

.indicator-section__bullet-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.indicator-section__bullet-list {
  margin: 0;
  padding-left: 1rem;
  display: grid;
  gap: 0.3rem;
}

.indicator-section__details-button {
  justify-self: start;
}

.indicator-section__empty-copy {
  padding: 1rem;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  border-radius: 0.9rem;
  color: rgb(var(--muted));
}

.indicator-section__modal-body {
  display: grid;
  gap: 1rem;
}

.indicator-section__modal-summary {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--store-accent) 22%, rgba(148, 163, 184, 0.16));
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicator-section__modal-summary-label {
  margin: 0 0 0.35rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.76rem;
}

.indicator-section__modal-summary-value {
  font-size: 1.25rem;
}

.indicator-section__modal-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.indicator-section__detail-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicator-section__detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicator-section__detail-title {
  margin: 0;
  font-size: 0.98rem;
}

.indicator-section__detail-date {
  margin: 0.3rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicator-section__detail-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.indicator-section__detail-lines {
  display: grid;
  gap: 0.6rem;
}

.indicator-section__assets-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
}

.indicator-section__asset-card {
  display: grid;
  gap: 0.45rem;
  min-height: 8rem;
  padding: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--asset-accent) 24%, rgba(148, 163, 184, 0.16));
  border-radius: 1rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--asset-accent) 12%, rgba(255, 255, 255, 0.02)) 0%, rgba(15, 23, 42, 0.12) 100%),
    rgba(255, 255, 255, 0.03);
}

.indicator-section__asset-tag {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicator-section__asset-title {
  font-size: 0.92rem;
}

.indicator-section__asset-preview {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicator-section__detail-footer {
  margin: 0;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .indicator-section__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .indicator-section__stores-grid {
    grid-template-columns: 1fr;
  }

  .indicator-section__detail-header,
  .indicator-section__metric-row,
  .indicator-section__detail-line {
    flex-direction: column;
    align-items: flex-start;
  }

  .indicator-section__detail-scores {
    justify-content: flex-start;
  }
}
</style>