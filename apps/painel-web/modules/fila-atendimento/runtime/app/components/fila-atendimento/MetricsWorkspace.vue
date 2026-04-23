<script setup lang="ts">
import { computed } from 'vue'
import type {
  FilaAtendimentoActionCoverage,
  FilaAtendimentoChecklistItem,
  FilaAtendimentoMetricEvent,
  FilaAtendimentoMetricSummary
} from '~/types/fila-atendimento'

const props = withDefaults(defineProps<{
  summary: FilaAtendimentoMetricSummary
  items: FilaAtendimentoMetricEvent[]
  pending?: boolean
  errorMessage?: string
  storeName?: string
  readProbePending?: boolean
  readProbeDisabled?: boolean
}>(), {
  pending: false,
  errorMessage: '',
  storeName: '',
  readProbePending: false,
  readProbeDisabled: false
})

const emit = defineEmits<{
  refresh: []
  'run-read-probe': []
}>()

const measuredActions = computed(() => (props.summary.actionCoverage || []).filter(item => item.measured).length)
const totalActions = computed(() => (props.summary.actionCoverage || []).length)
const coveragePercent = computed(() => {
  if (!totalActions.value) {
    return 0
  }
  return Math.round((measuredActions.value / totalActions.value) * 100)
})

function formatMs(value: unknown) {
  const normalized = Math.max(0, Math.round(Number(value || 0) || 0))
  return `${new Intl.NumberFormat('pt-BR').format(normalized)} ms`
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return 'sem medição'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'sem medição'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

function statusLabel(value: string | undefined) {
  if (value === 'ok') return 'OK'
  if (value === 'warning') return 'Atenção'
  if (value === 'error') return 'Falha'
  return 'Pendente'
}

function statusClass(value: string | undefined) {
  if (value === 'ok') return 'metrics-status--ok'
  if (value === 'warning') return 'metrics-status--warning'
  if (value === 'error') return 'metrics-status--error'
  return 'metrics-status--pending'
}

function actionStatus(action: FilaAtendimentoActionCoverage) {
  return action.measured ? action.lastStatus : 'pending'
}

function actionLastSeen(action: FilaAtendimentoActionCoverage) {
  return action.measured ? formatDateTime(action.lastSeenAt) : 'sem amostra'
}

function checklistStatus(item: FilaAtendimentoChecklistItem) {
  return item.status === 'ok' ? 'OK' : item.status === 'warning' ? 'Atenção' : 'Falha'
}
</script>

<template>
  <section class="admin-panel metrics-workspace" data-testid="fila-metrics-panel">
    <header class="admin-panel__header metrics-workspace__header">
      <div>
        <h2 class="admin-panel__title">Métricas simples</h2>
        <p class="admin-panel__text">{{ storeName || 'Operação integrada' }}</p>
      </div>

      <div class="metrics-workspace__actions">
        <button class="column-action column-action--secondary" type="button" :disabled="pending || readProbePending" @click="emit('refresh')">
          <AppMaterialIcon name="refresh" />
          Atualizar
        </button>
        <button class="column-action column-action--primary" type="button" :disabled="pending || readProbePending || readProbeDisabled" @click="emit('run-read-probe')">
          <AppMaterialIcon :name="readProbePending ? 'hourglass_top' : 'speed'" />
          {{ readProbePending ? 'Medindo...' : (readProbeDisabled ? 'Escolha uma loja' : 'Medir leitura') }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="loading-state">
      <strong class="loading-state__title">Não foi possível carregar as métricas</strong>
      <p class="workspace__text">{{ errorMessage }}</p>
    </div>

    <div class="metrics-grid">
      <article class="metrics-tile">
        <span>Eventos</span>
        <strong>{{ summary.totalEvents || 0 }}</strong>
        <small>{{ summary.errorEvents || 0 }} falhas</small>
      </article>
      <article class="metrics-tile">
        <span>Tempo médio</span>
        <strong>{{ formatMs(summary.avgDurationMs) }}</strong>
        <small>{{ summary.slowEvents || 0 }} lentos</small>
      </article>
      <article class="metrics-tile">
        <span>Pior tempo</span>
        <strong>{{ formatMs(summary.maxDurationMs) }}</strong>
        <small>{{ formatDateTime(summary.lastEventAt) }}</small>
      </article>
      <article class="metrics-tile">
        <span>Cobertura</span>
        <strong>{{ coveragePercent }}%</strong>
        <small>{{ measuredActions }}/{{ totalActions }} ações</small>
      </article>
    </div>

    <article class="insight-card">
      <h3 class="insight-card__title">Leitura rápida</h3>
      <p class="settings-card__text">
        {{ coveragePercent >= 80 ? 'A medição cobre a maior parte das ações importantes.' : 'Ainda faltam ações importantes para medir.' }}
        {{ summary.errorEvents ? `${summary.errorEvents} falha(s) precisam de atenção.` : 'Nenhuma falha recente nos eventos medidos.' }}
      </p>
    </article>

    <details class="detail-collapse">
      <summary class="detail-collapse__summary">
        <span>Ver ações medidas</span>
        <strong>{{ totalActions }} ponto(s)</strong>
      </summary>
      <div class="detail-collapse__content">
        <section class="metrics-section">
          <div class="metrics-section__title">
            <strong>Ações e chamadas</strong>
            <span>{{ totalActions }} pontos mapeados</span>
          </div>

          <div class="metrics-action-list">
            <article v-for="action in summary.actionCoverage" :key="action.key" class="metrics-action-row">
              <div class="metrics-action-row__main">
                <span class="metrics-action-row__label">{{ action.label }}</span>
                <small>{{ action.endpoint || action.kind }}</small>
              </div>
              <div class="metrics-action-row__meta">
                <span class="metrics-status" :class="statusClass(actionStatus(action))">{{ statusLabel(actionStatus(action)) }}</span>
                <span>{{ formatMs(action.targetMs) }} alvo</span>
                <span>{{ actionLastSeen(action) }}</span>
              </div>
            </article>
          </div>
        </section>
      </div>
    </details>

    <details class="detail-collapse">
      <summary class="detail-collapse__summary">
        <span>Ver saúde técnica</span>
        <strong>{{ summary.securityChecklist.length + summary.developmentSignals.length }} sinal(is)</strong>
      </summary>
      <div class="detail-collapse__content">
        <section class="metrics-two-columns">
          <div class="metrics-section">
            <div class="metrics-section__title">
              <strong>Segurança</strong>
              <span>{{ summary.securityChecklist.length }} sinais</span>
            </div>
            <article v-for="item in summary.securityChecklist" :key="item.key" class="metrics-check-row">
              <span class="metrics-status" :class="statusClass(item.status)">{{ checklistStatus(item) }}</span>
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.evidence }}</p>
              </div>
            </article>
          </div>

          <div class="metrics-section">
            <div class="metrics-section__title">
              <strong>Desenvolvimento</strong>
              <span>{{ summary.developmentSignals.length }} sinais</span>
            </div>
            <article v-for="item in summary.developmentSignals" :key="item.key" class="metrics-check-row">
              <span class="metrics-status" :class="statusClass(item.status)">{{ checklistStatus(item) }}</span>
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.evidence }}</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </details>

    <details class="detail-collapse">
      <summary class="detail-collapse__summary">
        <span>Ver últimas amostras</span>
        <strong>{{ items.length }} registro(s)</strong>
      </summary>
      <div class="detail-collapse__content">
        <section class="metrics-section">
          <div class="metrics-section__title">
            <strong>Últimas amostras</strong>
            <span>{{ items.length }} registros</span>
          </div>

          <div v-if="items.length" class="metrics-event-list">
            <article v-for="item in items.slice(0, 12)" :key="item.id" class="metrics-event-row">
              <span class="metrics-status" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
              <div>
                <strong>{{ item.eventKey }}</strong>
                <p>{{ item.summary || item.eventType }}</p>
              </div>
              <div class="metrics-event-row__end">
                <strong>{{ formatMs(item.durationMs) }}</strong>
                <span>{{ formatDateTime(item.createdAt) }}</span>
              </div>
            </article>
          </div>

          <div v-else class="queue-empty">
            <strong class="queue-empty__title">Sem amostras persistidas</strong>
            <span class="queue-empty__text">A próxima carga da fila ou medição de leitura já alimenta este painel.</span>
          </div>
        </section>
      </div>
    </details>
  </section>
</template>

<style scoped>
.metrics-workspace {
  display: grid;
  gap: 1rem;
}

.metrics-workspace__header,
.metrics-workspace__actions,
.metrics-action-row,
.metrics-check-row,
.metrics-event-row,
.metrics-section__title,
.metrics-action-row__meta {
  display: flex;
  gap: 0.75rem;
}

.metrics-workspace__header {
  align-items: flex-start;
  justify-content: space-between;
}

.metrics-workspace__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.metrics-workspace__actions .material-icons-round {
  font-size: 1rem;
}

.metrics-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metrics-tile,
.metrics-section {
  border-radius: 8px;
}

.metrics-tile {
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(2, 6, 23, 0.28);
}

.metrics-tile span,
.metrics-tile small,
.metrics-section__title span,
.metrics-action-row small,
.metrics-action-row__meta,
.metrics-check-row p,
.metrics-event-row p,
.metrics-event-row__end span {
  color: rgba(148, 163, 184, 0.92);
}

.metrics-tile span,
.metrics-section__title span,
.metrics-action-row small,
.metrics-action-row__meta,
.metrics-event-row__end span {
  font-size: 0.78rem;
}

.metrics-tile strong {
  font-size: 1.4rem;
}

.metrics-section {
  display: grid;
  gap: 0.65rem;
  padding: 0.4rem 0;
}

.metrics-section__title {
  align-items: center;
  justify-content: space-between;
}

.metrics-action-list,
.metrics-event-list {
  display: grid;
  gap: 0.55rem;
}

.metrics-action-row,
.metrics-check-row,
.metrics-event-row {
  align-items: center;
  justify-content: space-between;
  padding: 0.72rem 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.42);
}

.metrics-action-row__main,
.metrics-event-row div,
.metrics-check-row div {
  min-width: 0;
}

.metrics-action-row__label {
  display: block;
  font-weight: 700;
}

.metrics-action-row__meta {
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  text-align: right;
}

.metrics-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.metrics-status--ok {
  background: rgba(34, 197, 94, 0.14);
  color: #86efac;
}

.metrics-status--warning {
  background: rgba(245, 158, 11, 0.16);
  color: #fcd34d;
}

.metrics-status--error {
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
}

.metrics-status--pending {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

.metrics-two-columns {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metrics-check-row {
  align-items: flex-start;
  justify-content: flex-start;
}

.metrics-check-row p,
.metrics-event-row p {
  margin: 0.2rem 0 0;
}

.metrics-event-row {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.metrics-event-row__end {
  display: grid;
  justify-items: end;
  text-align: right;
}

@media (max-width: 960px) {
  .metrics-grid,
  .metrics-two-columns {
    grid-template-columns: 1fr;
  }

  .metrics-workspace__header,
  .metrics-action-row,
  .metrics-event-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .metrics-workspace__actions,
  .metrics-action-row__meta,
  .metrics-event-row__end {
    justify-content: flex-start;
    justify-items: start;
    text-align: left;
  }
}
</style>
