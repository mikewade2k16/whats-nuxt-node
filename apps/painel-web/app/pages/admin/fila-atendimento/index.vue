<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { UAlert, UBadge } from '#components'
import FilaAtendimentoModuleNav from '~/components/fila-atendimento/FilaAtendimentoModuleNav.vue'
import OperationWorkspace from '~/components/fila-atendimento/OperationWorkspace.vue'
import AppDialogHost from '~/components/ui/AppDialogHost.vue'
import AppToastStack from '~/components/ui/AppToastStack.vue'
import { useFilaAtendimentoOperationsRealtime } from '~/composables/fila-atendimento/useOperationsRealtime'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { canMutateOperations, getRoleLabel } from '~/utils/fila-atendimento/permissions'

definePageMeta({
  layout: 'admin'
})

const route = useRoute()
const router = useRouter()
const store = useFilaAtendimentoOperationsStore()
const {
  state,
  stores,
  role,
  canSeeIntegrated,
  overview,
  overviewPending,
  overviewError,
  sessionReady,
  bootstrapPending,
  workspacePending,
  errorMessage,
  workspaceError
} = storeToRefs(store)

const { realtimeStatus, realtimeErrorMessage, lastRealtimeEventAt } = useFilaAtendimentoOperationsRealtime(store)

const initialized = ref(false)
const integratedStoreId = ref('')

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const scopeMode = computed(() => {
  if (!canSeeIntegrated.value) {
    return 'single'
  }

  return normalizeText(route.query.scope) === 'all' ? 'all' : 'single'
})

const canOperate = computed(() => canMutateOperations(role.value))
const hasWorkspaceData = computed(() => Boolean(state.value.activeStoreId) && (!workspacePending.value || Boolean(state.value.roster.length || state.value.waitingList.length || state.value.activeServices.length)))
const pageErrorMessage = computed(() => {
  if (errorMessage.value) {
    return errorMessage.value
  }

  if (scopeMode.value === 'all' && !overview.value && overviewError.value) {
    return overviewError.value
  }

  if (!hasWorkspaceData.value && workspaceError.value) {
    return workspaceError.value
  }

  return ''
})

const shouldShowLoadingState = computed(() => {
  if (pageErrorMessage.value) {
    return false
  }

  if (!initialized.value || bootstrapPending.value) {
    return true
  }

  if (scopeMode.value === 'all' && canSeeIntegrated.value) {
    return overviewPending.value && !overview.value
  }

  return workspacePending.value && !hasWorkspaceData.value
})

const realtimeBadgeColor = computed(() => {
  switch (realtimeStatus.value) {
    case 'connected':
      return 'success'
    case 'connecting':
    case 'reconnecting':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'neutral'
  }
})

const activeStoreLabel = computed(() =>
  stores.value.find((item) => normalizeText(item.id) === normalizeText(state.value.activeStoreId))?.name || 'Sem loja ativa'
)

const roleLabel = computed(() => getRoleLabel(role.value))

async function bootstrapPage() {
  const bridgeToken = normalizeText(route.query.shellBridgeToken)

  try {
    await store.bootstrap(bridgeToken)
    if (scopeMode.value === 'all' && canSeeIntegrated.value) {
      await store.refreshOverview().catch(() => undefined)
    }
  } finally {
    initialized.value = true
  }

  if (bridgeToken) {
    const nextQuery = { ...route.query }
    delete nextQuery.shellBridgeToken
    await router.replace({ query: nextQuery })
  }
}

async function handleScopeChange(nextScope: string) {
  const normalizedScope = normalizeText(nextScope)
  const nextQuery = { ...route.query }

  if (!canSeeIntegrated.value || normalizedScope !== 'all') {
    delete nextQuery.scope
  } else {
    nextQuery.scope = 'all'
  }

  await router.replace({ query: nextQuery })
}

async function handleActiveStoreChange(storeId: string) {
  await store.selectStore(storeId)

  if (scopeMode.value === 'all' && canSeeIntegrated.value) {
    await store.refreshOverview().catch(() => undefined)
  }
}

function handleIntegratedStoreChange(storeId: string) {
  integratedStoreId.value = normalizeText(storeId)
}

watch(
  canSeeIntegrated,
  (allowed) => {
    if (allowed || normalizeText(route.query.scope) !== 'all') {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery.scope
    void router.replace({ query: nextQuery })
  }
)

watch(
  stores,
  (nextStores) => {
    const normalizedFilter = normalizeText(integratedStoreId.value)
    if (!normalizedFilter) {
      return
    }

    const exists = (nextStores || []).some((item) => normalizeText(item.id) === normalizedFilter)
    if (!exists) {
      integratedStoreId.value = ''
    }
  },
  { immediate: true }
)

watch(
  scopeMode,
  async (nextScope, previousScope) => {
    if (!initialized.value || !sessionReady.value) {
      return
    }

    if (nextScope === 'all' && canSeeIntegrated.value) {
      await store.refreshOverview().catch(() => undefined)
      return
    }

    store.clearOverview()
    if (previousScope === 'all' && state.value.activeStoreId) {
      await store.loadWorkspace(state.value.activeStoreId, { includeSettings: false }).catch(() => undefined)
    }
  }
)

onMounted(() => {
  void bootstrapPage()
})
</script>

<template>
  <section class="fila-atendimento-operacao-page space-y-4">
    <AdminPageHeader
      eyebrow="Fila"
      title="Operacao"
      description="Fila ativa, atendimento em curso e visao integrada das lojas hospedados no painel admin."
    />

    <div class="fila-admin-app">
      <div class="workspace fila-admin-app__shell">
        <div class="fila-admin-app__toolbar">
          <div class="fila-admin-app__status">
            <UBadge color="neutral" variant="soft">{{ activeStoreLabel }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ roleLabel }}</UBadge>
            <UBadge :color="realtimeBadgeColor" variant="soft">
              {{ realtimeStatus === 'connected' ? 'Realtime conectado' : realtimeStatus === 'reconnecting' ? 'Realtime reconectando' : realtimeStatus === 'connecting' ? 'Realtime conectando' : realtimeStatus === 'error' ? 'Realtime com falha' : 'Realtime ocioso' }}
            </UBadge>
          </div>

          <NuxtLink class="fila-admin-app__diag-link" to="/admin/fila-atendimento/diagnostico">
            Abrir diagnostico
          </NuxtLink>
        </div>

        <FilaAtendimentoModuleNav active-workspace="operacao" :role="role" />

        <UAlert
          v-if="realtimeErrorMessage"
          color="warning"
          variant="soft"
          title="Bridge realtime"
          :description="realtimeErrorMessage"
        />

        <p v-if="scopeMode === 'all' && lastRealtimeEventAt" class="fila-admin-app__note">
          Realtime acompanhando a loja ativa. Ultimo evento: {{ new Date(lastRealtimeEventAt).toLocaleTimeString('pt-BR') }}.
        </p>

        <div v-if="pageErrorMessage" class="loading-state">
          <strong class="loading-state__title">Nao foi possivel carregar a operacao</strong>
          <p class="workspace__text">{{ pageErrorMessage }}</p>
        </div>

        <div v-else-if="shouldShowLoadingState" class="loading-state">
          <strong class="loading-state__title">Carregando operacao...</strong>
          <p class="workspace__text">
            {{ scopeMode === 'all' ? 'Sincronizando a operacao integrada das lojas acessiveis.' : 'Sincronizando consultores, fila e atendimento da loja ativa.' }}
          </p>
        </div>

        <div v-else class="workspace-host">
          <OperationWorkspace
            :state="state"
            :overview="overview"
            :scope-mode="scopeMode"
            :can-see-integrated="canSeeIntegrated"
            :can-operate="canOperate"
            :stores="stores"
            :integrated-store-id="integratedStoreId"
            @scope-change="handleScopeChange"
            @active-store-change="handleActiveStoreChange"
            @integrated-store-change="handleIntegratedStoreChange"
          />
        </div>
      </div>

      <AppDialogHost />
      <AppToastStack />
    </div>
  </section>
</template>

<style scoped>
.fila-admin-app__shell {
  display: grid;
  gap: 1rem;
}

.fila-admin-app__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.fila-admin-app__status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.fila-admin-app__diag-link {
  color: #c7d2fe;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.fila-admin-app__note {
  margin: 0;
  color: rgba(148, 163, 184, 0.92);
  font-size: 0.78rem;
}
</style>
