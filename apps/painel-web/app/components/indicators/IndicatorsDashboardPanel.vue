<script setup lang="ts">
import type { IndicatorDashboardModel } from '~/types/indicators'

defineProps<{
  dashboard: IndicatorDashboardModel
}>()

function formatScore(value: number) {
  return `${value.toFixed(1)}%`
}
</script>

<template>
  <UCard class="indicators-dashboard" :ui="{ body: 'indicators-dashboard__body' }">
    <template #header>
      <div class="indicators-dashboard__header">
        <div>
          <p class="indicators-dashboard__eyebrow">Dashboard</p>
          <h2 class="indicators-dashboard__title">{{ dashboard.title }}</h2>
          <p class="indicators-dashboard__description">{{ dashboard.description }}</p>
        </div>
      </div>
    </template>

    <div class="indicators-dashboard__grid">
      <div class="indicators-dashboard__chart-panel">
        <IndicatorsBarChart :items="dashboard.chart" />
      </div>

      <div class="indicators-dashboard__side-panel">
        <div class="indicators-dashboard__stats">
          <article v-for="stat in dashboard.stats" :key="stat.id" class="indicators-dashboard__stat-card">
            <p class="indicators-dashboard__stat-label">{{ stat.label }}</p>
            <strong class="indicators-dashboard__stat-value">{{ stat.value }}</strong>
            <p v-if="stat.helper" class="indicators-dashboard__stat-helper">{{ stat.helper }}</p>
          </article>
        </div>

        <div class="indicators-dashboard__ranking">
          <div class="indicators-dashboard__ranking-header">
            <p class="indicators-dashboard__ranking-title">Ranking de lojas</p>
            <span class="indicators-dashboard__ranking-subtitle">Media ponderada do periodo</span>
          </div>

          <div class="indicators-dashboard__ranking-list">
            <article
              v-for="(item, index) in dashboard.ranking"
              :key="item.id"
              class="indicators-dashboard__ranking-item"
              :style="{ '--ranking-accent': item.accentColor }"
            >
              <div class="indicators-dashboard__ranking-order">{{ index + 1 }}</div>

              <div class="indicators-dashboard__ranking-copy">
                <div class="indicators-dashboard__ranking-row">
                  <strong>{{ item.unitName }}</strong>
                  <span>{{ formatScore(item.score) }}</span>
                </div>

                <p v-if="item.helper" class="indicators-dashboard__ranking-helper">{{ item.helper }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
.indicators-dashboard {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 36%),
    rgba(15, 23, 42, 0.18);
}

.indicators-dashboard__body {
  display: grid;
  gap: 1rem;
}

.indicators-dashboard__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-dashboard__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-dashboard__title {
  margin: 0;
  font-size: 1.1rem;
}

.indicators-dashboard__description {
  margin: 0.45rem 0 0;
  color: rgb(var(--muted));
}

.indicators-dashboard__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.3fr) minmax(19rem, 0.9fr);
}

.indicators-dashboard__chart-panel {
  min-width: 0;
}

.indicators-dashboard__side-panel {
  display: grid;
  gap: 1rem;
}

.indicators-dashboard__stats {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-dashboard__stat-card {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
}

.indicators-dashboard__stat-label {
  margin: 0;
  font-size: 0.75rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-dashboard__stat-value {
  font-size: 1rem;
}

.indicators-dashboard__stat-helper {
  margin: 0;
  font-size: 0.82rem;
  color: rgb(var(--muted));
}

.indicators-dashboard__ranking {
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
}

.indicators-dashboard__ranking-header {
  display: grid;
  gap: 0.2rem;
  margin-bottom: 0.85rem;
}

.indicators-dashboard__ranking-title {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 600;
}

.indicators-dashboard__ranking-subtitle {
  font-size: 0.8rem;
  color: rgb(var(--muted));
}

.indicators-dashboard__ranking-list {
  display: grid;
  gap: 0.75rem;
}

.indicators-dashboard__ranking-item {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
}

.indicators-dashboard__ranking-order {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ranking-accent) 18%, rgba(255, 255, 255, 0.02));
  color: rgb(var(--text));
  font-weight: 700;
}

.indicators-dashboard__ranking-copy {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.indicators-dashboard__ranking-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicators-dashboard__ranking-helper {
  margin: 0;
  font-size: 0.82rem;
  color: rgb(var(--muted));
}

@media (max-width: 1024px) {
  .indicators-dashboard__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .indicators-dashboard__stats {
    grid-template-columns: 1fr;
  }
}
</style>