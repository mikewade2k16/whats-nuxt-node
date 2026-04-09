<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import DataWorkspace from '~/components/fila-atendimento/DataWorkspace.vue'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { state, sessionReady } = storeToRefs(operationsStore)
const { data, pending, errorMessage } = storeToRefs(analyticsStore)
const activeStoreId = computed(() => state.value.activeStoreId)

watch([sessionReady, activeStoreId], ([ready, storeId]) => {
  if (!ready || !storeId) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchData()
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="dados" title="Dados" description="Visao bruta dos sinais operacionais capturados pelo modulo.">
    <DataWorkspace :report="data" :pending="pending" :error-message="errorMessage" />
  </FilaAtendimentoPageShell>
</template>