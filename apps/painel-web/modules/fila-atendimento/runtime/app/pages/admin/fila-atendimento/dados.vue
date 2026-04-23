<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import DataWorkspace from '~/components/fila-atendimento/DataWorkspace.vue'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { sessionReady } = storeToRefs(operationsStore)
const { data, pending, errorMessage } = storeToRefs(analyticsStore)
const { scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeStoreIds], ([ready, storeIds]) => {
  if (!ready || !storeIds.length) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchData({ storeIds }).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="dados" title="Dados" description="Sinais principais da operação da loja ativa.">
    <DataWorkspace :report="data" :pending="pending" :error-message="errorMessage" :scope-label="scopeStoreName" />
  </FilaAtendimentoPageShell>
</template>
