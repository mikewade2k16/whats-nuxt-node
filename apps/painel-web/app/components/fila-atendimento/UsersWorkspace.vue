<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FilaAtendimentoTenantContext, FilaAtendimentoStoreContext, FilaAtendimentoUserView } from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useFilaAtendimentoUsersStore } from '~/stores/fila-atendimento/users'
import { getRoleLabel } from '~/utils/fila-atendimento/permissions'

interface UserDraft {
  coreUserId: string
  displayName: string
  email: string
  password: string
  role: string
  tenantId: string
  storeIds: string[]
  active: boolean
}

const operationsStore = useFilaAtendimentoOperationsStore()
const usersStore = useFilaAtendimentoUsersStore()

const editingUserId = ref('')
const feedbackMessage = ref('')
const temporaryPassword = ref('')
const directorySearch = ref('')

const createDraft = reactive<UserDraft>({
  coreUserId: '',
  displayName: '',
  email: '',
  password: '',
  role: 'store_terminal',
  tenantId: '',
  storeIds: [],
  active: true
})

const editDraft = reactive<UserDraft>({
  coreUserId: '',
  displayName: '',
  email: '',
  password: '',
  role: 'store_terminal',
  tenantId: '',
  storeIds: [],
  active: true
})

const canEditUsers = computed(() => usersStore.manageable)
const busy = computed(() => usersStore.pending || usersStore.directoryPending)
const roleCatalog = computed(() => usersStore.assignableRoles)
const genericRoleCatalog = computed(() => roleCatalog.value.filter((role) => role.id !== 'consultant'))
const tenants = computed(() => (operationsStore.moduleContext?.context?.tenants || []) as FilaAtendimentoTenantContext[])
const allStoreOptions = computed(() => (operationsStore.moduleContext?.context?.stores || []) as FilaAtendimentoStoreContext[])
const assignableShellUsers = computed(() => {
  const grantedCoreUserIds = new Set(
    usersStore.users
      .map((user) => String(user.coreUserId || '').trim())
      .filter(Boolean)
  )

  return usersStore.directoryUsers.filter((user) => !grantedCoreUserIds.has(user.coreUserId) || user.coreUserId === createDraft.coreUserId)
})
const normalizedDirectorySearch = computed(() => String(directorySearch.value || '').trim().toLowerCase())
const filteredAssignableShellUsers = computed(() => {
  const query = normalizedDirectorySearch.value
  if (!query) {
    return assignableShellUsers.value
  }

  return assignableShellUsers.value.filter((user) => {
    if (user.coreUserId === createDraft.coreUserId) {
      return true
    }

    const haystack = [user.displayName, user.email, user.clientName]
      .map((value) => String(value || '').trim().toLowerCase())
      .join(' ')

    return haystack.includes(query)
  })
})
const shellDirectorySummary = computed(() => {
  const total = assignableShellUsers.value.length
  const visible = filteredAssignableShellUsers.value.length
  if (!normalizedDirectorySearch.value) {
    return `${total} usuarios disponiveis para grant.`
  }

  return `${visible} de ${total} usuarios visiveis na busca atual.`
})
const selectedCreateShellUser = computed(() =>
  usersStore.directoryUsers.find((user) => user.coreUserId === createDraft.coreUserId) || null
)

const tenantSelectOptions = computed(() =>
  tenants.value.map((tenant) => ({
    value: String(tenant.id || '').trim(),
    label: String(tenant.name || tenant.id || '').trim()
  }))
)

const genericRoleOptions = computed(() =>
  genericRoleCatalog.value.map((role) => ({
    value: String(role.id || '').trim(),
    label: String(role.label || '').trim()
  }))
)

function isConsultantManaged(user: FilaAtendimentoUserView | null | undefined) {
  return String(user?.managedBy || '').trim() === 'consultants' || String(user?.role || '').trim() === 'consultant'
}

function isShellManaged(user: FilaAtendimentoUserView | null | undefined) {
  return String(user?.identityProvider || '').trim() === 'painel-web-shell' && String(user?.coreUserId || '').trim() !== ''
}

function getRoleDefinition(roleId: unknown) {
  return roleCatalog.value.find((role) => String(role.id || '').trim() === String(roleId || '').trim()) || null
}

function isStoreScoped(roleId: unknown) {
  return getRoleDefinition(roleId)?.scope === 'store'
}

function isTenantScoped(roleId: unknown) {
  return getRoleDefinition(roleId)?.scope === 'tenant'
}

function syncDraftScope(draft: UserDraft) {
  if (isStoreScoped(draft.role)) {
    draft.tenantId = draft.tenantId || usersStore.activeTenantId || tenantSelectOptions.value[0]?.value || ''
    if (draft.storeIds.length > 1) {
      draft.storeIds = draft.storeIds.slice(0, 1)
    }
    return
  }

  draft.storeIds = []
  if (isTenantScoped(draft.role)) {
    draft.tenantId = draft.tenantId || usersStore.activeTenantId || tenantSelectOptions.value[0]?.value || ''
    return
  }

  draft.tenantId = ''
}

function resetFeedback() {
  feedbackMessage.value = ''
  temporaryPassword.value = ''
}

function resetCreateDraft() {
  createDraft.coreUserId = ''
  createDraft.displayName = ''
  createDraft.email = ''
  createDraft.password = ''
  createDraft.role = genericRoleCatalog.value[0]?.id || 'store_terminal'
  createDraft.tenantId = usersStore.activeTenantId || tenantSelectOptions.value[0]?.value || ''
  createDraft.storeIds = []
  createDraft.active = true
  directorySearch.value = ''
  syncDraftScope(createDraft)
}

function resetEditDraft(user: FilaAtendimentoUserView | null = null) {
  editingUserId.value = user?.id || ''
  editDraft.coreUserId = user?.coreUserId || ''
  editDraft.displayName = user?.displayName || ''
  editDraft.email = user?.email || ''
  editDraft.password = ''
  editDraft.role = user?.role || genericRoleCatalog.value[0]?.id || 'manager'
  editDraft.tenantId = user?.tenantId || usersStore.activeTenantId || tenantSelectOptions.value[0]?.value || ''
  editDraft.storeIds = Array.isArray(user?.storeIds) ? [...user.storeIds] : []
  editDraft.active = Boolean(user?.active ?? true)
  syncDraftScope(editDraft)
}

function toggleStoreSelection(draft: UserDraft, storeId: string) {
  const normalizedStoreId = String(storeId || '').trim()
  if (!normalizedStoreId) {
    return
  }

  if (isStoreScoped(draft.role)) {
    draft.storeIds = draft.storeIds.includes(normalizedStoreId) ? [] : [normalizedStoreId]
    return
  }

  draft.storeIds = draft.storeIds.includes(normalizedStoreId)
    ? draft.storeIds.filter((item) => item !== normalizedStoreId)
    : [...draft.storeIds, normalizedStoreId]
}

function getScopedStoreOptions(tenantId: string) {
  const normalizedTenantId = String(tenantId || '').trim()
  return allStoreOptions.value.filter((store) => !normalizedTenantId || String(store.tenantId || '').trim() === normalizedTenantId)
}

function getStoreNames(storeIds: string[]) {
  const names = storeIds
    .map((storeId) => allStoreOptions.value.find((store) => store.id === storeId)?.name || '')
    .filter(Boolean)
  return names.length ? names.join(', ') : '-'
}

function getAccessLabel(user: FilaAtendimentoUserView) {
  if (isShellManaged(user)) {
    return 'Gerido pelo shell'
  }

  if (Boolean(user.onboarding?.mustChangePassword)) {
    return 'Troca de senha pendente'
  }

  const status = String(user.onboarding?.status || '').trim()
  if (status === 'shell_managed') return 'Gerido pelo shell'
  if (status === 'ready') return 'Pronto'
  if (status === 'pending') return 'Convite pendente'
  if (status === 'expired') return 'Convite expirado'
  if (status === 'inactive') return 'Conta inativa'
  return 'Sem convite'
}

function getAccessTone(user: FilaAtendimentoUserView) {
  if (isShellManaged(user)) return 'insight-tag insight-tag--success'
  if (Boolean(user.onboarding?.mustChangePassword)) return 'insight-tag insight-tag--warning'
  const status = String(user.onboarding?.status || '').trim()
  if (status === 'shell_managed') return 'insight-tag insight-tag--success'
  if (status === 'ready') return 'insight-tag insight-tag--success'
  if (status === 'pending') return 'insight-tag insight-tag--warning'
  return 'insight-tag'
}

async function submitCreate() {
  resetFeedback()

  if (!String(createDraft.coreUserId || '').trim()) {
    feedbackMessage.value = 'Selecione um usuario ja existente no shell administrativo.'
    return
  }

  const result = await usersStore.grantShellUser({
    ...createDraft,
    displayName: selectedCreateShellUser.value?.displayName,
    email: selectedCreateShellUser.value?.email
  })

  if (!result.ok) {
    feedbackMessage.value = result.message || 'Nao foi possivel liberar o acesso do modulo.'
    return
  }

  resetCreateDraft()
  feedbackMessage.value = 'Acesso do modulo liberado para o usuario selecionado.'
}

async function submitUpdate() {
  resetFeedback()

  const result = await usersStore.updateUser(editingUserId.value, editDraft)

  if (!result.ok) {
    feedbackMessage.value = result.message || 'Nao foi possivel atualizar usuario.'
    return
  }

  if (result.noChange) {
    feedbackMessage.value = 'Nenhuma alteracao para salvar.'
    return
  }

  editingUserId.value = ''
  feedbackMessage.value = 'Usuario atualizado.'
}

async function archiveUser(user: FilaAtendimentoUserView) {
  if (!import.meta.client || !window.confirm(`Deseja inativar ${user.displayName}?`)) {
    return
  }

  resetFeedback()
  const result = await usersStore.archiveUser(user.id)

  if (!result.ok) {
    feedbackMessage.value = result.message || 'Nao foi possivel inativar usuario.'
    return
  }

  if (editingUserId.value === user.id) {
    editingUserId.value = ''
  }

  feedbackMessage.value = 'Usuario inativado.'
}

async function resetPassword(user: FilaAtendimentoUserView) {
  if (isShellManaged(user)) {
    resetFeedback()
    feedbackMessage.value = 'A senha desse acesso e gerida no shell administrativo.'
    return
  }

  if (!import.meta.client) {
    return
  }

  const nextPassword = String(window.prompt(`Defina uma senha temporaria para ${user.displayName}.`, '') || '').trim()
  if (!nextPassword) {
    return
  }

  resetFeedback()

  if (nextPassword.length < 8) {
    feedbackMessage.value = 'Defina uma senha com pelo menos 8 caracteres.'
    return
  }

  const result = await usersStore.resetPassword(user.id, nextPassword)

  if (!result.ok) {
    feedbackMessage.value = result.message || 'Nao foi possivel redefinir a senha.'
    return
  }

  temporaryPassword.value = String(result.temporaryPassword || nextPassword).trim()
  feedbackMessage.value = 'Senha temporaria redefinida.'
}

watch(roleCatalog, () => {
  if (!createDraft.role && roleCatalog.value.length) {
    createDraft.role = genericRoleCatalog.value[0]?.id || roleCatalog.value[0]?.id || 'store_terminal'
  }

  if (!createDraft.tenantId) {
    createDraft.tenantId = usersStore.activeTenantId || tenantSelectOptions.value[0]?.value || ''
  }

  syncDraftScope(createDraft)
}, { immediate: true })

watch(() => createDraft.role, () => syncDraftScope(createDraft))
watch(() => editDraft.role, () => syncDraftScope(editDraft))

watch(
  () => [operationsStore.sessionReady, usersStore.activeTenantId, canEditUsers.value] as const,
  ([sessionReady, tenantId, canEdit], previousValue) => {
    const [previousSessionReady, previousTenantId, previousCanEdit] = previousValue ?? []

    if (!sessionReady || !tenantId || !canEdit) {
      return
    }

    if (!usersStore.ready || sessionReady !== previousSessionReady || tenantId !== previousTenantId || canEdit !== previousCanEdit) {
      void usersStore.ensureLoaded()
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="admin-panel" data-testid="users-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Usuarios e acessos</h2>
      <p class="admin-panel__text">O shell continua dono da identidade. Aqui ficam apenas os grants operacionais do modulo por papel e escopo.</p>
    </header>

    <article v-if="feedbackMessage || temporaryPassword" class="settings-card users-feedback-card">
      <p v-if="feedbackMessage" class="settings-card__text">{{ feedbackMessage }}</p>
      <div v-if="temporaryPassword" class="users-feedback-card__row">
        <input class="module-shell__input users-feedback-card__input" :value="temporaryPassword" readonly>
        <span class="settings-card__text">Senha temporaria atual</span>
      </div>
    </article>

    <article v-if="usersStore.errorMessage" class="settings-card"><p class="settings-card__text">{{ usersStore.errorMessage }}</p></article>
    <article v-else-if="usersStore.pending && !usersStore.ready" class="settings-card"><p class="settings-card__text">Carregando usuarios do modulo...</p></article>

    <article v-if="canEditUsers" class="settings-card" data-testid="users-card">
      <header class="settings-card__header">
        <h3 class="settings-card__title">Usuarios ativos</h3>
        <p class="settings-card__text">Consultores continuam nascendo pela aba Consultores. Para acessos administrativos do modulo, o shell cria o usuario e esta tela concede apenas papel e escopo local.</p>
      </header>

      <div class="table-wrap">
        <table class="module-table module-table--wide">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Papel</th>
              <th>Escopo</th>
              <th>Acesso</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!usersStore.users.length">
              <td colspan="7">Nenhum usuario ativo para este tenant.</td>
            </tr>
            <template v-for="user in usersStore.users" :key="user.id">
              <tr>
                <td>
                  <div class="space-y-1">
                    <p>{{ user.displayName }}</p>
                    <p v-if="isShellManaged(user)" class="settings-card__text">Shell #{{ user.coreUserId }}</p>
                  </div>
                </td>
                <td>{{ user.email }}</td>
                <td>{{ getRoleLabel(user.role) }}</td>
                <td>{{ isStoreScoped(user.role) ? getStoreNames(user.storeIds) : (user.tenantId || 'Plataforma') }}</td>
                <td>
                  <span :class="getAccessTone(user)">{{ getAccessLabel(user) }}</span>
                  <p v-if="isConsultantManaged(user)" class="settings-card__text">Gerenciado pela aba Consultores.</p>
                  <p v-else-if="isShellManaged(user)" class="settings-card__text">Identidade principal e senha ficam no shell administrativo.</p>
                </td>
                <td>
                  <span :class="user.active ? 'insight-tag insight-tag--success' : 'insight-tag'">{{ user.active ? 'Ativo' : 'Inativo' }}</span>
                </td>
                <td>
                  <div class="users-action-row">
                    <button
                      v-if="user.active && !isConsultantManaged(user) && !isShellManaged(user)"
                      class="multistore-button"
                      type="button"
                      :disabled="busy"
                      @click="resetPassword(user)"
                    >
                      Resetar senha
                    </button>
                    <button
                      v-if="!isConsultantManaged(user)"
                      class="multistore-button"
                      type="button"
                      :disabled="busy"
                      @click="resetEditDraft(user)"
                    >
                      Editar
                    </button>
                    <button
                      v-if="!isConsultantManaged(user)"
                      class="multistore-button multistore-button--danger"
                      type="button"
                      :disabled="busy"
                      @click="archiveUser(user)"
                    >
                      Inativar
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="editingUserId === user.id && !isConsultantManaged(user)">
                <td colspan="7">
                  <form class="multistore-form multistore-form--add" @submit.prevent="submitUpdate">
                    <div class="multistore-form__row">
                      <template v-if="isShellManaged(user)">
                        <label class="multistore-form__field">
                          <span class="multistore-form__label">Usuario do shell</span>
                          <input class="module-shell__input" :value="editDraft.displayName" type="text" readonly disabled>
                        </label>
                        <label class="multistore-form__field">
                          <span class="multistore-form__label">Email do shell</span>
                          <input class="module-shell__input" :value="editDraft.email" type="email" readonly disabled>
                        </label>
                      </template>
                      <template v-else>
                        <label class="multistore-form__field">
                          <span class="multistore-form__label">Nome completo</span>
                          <input v-model="editDraft.displayName" class="module-shell__input" type="text" :disabled="busy">
                        </label>
                        <label class="multistore-form__field">
                          <span class="multistore-form__label">Email</span>
                          <input v-model="editDraft.email" class="module-shell__input" type="email" :disabled="busy">
                        </label>
                      </template>
                      <label class="multistore-form__field">
                        <span class="multistore-form__label">Papel</span>
                        <select v-model="editDraft.role" class="module-shell__input" :disabled="busy">
                          <option v-for="option in genericRoleOptions" :key="`edit-${option.value}`" :value="option.value">{{ option.label }}</option>
                        </select>
                      </label>
                      <label v-if="isTenantScoped(editDraft.role) || isStoreScoped(editDraft.role)" class="multistore-form__field">
                        <span class="multistore-form__label">Tenant</span>
                        <select v-model="editDraft.tenantId" class="module-shell__input" :disabled="busy">
                          <option v-for="option in tenantSelectOptions" :key="`edit-tenant-${option.value}`" :value="option.value">{{ option.label }}</option>
                        </select>
                      </label>
                    </div>

                    <div v-if="isStoreScoped(editDraft.role)" class="users-scope-grid">
                      <label v-for="store in getScopedStoreOptions(editDraft.tenantId)" :key="`edit-store-${store.id}`" class="settings-toggle">
                        <input :checked="editDraft.storeIds.includes(store.id)" type="checkbox" @change="toggleStoreSelection(editDraft, store.id)">
                        <span>{{ store.name }}</span>
                      </label>
                    </div>

                    <p v-if="isStoreScoped(editDraft.role)" class="settings-card__text">Esse papel fica vinculado a uma unica loja.</p>

                    <div class="multistore-form__actions">
                      <label class="settings-toggle">
                        <input v-model="editDraft.active" type="checkbox" :disabled="busy">
                        <span>Conta ativa</span>
                      </label>
                      <button class="multistore-button multistore-button--primary" type="submit" :disabled="busy">Salvar usuario</button>
                      <button class="multistore-button multistore-button--danger" type="button" :disabled="busy" @click="editingUserId = ''">Cancelar</button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <form class="multistore-form multistore-form--add" data-testid="users-new-form" @submit.prevent="submitCreate">
        <div class="multistore-form__row">
          <label class="multistore-form__field">
            <span class="multistore-form__label">Buscar no shell</span>
            <input
              v-model="directorySearch"
              class="module-shell__input"
              type="text"
              placeholder="Filtre por nome, email ou cliente"
              :disabled="busy || usersStore.directoryPending"
            >
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Usuario do painel</span>
            <select v-model="createDraft.coreUserId" class="module-shell__input" :disabled="busy || usersStore.directoryPending">
              <option value="">Selecione um usuario com acesso ao modulo</option>
              <option v-for="user in filteredAssignableShellUsers" :key="`grant-${user.coreUserId}`" :value="user.coreUserId">
                {{ user.displayName }} | {{ user.email }} | {{ user.clientName || 'Sem cliente' }}
              </option>
            </select>
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Nome</span>
            <input class="module-shell__input" :value="selectedCreateShellUser?.displayName || ''" type="text" readonly disabled>
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Email</span>
            <input class="module-shell__input" :value="selectedCreateShellUser?.email || ''" type="email" readonly disabled>
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Papel</span>
            <select v-model="createDraft.role" class="module-shell__input" :disabled="busy">
              <option v-for="option in genericRoleOptions" :key="`create-${option.value}`" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="isTenantScoped(createDraft.role) || isStoreScoped(createDraft.role)" class="multistore-form__field">
            <span class="multistore-form__label">Tenant</span>
            <select v-model="createDraft.tenantId" class="module-shell__input" :disabled="busy">
              <option v-for="option in tenantSelectOptions" :key="`create-tenant-${option.value}`" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>

        <div v-if="isStoreScoped(createDraft.role)" class="users-scope-grid">
          <label v-for="store in getScopedStoreOptions(createDraft.tenantId)" :key="`create-store-${store.id}`" class="settings-toggle">
            <input :checked="createDraft.storeIds.includes(store.id)" type="checkbox" @change="toggleStoreSelection(createDraft, store.id)">
            <span>{{ store.name }}</span>
          </label>
        </div>

        <p v-if="isStoreScoped(createDraft.role)" class="settings-card__text">Esse papel fica vinculado a uma unica loja.</p>

        <div class="multistore-form__actions">
          <label class="settings-toggle">
            <input v-model="createDraft.active" type="checkbox" :disabled="busy">
            <span>Liberar acesso ativo</span>
          </label>
          <button class="multistore-button multistore-button--primary" type="submit" :disabled="busy || !createDraft.coreUserId.trim()">
            Liberar acesso
          </button>
        </div>

        <p class="settings-card__text">{{ shellDirectorySummary }}</p>
        <p v-if="normalizedDirectorySearch && !filteredAssignableShellUsers.length" class="settings-card__text">Nenhum usuario do shell corresponde ao filtro atual.</p>
        <p class="settings-card__text">Se o usuario ainda nao aparece aqui, primeiro libere o modulo Atendimento na <NuxtLink to="/admin/manage/users">gestao global de usuarios</NuxtLink>.</p>
        <p class="settings-card__text">Consultores continuam sendo criados na gestao de consultores para nascerem com roster e vinculo operacional.</p>
      </form>
    </article>
  </section>
</template>