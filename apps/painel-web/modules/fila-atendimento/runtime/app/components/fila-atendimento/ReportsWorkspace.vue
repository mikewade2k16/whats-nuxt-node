<script setup lang="ts">
import { reactive, watch } from 'vue'
import type {
  FilaAtendimentoOperationState,
  FilaAtendimentoReportFilters,
  FilaAtendimentoReportsOverviewResponse,
  FilaAtendimentoReportsRecentServicesResponse,
  FilaAtendimentoReportsResultsResponse
} from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatDateTime, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  state: FilaAtendimentoOperationState
  reportOverview: FilaAtendimentoReportsOverviewResponse | null
  reportResults: FilaAtendimentoReportsResultsResponse | null
  recentServices: FilaAtendimentoReportsRecentServicesResponse | null
  filters: FilaAtendimentoReportFilters
  pending: boolean
  errorMessage: string
  scopeLabel?: string
  storeOptions?: Array<{ value: string; label: string }>
  showStoreFilter?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  'update-filter': [filterId: keyof FilaAtendimentoReportFilters, value: string]
  'reset-filters': []
}>()

const localFilters = reactive<FilaAtendimentoReportFilters>({
  dateFrom: '',
  dateTo: '',
  storeId: ''
})

watch(
  () => props.filters,
  (filters) => {
    localFilters.dateFrom = filters.dateFrom
    localFilters.dateTo = filters.dateTo
    localFilters.storeId = filters.storeId
  },
  { immediate: true, deep: true }
)

const storeComparisons = computed(() => props.reportOverview?.storeComparisons || [])

function updateFilter(filterId: keyof FilaAtendimentoReportFilters) {
  emit('update-filter', filterId, localFilters[filterId])
}

function outcomeLabel(value: unknown) {
  const normalized = String(value || '').trim()
  if (normalized === 'compra') return 'Compra'
  if (normalized === 'reserva') return 'Reserva'
  return 'Não compra'
}
</script>

<template>
  <section class="admin-panel" data-testid="reports-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Relatórios operacionais</h2>
      <p class="admin-panel__text">Leitura de performance, conversão, tempos e histórico de fechamento.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Loja selecionada' }}</p>
    </header>

    <div class="toolbar-card">
      <label class="toolbar-card__field">
        <span class="module-shell__label">De</span>
        <input v-model="localFilters.dateFrom" class="module-shell__input" type="date" @change="updateFilter('dateFrom')">
      </label>
      <label class="toolbar-card__field">
        <span class="module-shell__label">Até</span>
        <input v-model="localFilters.dateTo" class="module-shell__input" type="date" @change="updateFilter('dateTo')">
      </label>
      <label v-if="showStoreFilter" class="toolbar-card__field">
        <span class="module-shell__label">Loja</span>
        <select v-model="localFilters.storeId" class="module-shell__input" @change="updateFilter('storeId')">
          <option value="">Todas as lojas</option>
          <option v-for="option in storeOptions || []" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <div class="toolbar-card__actions">
        <button class="column-action column-action--secondary" type="button" :disabled="pending" @click="emit('reset-filters')">Limpar</button>
        <button class="column-action column-action--primary" type="button" :disabled="pending" @click="emit('refresh')">Atualizar</button>
      </div>
    </div>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !reportOverview" class="insight-card">
      <p class="settings-card__text">Carregando relatórios do recorte atual...</p>
    </article>

    <template v-else>
      <section class="metric-grid">
        <article class="metric-card"><span class="metric-card__label">Atendimentos</span><strong class="metric-card__value">{{ Number(reportOverview?.metrics?.totalAttendances || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Conversão</span><strong class="metric-card__value">{{ formatPercent(reportOverview?.metrics?.conversionRate || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Valor vendido</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.soldValue || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Ticket médio</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.averageTicket || 0) }}</strong></article>
      </section>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver tempos e campanhas</span>
          <strong>4 indicador(es)</strong>
        </summary>
        <div class="detail-collapse__content metric-grid">
          <article class="metric-card"><span class="metric-card__label">Tempo médio</span><strong class="metric-card__value">{{ formatDurationMinutes(reportOverview?.metrics?.averageDurationMs || 0) }}</strong></article>
          <article class="metric-card"><span class="metric-card__label">Espera média</span><strong class="metric-card__value">{{ formatDurationMinutes(reportOverview?.metrics?.averageQueueWaitMs || 0) }}</strong></article>
          <article class="metric-card"><span class="metric-card__label">Fora da vez</span><strong class="metric-card__value">{{ formatPercent(reportOverview?.metrics?.queueJumpRate || 0) }}</strong></article>
          <article class="metric-card"><span class="metric-card__label">Bônus campanhas</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.campaignBonusTotal || 0) }}</strong></article>
        </div>
      </details>

      <article v-if="storeComparisons.length" class="insight-card">
        <h3 class="insight-card__title">Comparativo entre lojas</h3>
        <div class="simple-list">
          <div v-for="store in storeComparisons" :key="store.storeId || store.storeName" class="simple-list__item">
            <strong>
              {{ store.storeName || store.storeCode || 'Loja' }}
              <span v-if="store.storeName || store.storeCode" class="queue-card__store-badge">{{ store.storeCode || store.storeName }}</span>
            </strong>
            <span>
              {{ formatCurrencyBRL(store.soldValue || 0) }} · {{ formatPercent(store.conversionRate || 0) }} · {{ Number(store.totalAttendances || 0) }} atend.
            </span>
          </div>
        </div>
      </article>

      <div class="insight-grid insight-grid--two">
        <article class="insight-card">
          <h3 class="insight-card__title">Equipe no recorte</h3>
          <div class="table-wrap">
            <table class="module-table">
              <thead>
                <tr>
                  <th>Consultor</th>
                  <th>Atend.</th>
                  <th>Conv.</th>
                  <th>Venda</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in reportOverview?.chartData?.consultantAgg || []" :key="row.consultantId || row.consultantName">
                  <td>
                    <div class="reports-person-cell">
                      <strong>{{ row.consultantName || '-' }}</strong>
                      <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
                    </div>
                  </td>
                  <td>{{ Number(row.attendances || 0) }}</td>
                  <td>{{ Number(row.conversions || 0) }}</td>
                  <td>{{ formatCurrencyBRL(row.saleAmount || 0) }}</td>
                </tr>
                <tr v-if="!(reportOverview?.chartData?.consultantAgg || []).length">
                  <td colspan="4">Nenhum agregado disponível para o recorte atual.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="insight-card">
          <h3 class="insight-card__title">Historico recente</h3>
          <div class="table-wrap">
            <table class="module-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Consultor</th>
                  <th>Cliente</th>
                  <th>Desfecho</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in recentServices?.items || []" :key="row.serviceId || `${row.consultantName}-${row.finishedAt}`">
                  <td>{{ formatDateTime(row.finishedAt) }}</td>
                  <td>
                    <div class="reports-person-cell">
                      <strong>{{ row.consultantName || '-' }}</strong>
                      <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
                    </div>
                  </td>
                  <td>{{ row.customerName || '-' }}</td>
                  <td>{{ outcomeLabel(row.outcome) }}</td>
                </tr>
                <tr v-if="!(recentServices?.items || []).length">
                  <td colspan="4">Nenhum atendimento recente encontrado.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver resultado completo</span>
          <strong>{{ Number(reportResults?.total || (reportResults?.rows || []).length || 0) }} registro(s)</strong>
        </summary>
        <div class="detail-collapse__content">
          <article class="insight-card insight-card--wide">
            <h3 class="insight-card__title">Resultado detalhado</h3>
            <div class="table-wrap">
              <table class="module-table module-table--wide">
                <thead>
                  <tr>
                    <th>Finalizado</th>
                    <th>Consultor</th>
                    <th>Cliente</th>
                    <th>Desfecho</th>
                    <th>Venda</th>
                <th>Duração</th>
                    <th>Espera</th>
                    <th>Produto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in reportResults?.rows || []" :key="row.serviceId || `${row.personId}-${row.finishedAt}`">
                    <td>{{ formatDateTime(row.finishedAt) }}</td>
                    <td>
                      <div class="reports-person-cell">
                        <strong>{{ row.consultantName || row.personName || '-' }}</strong>
                        <span v-if="row.storeName || row.storeCode" class="queue-card__store-badge">{{ row.storeName || row.storeCode }}</span>
                      </div>
                    </td>
                    <td>{{ row.customerName || '-' }}</td>
                    <td>{{ outcomeLabel(row.outcome || row.finishOutcome) }}</td>
                    <td>{{ formatCurrencyBRL(row.saleAmount || 0) }}</td>
                    <td>{{ formatDurationMinutes(row.durationMs || 0) }}</td>
                    <td>{{ formatDurationMinutes(row.queueWaitMs || 0) }}</td>
                    <td>{{ row.productClosed || row.productSeen || '-' }}</td>
                  </tr>
                  <tr v-if="!(reportResults?.rows || []).length">
                    <td colspan="8">Nenhum fechamento encontrado para os filtros atuais.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.reports-person-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
}
</style>
