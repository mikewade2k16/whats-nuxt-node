<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoAnalyticsIntelligenceResponse } from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  report: FilaAtendimentoAnalyticsIntelligenceResponse | null
  pending: boolean
  errorMessage: string
}>()

const scoreLevel = computed(() => {
  const healthScore = Number(props.report?.healthScore || 0)
  if (healthScore >= 80) return 'healthy'
  if (healthScore >= 60) return 'attention'
  return 'critical'
})
</script>

<template>
  <section class="admin-panel" data-testid="intelligence-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Inteligencia operacional</h2>
      <p class="admin-panel__text">Leitura automatica dos dados para apoiar decisao de loja e gestao de equipe.</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !report" class="insight-card">
      <p class="settings-card__text">Carregando inteligencia operacional da loja ativa...</p>
    </article>

    <template v-else>
      <article class="insight-card intel-summary">
        <div :class="`intel-summary__score intel-summary__score--${scoreLevel}`">
          <span class="intel-summary__label">Score operacional</span>
          <strong class="intel-summary__value">{{ Math.round(Number(report?.healthScore || 0)) }}</strong>
        </div>
        <div class="chip-list">
          <span class="insight-tag">Criticos <strong>{{ Number(report?.severityCounts?.critical || 0) }}</strong></span>
          <span class="insight-tag">Atencao <strong>{{ Number(report?.severityCounts?.attention || 0) }}</strong></span>
          <span class="insight-tag">Saudaveis <strong>{{ Number(report?.severityCounts?.healthy || 0) }}</strong></span>
          <span class="insight-tag">Atendimentos <strong>{{ Number(report?.totalAttendances || 0) }}</strong></span>
        </div>
      </article>

      <div class="insight-grid">
        <article v-for="item in report?.diagnosis || []" :key="item.id || item.title" class="insight-card">
          <p class="unsupported-card__eyebrow">{{ item.level || 'analise' }}</p>
          <h3 class="insight-card__title">{{ item.title || 'Diagnostico' }}</h3>
          <p class="settings-card__text">{{ item.reading }}</p>
          <p class="settings-card__text"><strong>Hipotese:</strong> {{ item.hypothesis || '-' }}</p>
          <p class="settings-card__text"><strong>Acao:</strong> {{ item.action || '-' }}</p>
        </article>
      </div>

      <div class="insight-grid insight-grid--two">
        <article class="insight-card">
          <h3 class="insight-card__title">Acoes recomendadas agora</h3>
          <ul class="intel-list">
            <li v-for="action in report?.recommendedActions || []" :key="action" class="intel-list__item">{{ action }}</li>
            <li v-if="!(report?.recommendedActions || []).length" class="intel-list__item">Sem alerta relevante no momento.</li>
          </ul>
        </article>

        <article class="insight-card">
          <h3 class="insight-card__title">Contexto rapido</h3>
          <div class="intel-context">
            <div class="intel-context__row"><span>Espera media na fila</span><strong>{{ formatDurationMinutes(report?.time?.avgQueueWaitMs || 0) }}</strong></div>
            <div class="intel-context__row"><span>Atendimento fora da vez</span><strong>{{ formatPercent(report?.time?.notUsingQueueRate || 0) }}</strong></div>
            <div class="intel-context__row"><span>Ticket medio</span><strong>{{ formatCurrencyBRL(report?.ticketAverage || 0) }}</strong></div>
            <div class="intel-context__row"><span>Conversao geral</span><strong>{{ formatPercent(report?.conversionRate || 0) }}</strong></div>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>