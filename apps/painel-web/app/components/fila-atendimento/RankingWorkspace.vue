<script setup lang="ts">
import type { FilaAtendimentoAnalyticsRankingResponse } from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatPercent } from '~/utils/fila-atendimento/metrics'

defineProps<{
  report: FilaAtendimentoAnalyticsRankingResponse | null
  pending: boolean
  errorMessage: string
}>()
</script>

<template>
  <section class="admin-panel" data-testid="ranking-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Ranking de vendedores</h2>
      <p class="admin-panel__text">Comparativo mensal e diario para acompanhar consistencia, qualidade e bonificacao.</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !(report?.monthlyRows || []).length && !(report?.dailyRows || []).length" class="insight-card">
      <p class="settings-card__text">Carregando ranking da loja ativa...</p>
    </article>

    <div v-if="(report?.alerts || []).length" class="alert-list">
      <div class="alert-list__header">
        <strong class="alert-list__title">Alertas de desempenho</strong>
        <span class="metric-card__text">{{ report?.alerts?.length || 0 }} ocorrencia(s)</span>
      </div>
      <div v-for="(alert, index) in report?.alerts || []" :key="`${alert.consultantId}-${index}`" class="alert-item">
        <strong>{{ alert.consultantName || 'Consultor' }}</strong>
        <span>{{ alert.type }}: {{ Number(alert.value || 0).toFixed(1) }} / limite {{ Number(alert.threshold || 0).toFixed(1) }}</span>
      </div>
    </div>

    <div class="insight-grid insight-grid--two">
      <article class="insight-card">
        <h3 class="insight-card__title">Ranking do mes</h3>
        <div class="table-wrap">
          <table class="module-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Venda</th>
                <th>Conv.</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report?.monthlyRows || []" :key="row.consultantId || row.consultantName">
                <td>{{ row.consultantName || '-' }}</td>
                <td>{{ formatCurrencyBRL(row.soldValue || 0) }}</td>
                <td>{{ formatPercent(row.conversionRate || 0) }}</td>
                <td>{{ formatCurrencyBRL(row.ticketAverage || 0) }}</td>
              </tr>
              <tr v-if="!(report?.monthlyRows || []).length">
                <td colspan="4">Sem dados mensais.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="insight-card">
        <h3 class="insight-card__title">Ranking de hoje</h3>
        <div class="table-wrap">
          <table class="module-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Venda</th>
                <th>Conv.</th>
                <th>P.A.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report?.dailyRows || []" :key="row.consultantId || row.consultantName">
                <td>{{ row.consultantName || '-' }}</td>
                <td>{{ formatCurrencyBRL(row.soldValue || 0) }}</td>
                <td>{{ formatPercent(row.conversionRate || 0) }}</td>
                <td>{{ Number(row.paScore || 0).toFixed(2) }}</td>
              </tr>
              <tr v-if="!(report?.dailyRows || []).length">
                <td colspan="4">Sem dados diarios.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>