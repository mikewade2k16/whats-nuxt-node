<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import RankingWorkspace from '~/components/fila-atendimento/RankingWorkspace.vue'
import { useFilaAtendimentoAnalyticsStore } from '~/stores/fila-atendimento/analytics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const analyticsStore = useFilaAtendimentoAnalyticsStore()
const { sessionReady } = storeToRefs(operationsStore)
const { ranking, pending, errorMessage } = storeToRefs(analyticsStore)
const { scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeStoreIds], ([ready, storeIds]) => {
  if (!ready || !storeIds.length) {
    analyticsStore.clearState()
    return
  }

  void analyticsStore.fetchRanking({ storeIds }).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="ranking" title="Ranking" description="Leitura rápida de desempenho da loja ativa.">
    <RankingWorkspace :report="ranking" :pending="pending" :error-message="errorMessage" :scope-label="scopeStoreName" />
  </FilaAtendimentoPageShell>
</template>
