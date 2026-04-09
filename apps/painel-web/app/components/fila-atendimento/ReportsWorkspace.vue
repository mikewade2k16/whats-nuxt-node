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
}>()

const emit = defineEmits<{
  refresh: []
  'update-filter': [filterId: keyof FilaAtendimentoReportFilters, value: string]
  'reset-filters': []
}>()

const localFilters = reactive<FilaAtendimentoReportFilters>({
  dateFrom: '',
  dateTo: '',
  search: ''
})

watch(
  () => props.filters,
  (filters) => {
    localFilters.dateFrom = filters.dateFrom
    localFilters.dateTo = filters.dateTo
    localFilters.search = filters.search
  },
  { immediate: true, deep: true }
)

function updateFilter(filterId: keyof FilaAtendimentoReportFilters) {
  emit('update-filter', filterId, localFilters[filterId])
}

function outcomeLabel(value: unknown) {
  const normalized = String(value || '').trim()
  if (normalized === 'compra') return 'Compra'
  if (normalized === 'reserva') return 'Reserva'
  return 'Nao compra'
}
</script>

<template>
  <section class="admin-panel" data-testid="reports-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Relatorios operacionais</h2>
      <p class="admin-panel__text">Leitura de performance, conversao, tempos e historico de fechamento.</p>
    </header>

    <div class="toolbar-card">
      <label class="toolbar-card__field">
        <span class="module-shell__label">De</span>
        <input v-model="localFilters.dateFrom" class="module-shell__input" type="date" @change="updateFilter('dateFrom')">
      </label>
      <label class="toolbar-card__field">
        <span class="module-shell__label">Ate</span>
        <input v-model="localFilters.dateTo" class="module-shell__input" type="date" @change="updateFilter('dateTo')">
      </label>
      <label class="toolbar-card__field toolbar-card__field--grow">
        <span class="module-shell__label">Busca</span>
        <input v-model="localFilters.search" class="module-shell__input" type="text" placeholder="Cliente, consultor, produto" @change="updateFilter('search')">
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
      <p class="settings-card__text">Carregando relatorios da loja ativa...</p>
    </article>

    <template v-else>
      <section class="metric-grid">
        <article class="metric-card"><span class="metric-card__label">Atendimentos</span><strong class="metric-card__value">{{ Number(reportOverview?.metrics?.totalAttendances || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Conversao</span><strong class="metric-card__value">{{ formatPercent(reportOverview?.metrics?.conversionRate || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Valor vendido</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.soldValue || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Ticket medio</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.averageTicket || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Tempo medio</span><strong class="metric-card__value">{{ formatDurationMinutes(reportOverview?.metrics?.averageDurationMs || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Espera media</span><strong class="metric-card__value">{{ formatDurationMinutes(reportOverview?.metrics?.averageQueueWaitMs || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Fora da vez</span><strong class="metric-card__value">{{ formatPercent(reportOverview?.metrics?.queueJumpRate || 0) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Bonus campanhas</span><strong class="metric-card__value">{{ formatCurrencyBRL(reportOverview?.metrics?.campaignBonusTotal || 0) }}</strong></article>
      </section>

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
                  <td>{{ row.consultantName || '-' }}</td>
                  <td>{{ Number(row.attendances || 0) }}</td>
                  <td>{{ Number(row.conversions || 0) }}</td>
                  <td>{{ formatCurrencyBRL(row.saleAmount || 0) }}</td>
                </tr>
                <tr v-if="!(reportOverview?.chartData?.consultantAgg || []).length">
                  <td colspan="4">Nenhum agregado disponivel para o recorte atual.</td>
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
                  <td>{{ row.consultantName || '-' }}</td>
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
                <th>Duracao</th>
                <th>Espera</th>
                <th>Produto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportResults?.rows || []" :key="row.serviceId || `${row.personId}-${row.finishedAt}`">
                <td>{{ formatDateTime(row.finishedAt) }}</td>
                <td>{{ row.consultantName || row.personName || '-' }}</td>
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
        <p class="settings-card__text">{{ Number(reportResults?.total || (reportResults?.rows || []).length || 0) }} registro(s) retornado(s).</p>
      </article>
    </template>
  </section>
</template>