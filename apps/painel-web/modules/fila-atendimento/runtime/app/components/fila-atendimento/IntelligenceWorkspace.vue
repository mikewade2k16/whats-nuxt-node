<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoAnalyticsIntelligenceResponse } from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  report: FilaAtendimentoAnalyticsIntelligenceResponse | null
  pending: boolean
  errorMessage: string
  scopeLabel?: string
}>()

const scoreLevel = computed(() => {
  const healthScore = Number(props.report?.healthScore || 0)
  if (healthScore >= 80) return 'healthy'
  if (healthScore >= 60) return 'attention'
  return 'critical'
})

const scoreLabel = computed(() => {
  if (scoreLevel.value === 'healthy') return 'Operação saudável'
  if (scoreLevel.value === 'attention') return 'Pede atenção'
  return 'Ação recomendada'
})

const priorityDiagnosis = computed(() => {
  const diagnosis = props.report?.diagnosis || []
  return diagnosis.find((item) => item.level === 'critical')
    || diagnosis.find((item) => item.level === 'attention')
    || diagnosis[0]
    || null
})

const primaryAction = computed(() => props.report?.recommendedActions?.[0] || priorityDiagnosis.value?.action || 'Sem ação urgente no momento.')

function levelLabel(level: string | undefined) {
  switch (String(level || '').trim()) {
    case 'critical':
      return 'Crítico'
    case 'attention':
      return 'Atenção'
    case 'healthy':
      return 'Saudável'
    default:
      return 'Análise'
  }
}
</script>

<template>
  <section class="admin-panel" data-testid="intelligence-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Inteligência prática</h2>
      <p class="admin-panel__text">Resumo do que fazer agora, com o motivo disponível no detalhe.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Loja selecionada' }}</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !report" class="insight-card">
      <p class="settings-card__text">Carregando inteligência operacional do recorte atual...</p>
    </article>

    <template v-else>
      <article class="insight-card intel-summary">
        <div :class="`intel-summary__score intel-summary__score--${scoreLevel}`">
          <span class="intel-summary__label">{{ scoreLabel }}</span>
          <strong class="intel-summary__value">{{ Math.round(Number(report?.healthScore || 0)) }}</strong>
        </div>
        <div class="chip-list">
          <span class="insight-tag">Críticos <strong>{{ Number(report?.severityCounts?.critical || 0) }}</strong></span>
          <span class="insight-tag">Atenção <strong>{{ Number(report?.severityCounts?.attention || 0) }}</strong></span>
          <span class="insight-tag">Saudáveis <strong>{{ Number(report?.severityCounts?.healthy || 0) }}</strong></span>
          <span class="insight-tag">Atendimentos <strong>{{ Number(report?.totalAttendances || 0) }}</strong></span>
        </div>
      </article>

      <div class="insight-grid insight-grid--two">
        <article class="insight-card">
          <span class="metric-card__label">Faça primeiro</span>
          <h3 class="insight-card__title">{{ primaryAction }}</h3>
          <p class="settings-card__text">A recomendação considera fila, conversão, ticket e tempo de atendimento.</p>
        </article>

        <article class="insight-card">
          <span class="metric-card__label">Principal leitura</span>
          <h3 class="insight-card__title">{{ priorityDiagnosis?.title || 'Sem alerta relevante' }}</h3>
          <p class="settings-card__text">{{ priorityDiagnosis?.reading || 'A operação não trouxe um diagnóstico prioritário neste recorte.' }}</p>
        </article>
      </div>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Entender o porquê e ver todas as ações</span>
          <AppMaterialIcon name="expand_more" />
        </summary>
        <div class="detail-collapse__content">
          <div class="insight-grid">
            <article v-for="item in report?.diagnosis || []" :key="item.id || item.title" class="insight-card">
              <p class="unsupported-card__eyebrow">{{ levelLabel(item.level) }}</p>
              <h3 class="insight-card__title">{{ item.title || 'Diagnóstico' }}</h3>
              <p class="settings-card__text">{{ item.reading }}</p>
              <p class="settings-card__text"><strong>Hipótese:</strong> {{ item.hypothesis || '-' }}</p>
              <p class="settings-card__text"><strong>Ação:</strong> {{ item.action || '-' }}</p>
            </article>
            <article v-if="!(report?.diagnosis || []).length" class="insight-card">
              <h3 class="insight-card__title">Sem diagnóstico no recorte</h3>
              <p class="settings-card__text">Quando houver volume suficiente, as leituras automáticas aparecem aqui.</p>
            </article>
          </div>

          <div class="insight-grid insight-grid--two">
            <article class="insight-card">
              <h3 class="insight-card__title">Ações recomendadas</h3>
              <ul class="intel-list">
                <li v-for="action in report?.recommendedActions || []" :key="action" class="intel-list__item">{{ action }}</li>
                <li v-if="!(report?.recommendedActions || []).length" class="intel-list__item">Sem alerta relevante no momento.</li>
              </ul>
            </article>

            <article class="insight-card">
              <h3 class="insight-card__title">Contexto rápido</h3>
              <div class="intel-context">
                <div class="intel-context__row"><span>Espera média na fila</span><strong>{{ formatDurationMinutes(report?.time?.avgQueueWaitMs || 0) }}</strong></div>
                <div class="intel-context__row"><span>Atendimento fora da vez</span><strong>{{ formatPercent(report?.time?.notUsingQueueRate || 0) }}</strong></div>
                <div class="intel-context__row"><span>Ticket médio</span><strong>{{ formatCurrencyBRL(report?.ticketAverage || 0) }}</strong></div>
                <div class="intel-context__row"><span>Conversão geral</span><strong>{{ formatPercent(report?.conversionRate || 0) }}</strong></div>
              </div>
            </article>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
