<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import ConsultantWorkspace from '~/components/fila-atendimento/ConsultantWorkspace.vue'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import type { FilaAtendimentoConsultantProfilePayload } from '~/types/fila-atendimento'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const { state, canEditConsultants, commandPending } = storeToRefs(operationsStore)
const feedback = ref('')

async function handleCreate(payload: FilaAtendimentoConsultantProfilePayload) {
  const result = await operationsStore.createConsultantProfile(payload)
  feedback.value = result.ok ? 'Consultor criado.' : (result.message || 'Nao foi possivel criar consultor.')
}

async function handleUpdate(consultantId: string, payload: FilaAtendimentoConsultantProfilePayload) {
  const result = await operationsStore.updateConsultantProfile(consultantId, payload)
  feedback.value = result.ok ? 'Consultor atualizado.' : (result.message || 'Nao foi possivel atualizar consultor.')
}

async function handleArchive(consultantId: string) {
  const result = await operationsStore.archiveConsultantProfile(consultantId)
  feedback.value = result.ok ? 'Consultor arquivado.' : (result.message || 'Nao foi possivel arquivar consultor.')
}
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="consultor" title="Consultor" description="Perfil operacional, metas e manutencao do roster da loja ativa.">
    <div class="space-y-4">
      <article v-if="feedback" class="insight-card"><p class="settings-card__text">{{ feedback }}</p></article>
      <ConsultantWorkspace :state="state" :can-manage="canEditConsultants" :busy="commandPending" @create="handleCreate" @update="handleUpdate" @archive="handleArchive" />
    </div>
  </FilaAtendimentoPageShell>
</template>
