<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import ReportsWorkspace from '~/components/fila-atendimento/ReportsWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoReportsStore } from '~/stores/fila-atendimento/reports'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const reportsStore = useFilaAtendimentoReportsStore()
const { state, stores, sessionReady } = storeToRefs(operationsStore)
const { filters, overview, results, recentServices, pending, errorMessage } = storeToRefs(reportsStore)
const { scopeMode, scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

const reportStoreOptions = computed(() => stores.value.map((store) => ({
  value: store.id,
  label: store.name
})))

function handleUpdateFilter(filterId: 'dateFrom' | 'dateTo' | 'storeId', value: string) {
  reportsStore.updateFilter(filterId, value)
}

function handleResetFilters() {
  reportsStore.resetFilters()
  void reportsStore.refreshReports({ storeIds: scopeStoreIds.value }).catch(() => undefined)
}

watch([sessionReady, scopeStoreIds], ([ready, storeIds]) => {
  if (!ready || !storeIds.length) {
    reportsStore.clearState()
    return
  }

  void reportsStore.ensureLoaded({ storeIds }).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="relatorios" title="Relatorios" description="Recorte operacional por loja, com filtros e historico de fechamento.">
    <ReportsWorkspace
      :state="state"
      :report-overview="overview"
      :report-results="results"
      :recent-services="recentServices"
      :filters="filters"
      :pending="pending"
      :error-message="errorMessage"
      :scope-label="scopeStoreName"
      :store-options="reportStoreOptions"
      :show-store-filter="scopeMode === 'all'"
      @refresh="reportsStore.refreshReports({ storeIds: scopeStoreIds })"
      @update-filter="handleUpdateFilter"
      @reset-filters="handleResetFilters"
    />
  </FilaAtendimentoPageShell>
</template>