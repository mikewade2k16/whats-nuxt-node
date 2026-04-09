<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import RankingWorkspace from '~/components/fila-atendimento/RankingWorkspace.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { state, sessionReady } = storeToRefs(operationsStore)
const { ranking, pending, errorMessage } = storeToRefs(analyticsStore)
const activeStoreId = computed(() => state.value.activeStoreId)

watch([sessionReady, activeStoreId], ([ready, storeId]) => {
  if (!ready || !storeId) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchRanking()
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="ranking" title="Ranking" description="Comparativo mensal e diario dos consultores da loja ativa.">
    <RankingWorkspace :report="ranking" :pending="pending" :error-message="errorMessage" />
  </FilaAtendimentoPageShell>
</template>