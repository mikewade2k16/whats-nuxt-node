<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FilaAtendimentoOperationState } from '~/types/fila-atendimento'
import { buildConsultantStats, formatCurrencyBRL, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  state: FilaAtendimentoOperationState
  pending?: boolean
  errorMessage?: string
  scopeLabel?: string
}>()

const selectedConsultantId = ref('')
const selectedStoreFilterId = ref('')
const simulationAdditionalSales = ref(0)

const roster = computed(() => props.state.roster || [])
const storeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const options = [{ value: '', label: 'Todas as lojas' }]

  for (const consultant of roster.value) {
    const storeId = String(consultant.storeId || '').trim()
    const storeName = String(consultant.storeName || consultant.storeCode || '').trim()
    if (!storeId || seen.has(storeId)) {
      continue
    }

    seen.add(storeId)
    options.push({ value: storeId, label: storeName || storeId })
  }

  return options
})
const filteredRoster = computed(() => {
  if (!selectedStoreFilterId.value) {
    return roster.value
  }

  return roster.value.filter((consultant) => String(consultant.storeId || '').trim() === selectedStoreFilterId.value)
})
const selectedConsultant = computed(() =>
  filteredRoster.value.find((consultant) => consultant.id === selectedConsultantId.value) || filteredRoster.value[0] || null
)
const consultantSummaries = computed(() => filteredRoster.value.map((consultant) => ({
  consultant,
  stats: buildConsultantStats({
    history: props.state.serviceHistory,
    consultantId: consultant.id,
    monthlyGoal: consultant.monthlyGoal,
    commissionRate: consultant.commissionRate,
    conversionGoal: consultant.conversionGoal,
    avgTicketGoal: consultant.avgTicketGoal,
    paGoal: consultant.paGoal
  })
})))

const stats = computed(() => {
  if (!selectedConsultant.value) {
    return null
  }

  return buildConsultantStats({
    history: props.state.serviceHistory,
    consultantId: selectedConsultant.value.id,
    monthlyGoal: selectedConsultant.value.monthlyGoal,
    commissionRate: selectedConsultant.value.commissionRate,
    conversionGoal: selectedConsultant.value.conversionGoal,
    avgTicketGoal: selectedConsultant.value.avgTicketGoal,
    paGoal: selectedConsultant.value.paGoal
  })
})

const selectedStatus = computed(() => {
  const consultantId = selectedConsultant.value?.id || ''
  if (!consultantId) {
    return { label: 'Sem consultor', detail: '' }
  }

  const activeService = props.state.activeServices.find((item) => item.id === consultantId)
  if (activeService) {
    return { label: 'Em atendimento', detail: `Desde ${formatDurationMinutes(Date.now() - Number(activeService.serviceStartedAt || 0))}` }
  }

  const waitingEntry = props.state.waitingList.find((item) => item.id === consultantId)
  if (waitingEntry) {
    return { label: 'Na fila', detail: 'Aguardando chamada' }
  }

  const paused = props.state.pausedEmployees.find((item) => item.personId === consultantId)
  if (paused) {
    return { label: String(paused.kind || '').trim() === 'assignment' ? 'Em tarefa' : 'Pausado', detail: paused.reason || 'Sem motivo informado' }
  }

  return { label: 'Disponível', detail: 'Fora da fila neste momento' }
})

const goalPercent = computed(() => {
  if (!stats.value?.monthlyGoal) {
    return 0
  }

  return Math.min(100, (stats.value.soldValue / stats.value.monthlyGoal) * 100)
})

const projectedSoldValue = computed(() => (stats.value?.soldValue || 0) + Number(simulationAdditionalSales.value || 0))
const projectedCommission = computed(() => projectedSoldValue.value * Number(selectedConsultant.value?.commissionRate || 0))

watch(
  filteredRoster,
  (nextRoster) => {
    if (!selectedConsultantId.value && nextRoster.length) {
      selectedConsultantId.value = nextRoster[0].id
      return
    }

    if (!nextRoster.some((consultant) => consultant.id === selectedConsultantId.value) && nextRoster.length) {
      selectedConsultantId.value = nextRoster[0].id
    }
  },
  { immediate: true }
)

watch(
  storeFilterOptions,
  (options) => {
    if (!selectedStoreFilterId.value) {
      return
    }

    if (!options.some((option) => option.value === selectedStoreFilterId.value)) {
      selectedStoreFilterId.value = ''
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="admin-panel" data-testid="consultant-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Desempenho da equipe</h2>
      <p class="admin-panel__text">Dados do módulo de fila por consultor. Cadastro, acesso, foto e vínculo de loja ficam na página de Usuários.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Loja selecionada' }}</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !roster.length" class="insight-card">
      <p class="settings-card__text">Carregando equipe do recorte atual...</p>
    </article>

    <div v-else-if="selectedConsultant && stats" class="consultant-layout">
      <div class="toolbar-card consultant-toolbar">
        <label class="toolbar-card__field">
          <span class="module-shell__label">Loja</span>
          <select v-model="selectedStoreFilterId" class="module-shell__input">
            <option v-for="option in storeFilterOptions" :key="option.value || 'all'" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label class="toolbar-card__field toolbar-card__field--grow">
          <span class="module-shell__label">Consultor</span>
          <select v-model="selectedConsultantId" class="module-shell__input">
            <option v-for="consultant in filteredRoster" :key="consultant.id" :value="consultant.id">
              {{ consultant.name }}{{ consultant.storeName ? ` · ${consultant.storeName}` : '' }}
            </option>
          </select>
        </label>
      </div>

      <article class="insight-card insight-card--wide">
        <div class="settings-card__header">
          <div>
            <h3 class="insight-card__title">Consultor selecionado</h3>
            <p class="settings-card__text">{{ selectedConsultant.name }}</p>
          </div>
          <span v-if="selectedConsultant.storeName || selectedConsultant.storeCode" class="queue-card__store-badge">
            {{ selectedConsultant.storeName || selectedConsultant.storeCode }}
          </span>
        </div>
      </article>

      <section class="metric-grid">
        <article class="metric-card">
          <span class="metric-card__label">Status agora</span>
          <strong class="metric-card__value">{{ selectedStatus.label }}</strong>
          <span class="metric-card__text">{{ selectedStatus.detail }}</span>
        </article>
        <article class="metric-card"><span class="metric-card__label">Vendido no mês</span><strong class="metric-card__value">{{ formatCurrencyBRL(stats.soldValue) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Conversão</span><strong class="metric-card__value">{{ formatPercent(stats.conversionRate) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Ticket médio</span><strong class="metric-card__value">{{ formatCurrencyBRL(stats.ticketAverage) }}</strong></article>
      </section>

      <article class="insight-card insight-card--wide">
        <div class="team-goal-summary__header">
          <span class="metric-card__label">Meta mensal</span>
          <span class="metric-card__text">{{ formatCurrencyBRL(stats.soldValue) }} de {{ formatCurrencyBRL(stats.monthlyGoal) }}</span>
        </div>
        <div class="progress-bar"><span class="progress-bar__fill" :style="{ '--progress': `${goalPercent.toFixed(1)}%` }"></span></div>
        <div class="chip-list">
          <span class="insight-tag">Falta <strong>{{ formatCurrencyBRL(stats.remainingToGoal) }}</strong></span>
          <span class="insight-tag">Comissão estimada <strong>{{ formatCurrencyBRL(stats.estimatedCommission) }}</strong></span>
          <span class="insight-tag">Tempo médio <strong>{{ formatDurationMinutes(stats.averageDurationMs) }}</strong></span>
          <span class="insight-tag">P.A. <strong>{{ Number(stats.paScore).toFixed(2) }}</strong></span>
        </div>
      </article>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver metas, simulação e leitura detalhada</span>
          <AppMaterialIcon name="expand_more" />
        </summary>
        <div class="detail-collapse__content">
          <div class="insight-grid insight-grid--two">
            <article class="insight-card">
              <h3 class="insight-card__title">Metas do consultor</h3>
              <div class="intel-context">
                <div class="intel-context__row"><span>Meta conversão</span><strong>{{ formatPercent(stats.conversionGoal) }}</strong></div>
                <div class="intel-context__row"><span>Meta ticket</span><strong>{{ formatCurrencyBRL(stats.avgTicketGoal) }}</strong></div>
                <div class="intel-context__row"><span>Meta P.A.</span><strong>{{ Number(stats.paGoal).toFixed(2) }}</strong></div>
                <div class="intel-context__row"><span>Comissão</span><strong>{{ formatPercent((selectedConsultant.commissionRate || 0) * 100) }}</strong></div>
              </div>
            </article>

            <article class="insight-card">
              <h3 class="insight-card__title">Simulador rápido</h3>
              <label class="settings-field">
                <span>Venda adicional simulada</span>
                <input v-model.number="simulationAdditionalSales" class="module-shell__input" type="number" min="0" step="50">
              </label>
              <div class="chip-list">
                <span class="insight-tag">Venda projetada <strong>{{ formatCurrencyBRL(projectedSoldValue) }}</strong></span>
                <span class="insight-tag">Comissão projetada <strong>{{ formatCurrencyBRL(projectedCommission) }}</strong></span>
              </div>
            </article>
          </div>
        </div>
      </details>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver equipe do recorte</span>
          <strong>{{ consultantSummaries.length }} consultor(es)</strong>
        </summary>
        <div class="detail-collapse__content">
          <div class="simple-list">
            <div
              v-for="item in consultantSummaries"
              :key="item.consultant.id"
              class="simple-list__item consultant-summary-row"
            >
              <div class="consultant-summary-row__main">
                <strong>{{ item.consultant.name }}</strong>
                <span v-if="item.consultant.storeName || item.consultant.storeCode" class="queue-card__store-badge">
                  {{ item.consultant.storeName || item.consultant.storeCode }}
                </span>
              </div>
              <span>
                {{ formatCurrencyBRL(item.stats.soldValue) }} · {{ formatPercent(item.stats.conversionRate) }} · P.A. {{ Number(item.stats.paScore).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </details>
    </div>

    <div v-else class="unsupported-card">
      <h2 class="admin-panel__title">Nenhum consultor disponível</h2>
      <p class="admin-panel__text">Vincule usuários ativos à loja pela página de Usuários para que os dados do módulo apareçam aqui.</p>
    </div>
  </section>
</template>

<style scoped>
.consultant-toolbar {
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
}

.consultant-summary-row {
  align-items: center;
}

.consultant-summary-row__main {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .consultant-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
