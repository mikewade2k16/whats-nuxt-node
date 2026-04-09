<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import IntelligenceWorkspace from '~/components/fila-atendimento/IntelligenceWorkspace.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { state, sessionReady } = storeToRefs(operationsStore)
const { intelligence, pending, errorMessage } = storeToRefs(analyticsStore)
const activeStoreId = computed(() => state.value.activeStoreId)

watch([sessionReady, activeStoreId], ([ready, storeId]) => {
  if (!ready || !storeId) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchIntelligence()
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="inteligencia" title="Inteligencia" description="Diagnostico automatico sobre fila, tempo, conversao e qualidade operacional.">
    <IntelligenceWorkspace :report="intelligence" :pending="pending" :error-message="errorMessage" />
  </FilaAtendimentoPageShell>
</template>