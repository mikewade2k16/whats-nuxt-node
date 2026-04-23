<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import '~/assets/css/fila-atendimento-operation.css'
import AppDialogHost from '~/components/ui/AppDialogHost.vue'
import AppToastStack from '~/components/ui/AppToastStack.vue'
import FilaAtendimentoEmptyStoreState from '~/components/fila-atendimento/FilaAtendimentoEmptyStoreState.vue'
import FilaAtendimentoModuleNav from '~/components/fila-atendimento/FilaAtendimentoModuleNav.vue'
import OperationScopeBar from '~/components/fila-atendimento/OperationScopeBar.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { canManageStores, getAllowedWorkspaces, getRoleLabel } from '~/utils/fila-atendimento/permissions'

const props = withDefaults(defineProps<{
  workspaceId: string
  title: string
  description: string
  includeSnapshot?: boolean
  includeConsultants?: boolean
  includeSettings?: boolean
  includeHistory?: boolean
  includeActivitySessions?: boolean
}>(), {
  includeSnapshot: false,
  includeConsultants: false,
  includeSettings: false,
  includeHistory: false,
  includeActivitySessions: false
})

const route = useRoute()
const router = useRouter()
const operationsStore = useFilaAtendimentoOperationsStore()
const { state, stores, role, canSeeIntegrated, sessionReady, bootstrapPending, workspacePending, errorMessage } = storeToRefs(operationsStore)
const initialized = ref(false)

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const activeStoreLabel = computed(() =>
  stores.value.find((store) => normalizeText(store.id) === normalizeText(state.value.activeStoreId))?.name || 'Sem loja ativa'
)
const scopeSelectionValue = computed(() => {
  if (canSeeIntegrated.value && normalizeText(route.query.scope) === 'all') {
    return 'all'
  }

  return normalizeText(state.value.activeStoreId)
})
const sharedScopeQuery = computed(() =>
  canSeeIntegrated.value && normalizeText(route.query.scope) === 'all'
    ? { scope: 'all' }
    : undefined
)
const diagnosticLink = computed(() =>
  sharedScopeQuery.value
    ? { path: '/admin/fila-atendimento/diagnostico', query: sharedScopeQuery.value }
    : '/admin/fila-atendimento/diagnostico'
)
const pageAllowed = computed(() => getAllowedWorkspaces(role.value).includes(props.workspaceId))
const roleLabel = computed(() => getRoleLabel(role.value))
const canCreateStores = computed(() => canManageStores(role.value))
const canOpenMultistore = computed(() => getAllowedWorkspaces(role.value).includes('multiloja') && props.workspaceId !== 'multiloja')
const loading = computed(() => !initialized.value || bootstrapPending.value || workspacePending.value)
const showEmptyStoreState = computed(() => {
  if (props.workspaceId === 'multiloja' || loading.value || errorMessage.value || !pageAllowed.value) {
    return false
  }

  return sessionReady.value && !normalizeText(state.value.activeStoreId) && stores.value.length < 1
})

function buildWorkspaceOptions() {
  return {
    includeSnapshot: props.includeSnapshot,
    includeConsultants: props.includeConsultants,
    includeSettings: props.includeSettings,
    includeHistory: props.includeHistory,
    includeActivitySessions: props.includeActivitySessions
  }
}

async function ensureModuleReady() {
  const bridgeToken = normalizeText(route.query.shellBridgeToken)

  try {
    if (bridgeToken || !sessionReady.value) {
      await operationsStore.bootstrap(bridgeToken, buildWorkspaceOptions())
    } else if (!normalizeText(state.value.activeStoreId)) {
      await operationsStore.loadContext(buildWorkspaceOptions())
    } else {
      await operationsStore.ensureWorkspaceData(state.value.activeStoreId, buildWorkspaceOptions())
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

async function handleStoreChange(event: Event) {
  const nextStoreId = normalizeText((event.target as HTMLSelectElement)?.value)
  await operationsStore.selectStore(nextStoreId, buildWorkspaceOptions())
}

async function handleScopeSelection(nextValue: string) {
  const normalizedValue = normalizeText(nextValue)
  const nextQuery = { ...route.query }

  if (canSeeIntegrated.value && normalizedValue === 'all') {
    nextQuery.scope = 'all'
    await router.replace({ query: nextQuery })
    return
  }

  delete nextQuery.scope
  await router.replace({ query: nextQuery })

  if (normalizedValue && normalizedValue !== normalizeText(state.value.activeStoreId)) {
    await operationsStore.selectStore(normalizedValue, buildWorkspaceOptions())
  }
}

onMounted(() => {
  void ensureModuleReady()
})
</script>

<template>
  <div class="fila-admin-app">
    <div class="workspace fila-admin-app__shell">
      <header class="module-shell__header" style="display: none !important;">
        <div class="module-shell__copy">
          <p class="fila-admin-app__eyebrow">Fila de Atendimento</p>
          <h1 class="fila-admin-app__title">{{ title }}</h1>
          <p class="fila-admin-app__subtitle">{{ description }}</p>
        </div>
      </header>

      <OperationScopeBar
        :can-see-integrated="canSeeIntegrated"
        :stores="stores"
        :model-value="scopeSelectionValue"
        select-label="Loja"
        @update:model-value="handleScopeSelection"
      >
        <template #status>
          <span class="module-shell__pill">{{ roleLabel }}</span>
          <span v-if="scopeSelectionValue !== 'all'" class="module-shell__pill">{{ activeStoreLabel }}</span>
        </template>

        <template #actions>
          <NuxtLink class="fila-admin-app__diag-link" :to="diagnosticLink">Diagnóstico</NuxtLink>
        </template>
      </OperationScopeBar>

      <FilaAtendimentoModuleNav :active-workspace="workspaceId" :role="role" />

      <div v-if="errorMessage" class="loading-state">
        <strong class="loading-state__title">Não foi possível carregar o módulo</strong>
        <p class="workspace__text">{{ errorMessage }}</p>
      </div>

      <div v-else-if="loading" class="loading-state">
        <strong class="loading-state__title">Carregando workspace...</strong>
        <p class="workspace__text">Sincronizando sessão, loja ativa e dados hospedados do módulo.</p>
      </div>

      <div v-else-if="!pageAllowed" class="unsupported-card">
        <p class="unsupported-card__eyebrow">Acesso restrito</p>
        <h2 class="admin-panel__title">Área não liberada para este perfil</h2>
        <p class="admin-panel__text">O papel recebido da sessão do módulo não inclui esta área na matriz oficial de workspaces.</p>
      </div>

      <FilaAtendimentoEmptyStoreState
        v-else-if="showEmptyStoreState"
        :can-manage-stores="canCreateStores"
        :show-multistore-link="canOpenMultistore"
      />

      <slot v-else />

      <AppDialogHost />
      <AppToastStack />
    </div>
  </div>
</template>
