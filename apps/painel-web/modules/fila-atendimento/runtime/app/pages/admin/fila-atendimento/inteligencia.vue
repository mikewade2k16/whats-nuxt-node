<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import IntelligenceWorkspace from '~/components/fila-atendimento/IntelligenceWorkspace.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { sessionReady } = storeToRefs(operationsStore)
const { intelligence, pending, errorMessage } = storeToRefs(analyticsStore)
const { scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeStoreIds], ([ready, storeIds]) => {
  if (!ready || !storeIds.length) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchIntelligence({ storeIds }).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="inteligencia" title="Inteligência" description="Prioridade e recomendação da operação da loja ativa.">
    <IntelligenceWorkspace :report="intelligence" :pending="pending" :error-message="errorMessage" :scope-label="scopeStoreName" />
  </FilaAtendimentoPageShell>
</template>
