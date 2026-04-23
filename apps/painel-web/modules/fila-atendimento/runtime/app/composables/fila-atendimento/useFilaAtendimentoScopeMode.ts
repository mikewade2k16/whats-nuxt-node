import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function useFilaAtendimentoScopeMode() {
  const route = useRoute()
  const operationsStore = useFilaAtendimentoOperationsStore()
  const { state, stores, canSeeIntegrated } = storeToRefs(operationsStore)

  const scopeMode = computed(() =>
    canSeeIntegrated.value && normalizeText(route.query.scope) === 'all' ? 'all' : 'single'
  )

  const scopeStoreIds = computed(() => {
    if (scopeMode.value === 'all') {
      return stores.value
        .map(store => normalizeText(store.id))
        .filter(Boolean)
    }

    const activeStoreId = normalizeText(state.value.activeStoreId)
    return activeStoreId ? [activeStoreId] : []
  })

  const scopeStoreName = computed(() => {
    if (scopeMode.value === 'all') {
      return 'Todas as lojas'
    }

    const activeStoreId = normalizeText(state.value.activeStoreId)
    return stores.value.find(store => normalizeText(store.id) === activeStoreId)?.name || ''
  })

  return {
    scopeMode,
    scopeStoreIds,
    scopeStoreName
  }
}