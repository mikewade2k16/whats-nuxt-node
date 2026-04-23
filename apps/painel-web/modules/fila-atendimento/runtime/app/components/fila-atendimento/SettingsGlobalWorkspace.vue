<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FilaAtendimentoWorkspaceBundle } from '~/types/fila-atendimento'
import { formatCurrencyBRL } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  bundles: FilaAtendimentoWorkspaceBundle[]
  pending?: boolean
  errorMessage?: string
  scopeLabel?: string
}>()

const selectedStoreId = ref('')

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const availableBundles = computed(() => props.bundles.filter(bundle => bundle.settings))

const storeOptions = computed(() => availableBundles.value.map((bundle) => ({
  value: bundle.storeId,
  label: bundle.storeName || bundle.storeCode || bundle.storeId
})))

const selectedBundle = computed(() => {
  if (!selectedStoreId.value) {
    return null
  }

  return availableBundles.value.find(bundle => bundle.storeId === selectedStoreId.value) || null
})

const averageFastClose = computed(() => {
  if (!availableBundles.value.length) {
    return 0
  }

  return availableBundles.value.reduce((sum, bundle) => sum + normalizeNumber(bundle.settings?.settings?.timingFastCloseMinutes), 0) / availableBundles.value.length
})

const averageLongService = computed(() => {
  if (!availableBundles.value.length) {
    return 0
  }

  return availableBundles.value.reduce((sum, bundle) => sum + normalizeNumber(bundle.settings?.settings?.timingLongServiceMinutes), 0) / availableBundles.value.length
})

const testModeCount = computed(() => availableBundles.value.filter(bundle => Boolean(bundle.settings?.settings?.testModeEnabled)).length)
const autoFillCount = computed(() => availableBundles.value.filter(bundle => Boolean(bundle.settings?.settings?.autoFillFinishModal)).length)

const comparisonRows = computed(() => availableBundles.value.map((bundle) => ({
  storeId: bundle.storeId,
  storeName: bundle.storeName,
  storeCode: bundle.storeCode,
  settings: bundle.settings?.settings,
  modalConfig: bundle.settings?.modalConfig,
  operationTemplates: bundle.settings?.operationTemplates || [],
  visitReasons: bundle.settings?.visitReasonOptions?.length || 0,
  customerSources: bundle.settings?.customerSourceOptions?.length || 0,
  queueJumpReasons: bundle.settings?.queueJumpReasonOptions?.length || 0,
  lossReasons: bundle.settings?.lossReasonOptions?.length || 0,
  professions: bundle.settings?.professionOptions?.length || 0,
  products: bundle.settings?.productCatalog?.length || 0,
  campaigns: bundle.settings?.campaigns?.length || 0
})))
</script>

<template>
  <section class="admin-panel" data-testid="settings-global-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Configurações gerais</h2>
      <p class="admin-panel__text">Visão consolidada das configurações operacionais por loja, sem gravar em lote por engano.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Todas as lojas' }}</p>
    </header>

    <article class="insight-card">
      <p class="settings-card__text">No modo multi-loja a configuração abre primeiro em visão geral. Produtos, motivos, campanhas e ajustes finos continuam sendo alterados por loja específica.</p>
    </article>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !availableBundles.length" class="insight-card">
      <p class="settings-card__text">Carregando configurações consolidadas...</p>
    </article>

    <div v-else class="space-y-4">
      <div class="toolbar-card settings-global-toolbar">
        <label class="toolbar-card__field">
          <span class="module-shell__label">Inspecionar loja</span>
          <select v-model="selectedStoreId" class="module-shell__input">
            <option value="">Visão geral</option>
            <option v-for="option in storeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <section class="metric-grid">
        <article class="metric-card"><span class="metric-card__label">Lojas comparadas</span><strong class="metric-card__value">{{ availableBundles.length }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Fechamento rápido médio</span><strong class="metric-card__value">{{ averageFastClose.toFixed(1) }} min</strong></article>
        <article class="metric-card"><span class="metric-card__label">Atendimento demorado médio</span><strong class="metric-card__value">{{ averageLongService.toFixed(1) }} min</strong></article>
        <article class="metric-card"><span class="metric-card__label">Lojas em modo teste</span><strong class="metric-card__value">{{ testModeCount }}</strong></article>
      </section>

      <article v-if="!selectedBundle" class="insight-card">
        <h3 class="insight-card__title">Comparativo operacional</h3>
        <div class="simple-list">
          <div v-for="row in comparisonRows" :key="row.storeId" class="simple-list__item">
            <strong>
              {{ row.storeName || row.storeCode || row.storeId }}
              <span class="queue-card__store-badge">{{ row.storeCode || row.storeName || row.storeId }}</span>
            </strong>
            <span>
              {{ Number(row.settings?.maxConcurrentServices || 0) }} simultâneos · {{ Number(row.settings?.timingFastCloseMinutes || 0) }} min rápido · {{ Number(row.settings?.timingLongServiceMinutes || 0) }} min demorado · {{ row.operationTemplates.length }} template(s)
            </span>
          </div>
        </div>
      </article>

      <div v-if="!selectedBundle" class="insight-grid insight-grid--two">
        <article class="insight-card">
          <h3 class="insight-card__title">Modal e validações</h3>
          <div class="simple-list">
            <div v-for="row in comparisonRows" :key="`${row.storeId}-modal`" class="simple-list__item">
              <strong>{{ row.storeName || row.storeCode || row.storeId }}</strong>
              <span>
                Auto-fill: {{ row.settings?.autoFillFinishModal ? 'sim' : 'não' }} · Email: {{ row.modalConfig?.showEmailField ? 'sim' : 'não' }} · Profissão: {{ row.modalConfig?.showProfessionField ? 'sim' : 'não' }} · Exigir produto: {{ row.modalConfig?.requireProduct ? 'sim' : 'não' }}
              </span>
            </div>
          </div>
        </article>

        <article class="insight-card">
          <h3 class="insight-card__title">Catálogos e listas</h3>
          <div class="simple-list">
            <div v-for="row in comparisonRows" :key="`${row.storeId}-catalog`" class="simple-list__item">
              <strong>{{ row.storeName || row.storeCode || row.storeId }}</strong>
              <span>
                Produtos: {{ row.products }} · Origens: {{ row.customerSources }} · Motivos visita: {{ row.visitReasons }} · Perdas: {{ row.lossReasons }} · Fora da vez: {{ row.queueJumpReasons }} · Campanhas: {{ row.campaigns }}
              </span>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="insight-grid insight-grid--two">
        <article class="insight-card">
          <h3 class="insight-card__title">Operação</h3>
          <div class="simple-list">
            <div class="simple-list__item"><strong>Atendimentos simultâneos</strong><span>{{ Number(selectedBundle.settings?.settings?.maxConcurrentServices || 0) }}</span></div>
            <div class="simple-list__item"><strong>Fechamento rápido</strong><span>{{ Number(selectedBundle.settings?.settings?.timingFastCloseMinutes || 0) }} min</span></div>
            <div class="simple-list__item"><strong>Atendimento demorado</strong><span>{{ Number(selectedBundle.settings?.settings?.timingLongServiceMinutes || 0) }} min</span></div>
            <div class="simple-list__item"><strong>Venda baixa</strong><span>{{ formatCurrencyBRL(selectedBundle.settings?.settings?.timingLowSaleAmount || 0) }}</span></div>
            <div class="simple-list__item"><strong>Modo teste</strong><span>{{ selectedBundle.settings?.settings?.testModeEnabled ? 'Sim' : 'Não' }}</span></div>
            <div class="simple-list__item"><strong>Preencher modal</strong><span>{{ selectedBundle.settings?.settings?.autoFillFinishModal ? 'Sim' : 'Não' }}</span></div>
          </div>
        </article>

        <article class="insight-card">
          <h3 class="insight-card__title">Alertas e modal</h3>
          <div class="simple-list">
            <div class="simple-list__item"><strong>Conversão mínima</strong><span>{{ Number(selectedBundle.settings?.settings?.alertMinConversionRate || 0) }}%</span></div>
            <div class="simple-list__item"><strong>Fora da vez máximo</strong><span>{{ Number(selectedBundle.settings?.settings?.alertMaxQueueJumpRate || 0) }}%</span></div>
            <div class="simple-list__item"><strong>P.A. mínimo</strong><span>{{ Number(selectedBundle.settings?.settings?.alertMinPaScore || 0).toFixed(1) }}</span></div>
            <div class="simple-list__item"><strong>Ticket médio mínimo</strong><span>{{ formatCurrencyBRL(selectedBundle.settings?.settings?.alertMinTicketAverage || 0) }}</span></div>
            <div class="simple-list__item"><strong>Título do modal</strong><span>{{ selectedBundle.settings?.modalConfig?.title || '-' }}</span></div>
            <div class="simple-list__item"><strong>Exigir produto</strong><span>{{ selectedBundle.settings?.modalConfig?.requireProduct ? 'Sim' : 'Não' }}</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-global-toolbar {
  grid-template-columns: minmax(0, 18rem);
}

@media (max-width: 860px) {
  .settings-global-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>