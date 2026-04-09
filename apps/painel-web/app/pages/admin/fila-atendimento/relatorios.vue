<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import ReportsWorkspace from '~/components/fila-atendimento/ReportsWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoReportsStore } from '~/stores/fila-atendimento/reports'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const reportsStore = useFilaAtendimentoReportsStore()
const { state, sessionReady } = storeToRefs(operationsStore)
const { filters, overview, results, recentServices, pending, errorMessage } = storeToRefs(reportsStore)
const activeStoreId = computed(() => state.value.activeStoreId)

function handleUpdateFilter(filterId: 'dateFrom' | 'dateTo' | 'search', value: string) {
  reportsStore.updateFilter(filterId, value)
}

function handleResetFilters() {
  reportsStore.resetFilters()
  void reportsStore.refreshReports()
}

watch([sessionReady, activeStoreId], ([ready, storeId]) => {
  if (!ready || !storeId) {
    reportsStore.clearState()
    return
  }

  void reportsStore.ensureLoaded()
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
      @refresh="reportsStore.refreshReports()"
      @update-filter="handleUpdateFilter"
      @reset-filters="handleResetFilters"
    />
  </FilaAtendimentoPageShell>
</template>