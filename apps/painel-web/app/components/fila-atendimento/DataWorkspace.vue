<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoAnalyticsDataResponse } from '~/types/fila-atendimento'
import { formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  report: FilaAtendimentoAnalyticsDataResponse | null
  pending: boolean
  errorMessage: string
}>()

const primaryTimeTags = computed(() => [
  { label: 'Fechou muito rapido', value: Number(props.report?.timeIntelligence?.quickHighPotentialCount || 0) },
  { label: 'Demorou e vendeu baixo', value: Number(props.report?.timeIntelligence?.longLowSaleCount || 0) },
  { label: 'Demorou e nao vendeu', value: Number(props.report?.timeIntelligence?.longNoSaleCount || 0) },
  { label: 'Rapido e nao vendeu', value: Number(props.report?.timeIntelligence?.quickNoSaleCount || 0) },
  { label: 'Espera media na fila', value: formatDurationMinutes(props.report?.timeIntelligence?.avgQueueWaitMs || 0) },
  { label: 'Atendimento fora da vez', value: formatPercent(props.report?.timeIntelligence?.notUsingQueueRate || 0) }
])
</script>

<template>
  <section class="admin-panel" data-testid="data-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Dados operacionais</h2>
      <p class="admin-panel__text">Painel bruto de produto, motivo, origem, horario e tempo.</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !report" class="insight-card">
      <p class="settings-card__text">Carregando dados operacionais da loja ativa...</p>
    </article>

    <div v-else class="insight-grid">
      <article class="insight-card insight-card--wide">
        <h3 class="insight-card__title">Inteligencia de tempo</h3>
        <div class="chip-list">
          <span v-for="item in primaryTimeTags" :key="item.label" class="insight-tag">{{ item.label }}: <strong>{{ item.value }}</strong></span>
        </div>
      </article>

      <article class="insight-card" v-for="section in [
        { title: 'Produtos mais vendidos', items: report?.soldProducts || [] },
        { title: 'Produtos mais procurados', items: report?.requestedProducts || [] },
        { title: 'Motivos de visita', items: report?.visitReasons || [] },
        { title: 'Origem do cliente', items: report?.customerSources || [] },
        { title: 'Profissoes atendidas', items: report?.professions || [] },
        { title: 'Desfecho', items: report?.outcomeSummary || [] }
      ]" :key="section.title">
        <h3 class="insight-card__title">{{ section.title }}</h3>
        <div class="chip-list">
          <span v-for="item in section.items" :key="`${section.title}-${item.label}`" class="insight-tag">
            {{ item.label || '-' }} <strong>{{ Number(item.count || 0) }}</strong>
          </span>
          <span v-if="!section.items.length" class="settings-card__text">Sem ocorrencias no recorte atual.</span>
        </div>
      </article>

      <article class="insight-card insight-card--wide">
        <h3 class="insight-card__title">Fechamentos por hora</h3>
        <div class="table-wrap">
          <table class="module-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Qtd.</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in report?.hourlySales || []" :key="item.label">
                <td>{{ item.label || '-' }}</td>
                <td>{{ Number(item.count || 0) }}</td>
                <td>{{ item.value ? item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00' }}</td>
              </tr>
              <tr v-if="!(report?.hourlySales || []).length">
                <td colspan="3">Sem concentracao horaria suficiente para o recorte atual.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>