<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoAnalyticsRankingResponse } from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  report: FilaAtendimentoAnalyticsRankingResponse | null
  pending: boolean
  errorMessage: string
  scopeLabel?: string
}>()

const monthlyRows = computed(() => props.report?.monthlyRows || [])
const dailyRows = computed(() => props.report?.dailyRows || [])
const alerts = computed(() => props.report?.alerts || [])
const storeComparisons = computed(() => props.report?.storeComparisons || [])
const topMonthly = computed(() => monthlyRows.value[0] || null)
const topDaily = computed(() => dailyRows.value[0] || null)
const featuredAlert = computed(() => alerts.value[0] || null)
const bestMonthlyStore = computed(() => storeComparisons.value[0] || null)
const bestDailyStore = computed(() => {
  if (!storeComparisons.value.length) {
    return null
  }

  return [...storeComparisons.value].sort((left, right) => Number(right.dailySoldValue || 0) - Number(left.dailySoldValue || 0))[0] || null
})

const monthlyTopFive = computed(() => monthlyRows.value.slice(0, 5))
const dailyTopFive = computed(() => dailyRows.value.slice(0, 5))

function alertTypeLabel(type: string | undefined) {
  switch (String(type || '').trim()) {
    case 'conversion':
      return 'Conversão'
    case 'queueJump':
      return 'Fora da vez'
    case 'pa':
      return 'P.A.'
    case 'ticket':
      return 'Ticket médio'
    default:
      return 'Indicador'
  }
}
</script>

<template>
  <section class="admin-panel" data-testid="ranking-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Ranking simples</h2>
      <p class="admin-panel__text">Quem está puxando venda, quem se destacou hoje e onde precisa de atenção.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Loja selecionada' }}</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !monthlyRows.length && !dailyRows.length" class="insight-card">
      <p class="settings-card__text">Carregando ranking do recorte atual...</p>
    </article>

    <template v-else>
      <section class="metric-grid">
        <article class="metric-card">
          <span class="metric-card__label">{{ storeComparisons.length ? 'Melhor loja no mês' : 'Mais vendeu no mês' }}</span>
          <strong class="metric-card__value">{{ storeComparisons.length ? (bestMonthlyStore?.storeName || 'Sem dados') : (topMonthly?.consultantName || 'Sem dados') }}</strong>
          <span class="metric-card__text">{{ formatCurrencyBRL(storeComparisons.length ? (bestMonthlyStore?.monthlySoldValue || 0) : (topMonthly?.soldValue || 0)) }}</span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">{{ storeComparisons.length ? 'Melhor loja hoje' : 'Destaque de hoje' }}</span>
          <strong class="metric-card__value">{{ storeComparisons.length ? (bestDailyStore?.storeName || 'Sem dados') : (topDaily?.consultantName || 'Sem dados') }}</strong>
          <span class="metric-card__text">{{ formatCurrencyBRL(storeComparisons.length ? (bestDailyStore?.dailySoldValue || 0) : (topDaily?.soldValue || 0)) }}</span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">Conversão do líder</span>
          <strong class="metric-card__value">{{ formatPercent(topMonthly?.conversionRate || 0) }}</strong>
          <span class="metric-card__text">
            {{ topMonthly?.storeName ? `${topMonthly.storeName} · mês atual` : 'Mês atual' }}
          </span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">Atenções</span>
          <strong class="metric-card__value">{{ alerts.length }}</strong>
          <span class="metric-card__text">{{ alerts.length ? 'Abrir detalhes para entender' : 'Sem alerta no recorte' }}</span>
        </article>
      </section>

      <article v-if="featuredAlert" class="alert-list">
        <div class="alert-list__header">
          <strong class="alert-list__title">Primeiro ponto de atenção</strong>
          <span class="metric-card__text">{{ alerts.length }} ocorrência(s)</span>
        </div>
        <div class="alert-item">
          <strong>
            {{ featuredAlert.consultantName || 'Consultor' }}
            <span v-if="featuredAlert.storeName || featuredAlert.storeCode" class="queue-card__store-badge">{{ featuredAlert.storeName || featuredAlert.storeCode }}</span>
          </strong>
          <span>{{ alertTypeLabel(featuredAlert.type) }} em {{ Number(featuredAlert.value || 0).toFixed(1) }} com limite {{ Number(featuredAlert.threshold || 0).toFixed(1) }}.</span>
        </div>
      </article>

      <article v-if="storeComparisons.length" class="insight-card">
        <h3 class="insight-card__title">Comparativo entre lojas</h3>
        <div class="simple-list">
          <div v-for="store in storeComparisons" :key="store.storeId || store.storeName" class="simple-list__item">
            <strong>{{ store.storeName || store.storeCode || 'Loja' }}</strong>
            <span>
              {{ formatCurrencyBRL(store.monthlySoldValue || 0) }} no mês · {{ formatCurrencyBRL(store.dailySoldValue || 0) }} hoje · {{ Number(store.alerts || 0) }} alerta(s)
            </span>
          </div>
        </div>
      </article>

      <div class="insight-grid insight-grid--two">
        <article class="insight-card">
          <h3 class="insight-card__title">Top do mês</h3>
          <div class="simple-list">
            <div v-for="(row, index) in monthlyTopFive" :key="row.consultantId || row.consultantName" class="simple-list__item">
              <strong>
                {{ index + 1 }}. {{ row.consultantName || '-' }}
                <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
              </strong>
              <span>{{ formatCurrencyBRL(row.soldValue || 0) }} · {{ formatPercent(row.conversionRate || 0) }}</span>
            </div>
            <span v-if="!monthlyTopFive.length" class="settings-card__text">Sem dados mensais.</span>
          </div>
        </article>

        <article class="insight-card">
          <h3 class="insight-card__title">Top de hoje</h3>
          <div class="simple-list">
            <div v-for="(row, index) in dailyTopFive" :key="row.consultantId || row.consultantName" class="simple-list__item">
              <strong>
                {{ index + 1 }}. {{ row.consultantName || '-' }}
                <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
              </strong>
              <span>{{ formatCurrencyBRL(row.soldValue || 0) }} · P.A. {{ Number(row.paScore || 0).toFixed(2) }}</span>
            </div>
            <span v-if="!dailyTopFive.length" class="settings-card__text">Sem dados diários.</span>
          </div>
        </article>
      </div>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver ranking completo e critérios</span>
          <AppMaterialIcon name="expand_more" />
        </summary>
        <div class="detail-collapse__content">
          <article class="insight-card">
            <h3 class="insight-card__title">Ranking completo do mês</h3>
            <div class="table-wrap">
              <table class="module-table">
                <thead>
                  <tr>
                    <th>Consultor</th>
                    <th>Venda</th>
                    <th>Atend.</th>
                    <th>Conv.</th>
                    <th>Ticket</th>
                    <th>P.A.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in monthlyRows" :key="row.consultantId || row.consultantName">
                    <td>
                      <div class="ranking-person-cell">
                        <strong>{{ row.consultantName || '-' }}</strong>
                        <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
                      </div>
                    </td>
                    <td>{{ formatCurrencyBRL(row.soldValue || 0) }}</td>
                    <td>{{ Number(row.attendances || 0) }}</td>
                    <td>{{ formatPercent(row.conversionRate || 0) }}</td>
                    <td>{{ formatCurrencyBRL(row.ticketAverage || 0) }}</td>
                    <td>{{ Number(row.paScore || 0).toFixed(2) }}</td>
                  </tr>
                  <tr v-if="!monthlyRows.length">
                    <td colspan="6">Sem dados mensais.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="insight-card">
            <h3 class="insight-card__title">Ranking completo de hoje</h3>
            <div class="table-wrap">
              <table class="module-table">
                <thead>
                  <tr>
                    <th>Consultor</th>
                    <th>Venda</th>
                    <th>Atend.</th>
                    <th>Conv.</th>
                    <th>Ticket</th>
                    <th>P.A.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in dailyRows" :key="row.consultantId || row.consultantName">
                    <td>
                      <div class="ranking-person-cell">
                        <strong>{{ row.consultantName || '-' }}</strong>
                        <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
                      </div>
                    </td>
                    <td>{{ formatCurrencyBRL(row.soldValue || 0) }}</td>
                    <td>{{ Number(row.attendances || 0) }}</td>
                    <td>{{ formatPercent(row.conversionRate || 0) }}</td>
                    <td>{{ formatCurrencyBRL(row.ticketAverage || 0) }}</td>
                    <td>{{ Number(row.paScore || 0).toFixed(2) }}</td>
                  </tr>
                  <tr v-if="!dailyRows.length">
                    <td colspan="6">Sem dados diários.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article v-if="alerts.length" class="insight-card">
            <h3 class="insight-card__title">Por que apareceu alerta</h3>
            <div class="simple-list">
              <div v-for="(alert, index) in alerts" :key="`${alert.consultantId}-${index}`" class="simple-list__item">
                <strong>
                  {{ alert.consultantName || 'Consultor' }} · {{ alertTypeLabel(alert.type) }}
                  <span v-if="alert.storeName || alert.storeCode" class="queue-card__store-badge">{{ alert.storeName || alert.storeCode }}</span>
                </strong>
                <span>Atual: {{ Number(alert.value || 0).toFixed(1) }} · Limite: {{ Number(alert.threshold || 0).toFixed(1) }}</span>
              </div>
            </div>
          </article>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.ranking-person-cell {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}
</style>
