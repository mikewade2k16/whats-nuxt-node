<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import CampaignWorkspace from '~/components/fila-atendimento/CampaignWorkspace.vue'
import CampaignMultiStoreWorkspace from '~/components/fila-atendimento/CampaignMultiStoreWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoWorkspaceBundlesStore } from '~/stores/fila-atendimento/workspace-bundles'
import type { FilaAtendimentoCampaign } from '~/types/fila-atendimento'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const { state, canEditCampaigns, commandPending } = storeToRefs(operationsStore)
const workspaceBundlesStore = useFilaAtendimentoWorkspaceBundlesStore()
const { sessionReady } = storeToRefs(operationsStore)
const { bundles, pending, errorMessage } = storeToRefs(workspaceBundlesStore)
const feedback = ref('')
const { scopeMode, scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeMode, scopeStoreIds], ([ready, nextScopeMode, storeIds]) => {
  if (!ready || nextScopeMode !== 'all' || !storeIds.length) {
    workspaceBundlesStore.clearState()
    return
  }

  void workspaceBundlesStore.ensureLoaded(storeIds, { includeSettings: true }).catch(() => undefined)
}, { immediate: true })

async function withFeedback(action: Promise<{ ok: boolean; message?: string }>, successMessage: string) {
  const result = await action
  feedback.value = result.ok ? successMessage : (result.message || 'Nao foi possivel salvar a campanha.')
}

function handleAddCampaign(payload: FilaAtendimentoCampaign) {
  void withFeedback(operationsStore.addCampaign(payload), 'Campanha criada.')
}

function handleUpdateCampaign(campaignId: string, payload: FilaAtendimentoCampaign) {
  void withFeedback(operationsStore.updateCampaign(campaignId, payload), 'Campanha atualizada.')
}

function handleRemoveCampaign(campaignId: string) {
  if (import.meta.client && !window.confirm('Essa campanha sera removida da configuracao atual. Deseja continuar?')) {
    return
  }

  void withFeedback(operationsStore.removeCampaign(campaignId), 'Campanha removida.')
}
</script>

<template>
  <FilaAtendimentoPageShell
    workspace-id="campanhas"
    title="Campanhas"
    description="Regras comerciais e incentivos aplicados automaticamente no fechamento do atendimento."
    :include-snapshot="true"
    :include-settings="true"
    :include-history="true"
  >
    <div class="space-y-4">
      <article v-if="feedback" class="insight-card"><p class="settings-card__text">{{ feedback }}</p></article>
      <CampaignMultiStoreWorkspace
        v-if="scopeMode === 'all'"
        :bundles="bundles"
        :pending="pending"
        :error-message="errorMessage"
        :scope-label="scopeStoreName"
      />
      <CampaignWorkspace
        v-else
        :state="state"
        :can-manage="canEditCampaigns"
        :busy="commandPending"
        @add-campaign="handleAddCampaign"
        @update-campaign="handleUpdateCampaign"
        @remove-campaign="handleRemoveCampaign"
      />
    </div>
  </FilaAtendimentoPageShell>
</template>