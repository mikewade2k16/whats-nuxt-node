<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import MetricsWorkspace from '~/components/fila-atendimento/MetricsWorkspace.vue'
import { useFilaAtendimentoMetricsStore } from '~/stores/fila-atendimento/metrics'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

definePageMeta({
  layout: 'admin'
})

const operationsStore = useFilaAtendimentoOperationsStore()
const metricsStore = useFilaAtendimentoMetricsStore()
const { state, sessionReady } = storeToRefs(operationsStore)
const { items, summary, pending, errorMessage } = storeToRefs(metricsStore)
const readProbePending = ref(false)
const { scopeMode, scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

async function refreshMetrics() {
  if (!sessionReady.value) {
    return
  }

  await metricsStore.fetchEvents({
    pageKey: 'fila-atendimento.operacao',
    limit: 200,
    storeId: scopeMode.value === 'all' ? undefined : (scopeStoreIds.value[0] || undefined)
  }).catch(() => undefined)
}

async function runReadProbe() {
  if (scopeMode.value === 'all' || !state.value.activeStoreId) {
    return
  }

  readProbePending.value = true

  try {
    await operationsStore.ensureWorkspaceData(state.value.activeStoreId, {
      includeSnapshot: true,
      includeConsultants: true,
      includeSettings: true,
      includeHistory: false,
      includeActivitySessions: false,
      force: true
    })
    await operationsStore.refreshOverview().catch(() => undefined)
    await refreshMetrics()
  } finally {
    readProbePending.value = false
  }
}

watch([sessionReady, scopeStoreIds], ([ready, storeIds]) => {
  if (!ready || !storeIds.length) {
    return
  }

  void refreshMetrics()
}, { immediate: true })

onMounted(() => {
  window.setTimeout(() => {
    void refreshMetrics()
  }, 700)
})
</script>

<template>
  <FilaAtendimentoPageShell
    workspace-id="metricas"
    title="Métricas"
    description="Performance, resposta das ações e sinais de segurança da página de fila."
    :include-snapshot="false"
    :include-consultants="false"
    :include-settings="false"
  >
    <MetricsWorkspace
      :summary="summary"
      :items="items"
      :pending="pending"
      :error-message="errorMessage"
      :store-name="scopeStoreName"
      :read-probe-pending="readProbePending"
      :read-probe-disabled="scopeMode === 'all'"
      @refresh="refreshMetrics"
      @run-read-probe="runReadProbe"
    />
  </FilaAtendimentoPageShell>
</template>
