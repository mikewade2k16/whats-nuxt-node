<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoAnalyticsDataResponse } from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  report: FilaAtendimentoAnalyticsDataResponse | null
  pending: boolean
  errorMessage: string
  scopeLabel?: string
}>()

const primaryTimeTags = computed(() => [
  { label: 'Fechou muito rapido', value: Number(props.report?.timeIntelligence?.quickHighPotentialCount || 0) },
  { label: 'Demorou e vendeu baixo', value: Number(props.report?.timeIntelligence?.longLowSaleCount || 0) },
  { label: 'Demorou e nao vendeu', value: Number(props.report?.timeIntelligence?.longNoSaleCount || 0) },
  { label: 'Rapido e nao vendeu', value: Number(props.report?.timeIntelligence?.quickNoSaleCount || 0) },
  { label: 'Espera media na fila', value: formatDurationMinutes(props.report?.timeIntelligence?.avgQueueWaitMs || 0) },
  { label: 'Atendimento fora da vez', value: formatPercent(props.report?.timeIntelligence?.notUsingQueueRate || 0) }
])

const simpleSections = computed(() => [
  { title: 'Produto que mais vendeu', empty: 'Sem venda no recorte', item: props.report?.soldProducts?.[0] },
  { title: 'Produto mais procurado', empty: 'Sem procura registrada', item: props.report?.requestedProducts?.[0] },
  { title: 'Motivo mais comum', empty: 'Sem motivo informado', item: props.report?.visitReasons?.[0] },
  { title: 'Origem mais comum', empty: 'Sem origem informada', item: props.report?.customerSources?.[0] },
  { title: 'Desfecho mais comum', empty: 'Sem desfecho suficiente', item: props.report?.outcomeSummary?.[0] }
])

const bestHour = computed(() => {
  const rows = props.report?.hourlySales || []
  return rows.reduce((best, item) => {
    if (!best) {
      return item
    }

    return Number(item.value || 0) > Number(best.value || 0) ? item : best
  }, null as typeof rows[number] | null)
})

const detailSections = computed(() => [
  { title: 'Produtos mais vendidos', items: props.report?.soldProducts || [] },
  { title: 'Produtos mais procurados', items: props.report?.requestedProducts || [] },
  { title: 'Motivos de visita', items: props.report?.visitReasons || [] },
  { title: 'Origem do cliente', items: props.report?.customerSources || [] },
  { title: 'Profissões atendidas', items: props.report?.professions || [] },
  { title: 'Desfecho', items: props.report?.outcomeSummary || [] }
])
</script>

<template>
  <section class="admin-panel" data-testid="data-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Dados simples</h2>
      <p class="admin-panel__text">Os sinais principais do recorte atual; o detalhamento fica logo abaixo.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Loja selecionada' }}</p>
    </header>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !report" class="insight-card">
      <p class="settings-card__text">Carregando dados operacionais do recorte atual...</p>
    </article>

    <template v-else>
      <section class="metric-grid">
        <article class="metric-card">
          <span class="metric-card__label">Espera média</span>
          <strong class="metric-card__value">{{ formatDurationMinutes(report?.timeIntelligence?.avgQueueWaitMs || 0) }}</strong>
          <span class="metric-card__text">Tempo médio antes do atendimento</span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">Fora da vez</span>
          <strong class="metric-card__value">{{ formatPercent(report?.timeIntelligence?.notUsingQueueRate || 0) }}</strong>
          <span class="metric-card__text">Atendimentos iniciados fora da ordem</span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">Melhor horário</span>
          <strong class="metric-card__value">{{ bestHour?.label || 'Sem dados' }}</strong>
          <span class="metric-card__text">{{ formatCurrencyBRL(bestHour?.value || 0) }}</span>
        </article>
        <article class="metric-card">
          <span class="metric-card__label">Vendas rápidas</span>
          <strong class="metric-card__value">{{ Number(report?.timeIntelligence?.quickHighPotentialCount || 0) }}</strong>
          <span class="metric-card__text">Fechamentos rápidos com potencial alto</span>
        </article>
      </section>

      <div class="insight-grid">
        <article v-for="section in simpleSections" :key="section.title" class="insight-card">
          <span class="metric-card__label">{{ section.title }}</span>
          <strong class="metric-card__value">{{ section.item?.label || section.empty }}</strong>
          <span class="metric-card__text">{{ Number(section.item?.count || 0) }} ocorrência(s)</span>
        </article>
      </div>

      <details class="detail-collapse">
        <summary class="detail-collapse__summary">
          <span>Ver listas completas e sinais de tempo</span>
          <AppMaterialIcon name="expand_more" />
        </summary>
        <div class="detail-collapse__content">
          <article class="insight-card insight-card--wide">
            <h3 class="insight-card__title">Sinais de tempo</h3>
            <div class="chip-list">
              <span v-for="item in primaryTimeTags" :key="item.label" class="insight-tag">{{ item.label }}: <strong>{{ item.value }}</strong></span>
            </div>
          </article>

          <article v-for="section in detailSections" :key="section.title" class="insight-card">
            <h3 class="insight-card__title">{{ section.title }}</h3>
            <div class="chip-list">
              <span v-for="item in section.items" :key="`${section.title}-${item.label}`" class="insight-tag">
                {{ item.label || '-' }} <strong>{{ Number(item.count || 0) }}</strong>
              </span>
              <span v-if="!section.items.length" class="settings-card__text">Sem ocorrências no recorte atual.</span>
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
                    <td>{{ formatCurrencyBRL(item.value || 0) }}</td>
                  </tr>
                  <tr v-if="!(report?.hourlySales || []).length">
                    <td colspan="3">Sem concentração horária suficiente para o recorte atual.</td>
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
