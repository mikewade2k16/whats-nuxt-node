<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppDialogHost from '~/components/ui/AppDialogHost.vue'
import AppToastStack from '~/components/ui/AppToastStack.vue'
import FilaAtendimentoModuleNav from '~/components/fila-atendimento/FilaAtendimentoModuleNav.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { getAllowedWorkspaces, getRoleLabel } from '~/utils/fila-atendimento/permissions'

const props = defineProps<{
  workspaceId: string
  title: string
  description: string
}>()

const route = useRoute()
const router = useRouter()
const operationsStore = useFilaAtendimentoOperationsStore()
const { state, stores, role, sessionReady, bootstrapPending, workspacePending, errorMessage } = storeToRefs(operationsStore)
const initialized = ref(false)

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const activeStoreLabel = computed(() =>
  stores.value.find((store) => normalizeText(store.id) === normalizeText(state.value.activeStoreId))?.name || 'Sem loja ativa'
)
const pageAllowed = computed(() => getAllowedWorkspaces(role.value).includes(props.workspaceId))
const roleLabel = computed(() => getRoleLabel(role.value))
const loading = computed(() => !initialized.value || bootstrapPending.value || workspacePending.value)

async function ensureModuleReady() {
  const bridgeToken = normalizeText(route.query.shellBridgeToken)

  try {
    if (!sessionReady.value) {
      await operationsStore.bootstrap(bridgeToken)
    } else if (!normalizeText(state.value.activeStoreId)) {
      await operationsStore.loadContext()
    } else if (!state.value.operationTemplates.length && !workspacePending.value) {
      await operationsStore.refreshWorkspaceState(true)
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
  await operationsStore.selectStore(nextStoreId)
}

onMounted(() => {
  void ensureModuleReady()
})
</script>

<template>
  <div class="fila-admin-app">
    <div class="workspace fila-admin-app__shell">
      <header class="module-shell__header">
        <div class="module-shell__copy">
          <p class="fila-admin-app__eyebrow">Fila de Atendimento</p>
          <h1 class="fila-admin-app__title">{{ title }}</h1>
          <p class="fila-admin-app__subtitle">{{ description }}</p>
        </div>

        <div class="module-shell__meta">
          <span class="module-shell__pill">{{ roleLabel }}</span>
          <span class="module-shell__pill">{{ activeStoreLabel }}</span>
          <label class="module-shell__field">
            <span class="module-shell__label">Loja ativa</span>
            <select class="module-shell__select" :value="state.activeStoreId" @change="handleStoreChange">
              <option value="">Selecione</option>
              <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
            </select>
          </label>
          <NuxtLink class="fila-admin-app__diag-link" to="/admin/fila-atendimento/diagnostico">Diagnostico</NuxtLink>
        </div>
      </header>

      <FilaAtendimentoModuleNav :active-workspace="workspaceId" :role="role" />

      <div v-if="errorMessage" class="loading-state">
        <strong class="loading-state__title">Nao foi possivel carregar o modulo</strong>
        <p class="workspace__text">{{ errorMessage }}</p>
      </div>

      <div v-else-if="loading" class="loading-state">
        <strong class="loading-state__title">Carregando workspace...</strong>
        <p class="workspace__text">Sincronizando sessao, loja ativa e dados hospedados do modulo.</p>
      </div>

      <div v-else-if="!pageAllowed" class="unsupported-card">
        <p class="unsupported-card__eyebrow">Acesso restrito</p>
        <h2 class="admin-panel__title">Area nao liberada para este perfil</h2>
        <p class="admin-panel__text">O papel recebido da sessao do modulo nao inclui esta area na matriz oficial de workspaces.</p>
      </div>

      <slot v-else />

      <AppDialogHost />
      <AppToastStack />
    </div>
  </div>
</template>