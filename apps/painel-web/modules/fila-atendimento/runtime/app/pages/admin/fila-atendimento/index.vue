<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { UAlert, UBadge } from '#components'
import '~/assets/css/fila-atendimento-operation.css'
import FilaAtendimentoEmptyStoreState from '~/components/fila-atendimento/FilaAtendimentoEmptyStoreState.vue'
import FilaAtendimentoModuleNav from '~/components/fila-atendimento/FilaAtendimentoModuleNav.vue'
import OperationCampaignBrief from '~/components/fila-atendimento/OperationCampaignBrief.vue'
import OperationScopeBar from '~/components/fila-atendimento/OperationScopeBar.vue'
import OperationWorkspace from '~/components/fila-atendimento/OperationWorkspace.vue'
import AppDialogHost from '~/components/ui/AppDialogHost.vue'
import AppToastStack from '~/components/ui/AppToastStack.vue'
import { useFilaAtendimentoOperationsRealtime } from '~/composables/fila-atendimento/useOperationsRealtime'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { canAccessOperations, canManageStores, canMutateOperations, getAllowedWorkspaces, getRoleLabel } from '~/utils/fila-atendimento/permissions'
import { getFilaAtendimentoWorkspace } from '~/utils/fila-atendimento/workspaces'

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
  commandPending,
  errorMessage,
  workspaceError
} = storeToRefs(store)

const { realtimeStatus, realtimeErrorMessage, lastRealtimeEventAt } = useFilaAtendimentoOperationsRealtime(store)

const initialized = ref(false)

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const scopeMode = computed(() => (canSeeIntegrated.value && normalizeText(route.query.scope) === 'all' ? 'all' : 'single'))
const scopeSelectionValue = computed(() => {
  if (scopeMode.value === 'all' && canSeeIntegrated.value) {
    return 'all'
  }

  return normalizeText(state.value.activeStoreId)
})

const canOperate = computed(() => canMutateOperations(role.value))
const canCreateStores = computed(() => canManageStores(role.value))
const sharedScopeQuery = computed(() => scopeMode.value === 'all' ? { scope: 'all' } : undefined)
const diagnosticLink = computed(() =>
  sharedScopeQuery.value
    ? { path: '/admin/fila-atendimento/diagnostico', query: sharedScopeQuery.value }
    : '/admin/fila-atendimento/diagnostico'
)
const metricsLink = computed(() =>
  sharedScopeQuery.value
    ? { path: '/admin/fila-atendimento/metricas', query: sharedScopeQuery.value }
    : '/admin/fila-atendimento/metricas'
)
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
const showEmptyStoreState = computed(() => {
  if (!initialized.value || !sessionReady.value || shouldShowLoadingState.value || Boolean(pageErrorMessage.value)) {
    return false
  }

  if (!canAccessOperations(role.value)) {
    return false
  }

  return !normalizeText(state.value.activeStoreId) && stores.value.length < 1
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

const realtimeStatusLabel = computed(() => {
  switch (realtimeStatus.value) {
    case 'connected':
      return 'Realtime conectado'
    case 'reconnecting':
      return 'Realtime reconectando'
    case 'connecting':
      return 'Realtime conectando'
    case 'error':
      return 'Realtime com falha'
    default:
      return 'Realtime ocioso'
  }
})

const roleLabel = computed(() => getRoleLabel(role.value))

function buildOperationLoadOptions() {
  return {
    includeSnapshot: true,
    includeConsultants: true,
    includeSettings: true,
    includeHistory: false,
    includeActivitySessions: false
  }
}

function collectPagePerformanceMetrics() {
  if (typeof performance === 'undefined') {
    return {}
  }

  const navigation = performance.getEntriesByType('navigation')?.[0] as PerformanceNavigationTiming | undefined
  if (!navigation) {
    return {
      collectedAtMs: Math.round(performance.now())
    }
  }

  return {
    totalLoadMs: Math.round(navigation.loadEventEnd || performance.now()),
    domReadyMs: Math.round(navigation.domContentLoadedEventEnd || 0),
    responseMs: Math.round(Math.max(0, navigation.responseEnd - navigation.requestStart)),
    transferSize: navigation.transferSize || 0,
    decodedBodySize: navigation.decodedBodySize || 0
  }
}

function resolveFallbackWorkspacePath(currentRole: string) {
  const fallbackWorkspaceId = getAllowedWorkspaces(currentRole).find(workspaceId => workspaceId !== 'operacao')
  if (!fallbackWorkspaceId) {
    return ''
  }

  return getFilaAtendimentoWorkspace(fallbackWorkspaceId)?.path || ''
}

async function bootstrapPage() {
  const bridgeToken = normalizeText(route.query.shellBridgeToken)
  const nextQuery = { ...route.query }
  delete nextQuery.shellBridgeToken

  try {
    if (bridgeToken || !sessionReady.value) {
      await store.bootstrap(bridgeToken, buildOperationLoadOptions())
    } else if (!normalizeText(state.value.activeStoreId)) {
      await store.loadContext(buildOperationLoadOptions())
    } else {
      await store.ensureWorkspaceData(state.value.activeStoreId, buildOperationLoadOptions())
    }

    if (!canAccessOperations(role.value)) {
      const fallbackPath = resolveFallbackWorkspacePath(role.value)
      if (fallbackPath) {
        await router.replace({
          path: fallbackPath,
          query: nextQuery
        })
        return
      }
    }

    if (scopeMode.value === 'all' && canSeeIntegrated.value) {
      await store.refreshOverview().catch(() => undefined)
    }
  } finally {
    initialized.value = true
  }

  if (bridgeToken) {
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
  await store.selectStore(storeId, buildOperationLoadOptions())

  if (scopeMode.value === 'all' && canSeeIntegrated.value) {
    await store.refreshOverview().catch(() => undefined)
  }
}

async function handleScopeSelection(nextValue: string) {
  const normalizedValue = normalizeText(nextValue)

  if (canSeeIntegrated.value && normalizedValue === 'all') {
    await handleScopeChange('all')
    await store.refreshOverview().catch(() => undefined)
    return
  }

  await handleScopeChange('single')

  if (normalizedValue && normalizedValue !== normalizeText(state.value.activeStoreId)) {
    await handleActiveStoreChange(normalizedValue)
  }
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
      await store.loadWorkspace(state.value.activeStoreId, buildOperationLoadOptions()).catch(() => undefined)
    }
  }
)

onMounted(() => {
  void bootstrapPage().then(() => {
    store.recordQueuePageLoad(collectPagePerformanceMetrics())
  })
})
</script>

<template>
  <section class="fila-atendimento-operacao-page">
    <AdminPageHeader
      eyebrow="Fila"
      title="Operação"
      description="Fila ativa, atendimento em curso e visão integrada das lojas hospedados no painel admin."
    />

    <div class="fila-admin-app">
      <div class="workspace fila-admin-app__shell">
        <div class="fila-admin-app__toolbar">
          <OperationScopeBar
            :can-see-integrated="canSeeIntegrated"
            :stores="stores"
            :model-value="scopeSelectionValue"
            select-label="Loja"
            @update:model-value="handleScopeSelection"
          >
            <template #status>
              <UBadge color="neutral" variant="soft">{{ roleLabel }}</UBadge>
              <UBadge :color="realtimeBadgeColor" variant="soft">{{ realtimeStatusLabel }}</UBadge>
            </template>

            <template #brief>
              <OperationCampaignBrief :state="state" compact />
            </template>

            <template #actions>
              <NuxtLink class="fila-admin-app__diag-link" :to="diagnosticLink">
                Diagnóstico
              </NuxtLink>
              <NuxtLink class="fila-admin-app__diag-link" :to="metricsLink">
                Métricas
              </NuxtLink>
            </template>
          </OperationScopeBar>
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
          Realtime acompanhando a loja ativa. Último evento: {{ new Date(lastRealtimeEventAt).toLocaleTimeString('pt-BR') }}.
        </p>

        <div v-if="commandPending" class="fila-admin-app__action-status" role="status" aria-live="polite">
          <AppMaterialIcon name="hourglass_top" />
          <strong>Processando ação...</strong>
          <span>A fila já recebeu o comando e está aguardando confirmação do backend.</span>
        </div>

        <div v-if="pageErrorMessage" class="loading-state">
          <strong class="loading-state__title">Não foi possível carregar a operação</strong>
          <p class="workspace__text">{{ pageErrorMessage }}</p>
        </div>

        <div v-else-if="shouldShowLoadingState" class="loading-state">
          <strong class="loading-state__title">Carregando operação...</strong>
          <p class="workspace__text">
            {{ scopeMode === 'all' ? 'Sincronizando a operação integrada das lojas acessíveis.' : 'Sincronizando consultores, fila e atendimento da loja ativa.' }}
          </p>
        </div>

        <FilaAtendimentoEmptyStoreState
          v-else-if="showEmptyStoreState"
          :can-manage-stores="canCreateStores"
        />

        <div v-else class="workspace-host">
          <OperationWorkspace
            :state="state"
            :overview="overview"
            :scope-mode="scopeMode"
            :can-see-integrated="canSeeIntegrated"
            :can-operate="canOperate"
            :busy="commandPending"
            :stores="stores"
            integrated-store-id=""
          />
        </div>
      </div>

      <AppDialogHost />
      <AppToastStack />
    </div>
  </section>
</template>

<style scoped>
.fila-atendimento-operacao-page {
  display: grid;
  gap: 0.75rem;
}

.fila-admin-app {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.fila-admin-app__shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 0.75rem;
  min-height: 0;
  overflow: hidden;
}

.fila-admin-app__toolbar {
  display: flex;
  align-items: center;
  min-height: 0;
}

.fila-admin-app__toolbar :deep(.operation-scope-bar) {
  width: 100%;
}

.fila-admin-app__diag-link {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(125, 146, 255, 0.2);
  border-radius: 999px;
  background: rgba(10, 16, 32, 0.72);
  color: #c7d2fe;
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
}

.fila-admin-app__action-status {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(129, 140, 248, 0.24);
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.72);
  color: #dbeafe;
  font-size: 0.82rem;
}

.fila-admin-app__action-status .material-icons-round {
  font-size: 1rem;
}

.fila-admin-app__action-status span:last-child {
  color: rgba(203, 213, 225, 0.86);
}

.fila-admin-app__note {
  margin: 0;
  color: rgba(148, 163, 184, 0.92);
  font-size: 0.78rem;
}

.workspace-host {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .fila-atendimento-operacao-page {
    height: calc(100dvh - 7rem);
    max-height: calc(100dvh - 7rem);
    min-height: calc(100dvh - 7rem);
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .fila-admin-app,
  .fila-admin-app__shell,
  .workspace-host {
    height: 100%;
  }
}
</style>
