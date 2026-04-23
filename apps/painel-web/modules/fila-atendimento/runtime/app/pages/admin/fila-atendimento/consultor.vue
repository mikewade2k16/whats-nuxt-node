<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import ConsultantWorkspace from '~/components/fila-atendimento/ConsultantWorkspace.vue'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoWorkspaceBundlesStore } from '~/stores/fila-atendimento/workspace-bundles'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const { state } = storeToRefs(operationsStore)
const workspaceBundlesStore = useFilaAtendimentoWorkspaceBundlesStore()
const { sessionReady } = storeToRefs(operationsStore)
const { aggregatedTeamState, pending, errorMessage } = storeToRefs(workspaceBundlesStore)
const { scopeMode, scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeMode, scopeStoreIds], ([ready, nextScopeMode, storeIds]) => {
  if (!ready || nextScopeMode !== 'all' || !storeIds.length) {
    workspaceBundlesStore.clearState()
    return
  }

  void workspaceBundlesStore.ensureLoaded(storeIds).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <FilaAtendimentoPageShell
    workspace-id="consultor"
    title="Equipe"
    description="Dados operacionais dos consultores dentro do módulo de fila."
    :include-snapshot="true"
    :include-consultants="true"
    :include-history="true"
  >
    <ConsultantWorkspace
      v-if="scopeMode === 'all'"
      :state="aggregatedTeamState"
      :pending="pending"
      :error-message="errorMessage"
      :scope-label="scopeStoreName"
    />
    <ConsultantWorkspace v-else :state="state" :scope-label="scopeStoreName" />
  </FilaAtendimentoPageShell>
</template>
