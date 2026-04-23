<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoScopeMode } from '~/composables/fila-atendimento/useFilaAtendimentoScopeMode'
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import SettingsGlobalWorkspace from '~/components/fila-atendimento/SettingsGlobalWorkspace.vue'
import SettingsWorkspace from '~/components/fila-atendimento/SettingsWorkspace.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoWorkspaceBundlesStore } from '~/stores/fila-atendimento/workspace-bundles'
import { useUiStore } from '~/stores/ui'
import type { FilaAtendimentoModalConfig, FilaAtendimentoSettingsAppSettings, FilaAtendimentoSettingsOptionGroup, FilaAtendimentoSettingsProductItem } from '~/types/fila-atendimento'

definePageMeta({ layout: 'admin' })

const operationsStore = useFilaAtendimentoOperationsStore()
const workspaceBundlesStore = useFilaAtendimentoWorkspaceBundlesStore()
const ui = useUiStore()
const { state, canEditSettings, commandPending, sessionReady } = storeToRefs(operationsStore)
const { bundles, pending, errorMessage } = storeToRefs(workspaceBundlesStore)
const { scopeMode, scopeStoreIds, scopeStoreName } = useFilaAtendimentoScopeMode()

watch([sessionReady, scopeMode, scopeStoreIds], ([ready, nextScopeMode, storeIds]) => {
  if (!ready || nextScopeMode !== 'all' || !storeIds.length) {
    workspaceBundlesStore.clearState()
    return
  }

  void workspaceBundlesStore.ensureLoaded(storeIds, { includeSettings: true }).catch(() => undefined)
}, { immediate: true })

async function handleMutationResult(action: Promise<{ ok: boolean; message?: string }>, successMessage: string, errorMessage: string) {
  const result = await action

  if (!result.ok) {
    ui.error(result.message || errorMessage)
    return false
  }

  ui.success(successMessage)
  return true
}

function handleUpdateOperation(patch: Partial<FilaAtendimentoSettingsAppSettings>) {
  void handleMutationResult(operationsStore.updateOperationSettings(patch), 'Configuracao operacional salva.', 'Nao foi possivel salvar a configuracao operacional.')
}

function handleApplyTemplate(templateId: string) {
  void handleMutationResult(operationsStore.applyOperationTemplate(templateId), 'Template aplicado.', 'Nao foi possivel aplicar o template.')
}

function handleUpdateModal(patch: Partial<FilaAtendimentoModalConfig>) {
  void handleMutationResult(operationsStore.updateModalConfig(patch), 'Configuracao do modal salva.', 'Nao foi possivel salvar a configuracao do modal.')
}

function handleAddOption(group: FilaAtendimentoSettingsOptionGroup, label: string) {
  void handleMutationResult(operationsStore.addSettingsOption(group, label), 'Opcao adicionada.', 'Nao foi possivel adicionar a opcao.')
}

function handleUpdateOption(group: FilaAtendimentoSettingsOptionGroup, optionId: string, label: string) {
  void handleMutationResult(operationsStore.updateSettingsOption(group, optionId, label), 'Opcao atualizada.', 'Nao foi possivel atualizar a opcao.')
}

function handleRemoveOption(group: FilaAtendimentoSettingsOptionGroup, optionId: string) {
  void handleMutationResult(operationsStore.removeSettingsOption(group, optionId), 'Opcao removida.', 'Nao foi possivel remover a opcao.')
}

function handleAddProduct(payload: { name: string; category: string; basePrice: number; code: string }) {
  void handleMutationResult(
    operationsStore.addCatalogProduct(payload.name, payload.category, payload.basePrice, payload.code),
    'Produto adicionado.',
    'Nao foi possivel adicionar o produto.'
  )
}

function handleUpdateProduct(productId: string, payload: Partial<FilaAtendimentoSettingsProductItem>) {
  void handleMutationResult(operationsStore.updateCatalogProduct(productId, payload), 'Produto atualizado.', 'Nao foi possivel atualizar o produto.')
}

function handleRemoveProduct(productId: string) {
  void handleMutationResult(operationsStore.removeCatalogProduct(productId), 'Produto removido.', 'Nao foi possivel remover o produto.')
}
</script>

<template>
  <FilaAtendimentoPageShell
    workspace-id="configuracoes"
    title="Configuracoes"
    description="Parametros de operacao, modal, catalogos e opcoes do modulo."
    :include-settings="true"
  >
    <SettingsGlobalWorkspace
      v-if="scopeMode === 'all'"
      :bundles="bundles"
      :pending="pending"
      :error-message="errorMessage"
      :scope-label="scopeStoreName"
    />
    <SettingsWorkspace
      v-else
      :state="state"
      :can-manage="canEditSettings"
      :busy="commandPending"
      @update-operation="handleUpdateOperation"
      @apply-template="handleApplyTemplate"
      @update-modal-config="handleUpdateModal"
      @add-option="handleAddOption"
      @update-option="handleUpdateOption"
      @remove-option="handleRemoveOption"
      @add-product="handleAddProduct"
      @update-product="handleUpdateProduct"
      @remove-product="handleRemoveProduct"
    />
  </FilaAtendimentoPageShell>
</template>
