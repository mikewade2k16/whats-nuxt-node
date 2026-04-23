<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import MultiStoreWorkspace from '~/components/fila-atendimento/MultiStoreWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoMultiStoreStore } from '~/stores/fila-atendimento/multistore'
import type { FilaAtendimentoManagedStore, FilaAtendimentoMultiStoreMutationResult } from '~/types/fila-atendimento'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const multistoreStore = useFilaAtendimentoMultiStoreStore()

const { state, sessionReady, commandPending } = storeToRefs(operationsStore)
const { overview, managedStores, pending, ready, errorMessage, canManage, activeTenantId } = storeToRefs(multistoreStore)

const feedback = ref('')

async function handleResult(
  action: Promise<FilaAtendimentoMultiStoreMutationResult>,
  successMessage: string,
  noChangeMessage = 'Nenhuma alteracao para salvar.'
) {
  const result = await action

  if (!result.ok) {
    feedback.value = result.message || 'Nao foi possivel atualizar a visao multiloja.'
    return
  }

  if (result.noChange) {
    feedback.value = noChangeMessage
    return
  }

  feedback.value = result.warningMessage
    ? `${successMessage} ${result.warningMessage}`
    : successMessage
}

function handleCreateStore(payload: Record<string, unknown>) {
  void handleResult(multistoreStore.createStore(payload), 'Loja criada.')
}

function handleUpdateStore(storeId: string, payload: Record<string, unknown>) {
  void handleResult(multistoreStore.updateStore(storeId, payload), 'Loja atualizada.')
}

function handleArchiveStore(storeId: string) {
  if (import.meta.client && !window.confirm('A loja sera removida da operacao ativa. Deseja continuar?')) {
    return
  }

  void handleResult(multistoreStore.archiveStore(storeId), 'Loja arquivada.')
}

function handleRestoreStore(storeId: string) {
  void handleResult(multistoreStore.restoreStore(storeId), 'Loja restaurada.')
}

function handleDeleteStore(store: FilaAtendimentoManagedStore) {
  if (import.meta.client && !window.confirm(`A exclusao de ${store.name || 'esta loja'} so funciona sem vinculos operacionais. Deseja tentar remover?`)) {
    return
  }

  void handleResult(multistoreStore.deleteStore(store.id), 'Loja removida.')
}

async function handleActivateStore(storeId: string) {
  const result = await multistoreStore.setActiveStore(storeId)
  feedback.value = result.ok ? 'Loja ativa atualizada.' : (result.message || 'Nao foi possivel ativar a loja selecionada.')
}

watch(
  [sessionReady, activeTenantId],
  ([isSessionReady, tenantId], previousValue) => {
    const [previousSessionReady, previousTenantId] = previousValue ?? []

    if (!isSessionReady || !String(tenantId || '').trim()) {
      return
    }

    if (isSessionReady !== previousSessionReady || tenantId !== previousTenantId || !ready.value) {
      void multistoreStore.ensureLoaded()
    }
  },
  { immediate: true }
)
</script>

<template>
  <FilaAtendimentoPageShell
    workspace-id="multiloja"
    title="Multi-loja"
    description="Comparativo consolidado de performance, metas e governanca das lojas do modulo no shell administrativo."
    :include-settings="true"
  >
    <MultiStoreWorkspace
      :state="state"
      :managed-stores="managedStores"
      :overview="overview"
      :can-manage="canManage"
      :loading="pending"
      :busy="pending || commandPending"
      :ready="ready"
      :error-message="errorMessage"
      :feedback="feedback"
      @activate-store="handleActivateStore"
      @create-store="handleCreateStore"
      @update-store="handleUpdateStore"
      @archive-store="handleArchiveStore"
      @restore-store="handleRestoreStore"
      @delete-store="handleDeleteStore"
    />
  </FilaAtendimentoPageShell>
</template>