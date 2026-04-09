<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import CampaignWorkspace from '~/components/fila-atendimento/CampaignWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import type { FilaAtendimentoCampaign } from '~/types/fila-atendimento'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const { state, canEditCampaigns, commandPending } = storeToRefs(operationsStore)
const feedback = ref('')

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
  <FilaAtendimentoPageShell workspace-id="campanhas" title="Campanhas" description="Regras comerciais e incentivos aplicados automaticamente no fechamento do atendimento.">
    <div class="space-y-4">
      <article v-if="feedback" class="insight-card"><p class="settings-card__text">{{ feedback }}</p></article>
      <CampaignWorkspace
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