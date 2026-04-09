import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoRoleCatalogResponse,
  FilaAtendimentoRoleDefinition,
  FilaAtendimentoUserMutationResult,
  FilaAtendimentoUsersResponse,
  FilaAtendimentoUserView
} from '~/types/fila-atendimento'
import type { UserItem, UsersListResponse } from '~/types/users'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { canManageUsers, normalizeAppRole } from '~/utils/fila-atendimento/permissions'

interface FilaAtendimentoShellDirectoryUser {
  coreUserId: string
  displayName: string
  email: string
  clientId: number
  clientName: string
  atendimentoAccess: boolean
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (value === undefined || value === null) {
    return fallback
  }

  return Boolean(value)
}

function normalizeInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function normalizeStringArray(items: unknown) {
  const seen = new Set<string>()
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeText(item))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false
      }

      seen.add(item)
      return true
    })
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const serverMessage = normalizeText((error as { statusMessage?: unknown }).statusMessage)
    if (serverMessage) {
      return serverMessage
    }

    const errorData = (error as { data?: Record<string, unknown> }).data
    const dataMessage = normalizeText(errorData?.message)
    if (dataMessage) {
      return dataMessage
    }

    const rawMessage = normalizeText((error as { message?: unknown }).message)
    if (rawMessage) {
      return rawMessage
    }
  }

  return fallback
}

function isStoreScopedRole(role: unknown) {
  const normalized = normalizeText(role)
  return normalized === 'consultant' || normalized === 'manager' || normalized === 'store_terminal'
}

function isConsultantManagedUser(user: FilaAtendimentoUserView | null | undefined) {
  return normalizeText(user?.managedBy) === 'consultants' || normalizeText(user?.role) === 'consultant'
}

function normalizeRoleDefinition(input: unknown): FilaAtendimentoRoleDefinition {
  const role = input as Record<string, unknown>
  return {
    id: normalizeText(role?.id),
    label: normalizeText(role?.label),
    description: normalizeText(role?.description),
    scope: normalizeText(role?.scope),
    grants: normalizeStringArray(role?.grants)
  }
}

function normalizeRoleCatalog(response: FilaAtendimentoRoleCatalogResponse | null | undefined) {
  return (Array.isArray(response?.roles) ? response.roles : [])
    .map((role) => normalizeRoleDefinition(role))
    .filter((role) => Boolean(role.id))
}

function normalizeUser(input: unknown): FilaAtendimentoUserView {
  const user = input as Record<string, unknown>
  const onboarding = (user?.onboarding ?? {}) as Record<string, unknown>
  return {
    id: normalizeText(user?.id),
    coreUserId: normalizeText(user?.coreUserId),
    identityProvider: normalizeText(user?.identityProvider),
    displayName: normalizeText(user?.displayName),
    email: normalizeEmail(user?.email),
    role: normalizeText(user?.role),
    tenantId: normalizeText(user?.tenantId),
    storeIds: normalizeStringArray(user?.storeIds),
    active: normalizeBoolean(user?.active, false),
    managedBy: normalizeText(user?.managedBy),
    managedResourceId: normalizeText(user?.managedResourceId),
    onboarding: {
      status: normalizeText(onboarding?.status),
      hasPassword: normalizeBoolean(onboarding?.hasPassword, false),
      mustChangePassword: normalizeBoolean(onboarding?.mustChangePassword, false),
      invitationExpiresAt: normalizeText(onboarding?.invitationExpiresAt)
    },
    createdAt: normalizeText(user?.createdAt),
    updatedAt: normalizeText(user?.updatedAt)
  }
}

function normalizeUsers(response: FilaAtendimentoUsersResponse | null | undefined) {
  const seen = new Set<string>()
  return (Array.isArray(response?.users) ? response.users : [])
    .map((user) => normalizeUser(user))
    .filter((user) => {
      if (!user.id || seen.has(user.id)) {
        return false
      }

      seen.add(user.id)
      return true
    })
}

function normalizeDirectoryUser(input: UserItem): FilaAtendimentoShellDirectoryUser {
  return {
    coreUserId: normalizeText(input?.id),
    displayName: normalizeText(input?.name || input?.nick || input?.email),
    email: normalizeEmail(input?.email),
    clientId: normalizeInteger(input?.clientId),
    clientName: normalizeText(input?.clientName),
    atendimentoAccess: Boolean(input?.atendimentoAccess)
  }
}

function isShellManagedUser(user: FilaAtendimentoUserView | null | undefined) {
  return normalizeText(user?.identityProvider) === 'painel-web-shell' && normalizeText(user?.coreUserId) !== ''
}

function buildListQuery(tenantId: string) {
  const params = new URLSearchParams()
  if (tenantId) {
    params.set('tenantId', tenantId)
  }
  params.set('active', 'true')
  return params.toString()
}

function buildCreatePayload(payload: Record<string, unknown>, activeTenantId: string, roleCatalog: FilaAtendimentoRoleDefinition[]) {
  const role = normalizeText(payload.role || 'store_terminal')
  const scope = normalizeText(roleCatalog.find((item) => item.id === role)?.scope)
  const tenantId = scope === 'platform' ? '' : normalizeText(payload.tenantId || activeTenantId)
  const storeIds = isStoreScopedRole(role) ? normalizeStringArray(payload.storeIds).slice(0, 1) : []

  return {
    displayName: normalizeText(payload.displayName),
    email: normalizeEmail(payload.email),
    password: normalizeText(payload.password),
    role,
    tenantId,
    storeIds,
    active: normalizeBoolean(payload.active, true)
  }
}

function buildUpdatePayload(payload: Record<string, unknown>, currentUser: FilaAtendimentoUserView, roleCatalog: FilaAtendimentoRoleDefinition[], activeTenantId: string) {
  const nextRole = normalizeText(payload.role || currentUser.role)
  const scope = normalizeText(roleCatalog.find((item) => item.id === nextRole)?.scope)
  const nextDisplayName = normalizeText(payload.displayName ?? currentUser.displayName)
  const nextEmail = normalizeEmail(payload.email ?? currentUser.email)
  const nextPassword = normalizeText(payload.password)
  const nextTenantId = scope === 'platform'
    ? ''
    : normalizeText(payload.tenantId ?? currentUser.tenantId ?? activeTenantId)
  const nextStoreIds = isStoreScopedRole(nextRole)
    ? normalizeStringArray(payload.storeIds ?? currentUser.storeIds).slice(0, 1)
    : []
  const nextActive = normalizeBoolean(payload.active, currentUser.active)

  const body: Record<string, unknown> = {}

  if (nextDisplayName !== normalizeText(currentUser.displayName)) {
    body.displayName = nextDisplayName
  }

  if (nextEmail !== normalizeEmail(currentUser.email)) {
    body.email = nextEmail
  }

  if (nextRole !== normalizeText(currentUser.role)) {
    body.role = nextRole
  }

  if (nextTenantId !== normalizeText(currentUser.tenantId)) {
    body.tenantId = nextTenantId
  }

  if (JSON.stringify(nextStoreIds) !== JSON.stringify(normalizeStringArray(currentUser.storeIds))) {
    body.storeIds = nextStoreIds
  }

  if (nextActive !== Boolean(currentUser.active)) {
    body.active = nextActive
  }

  if (nextPassword) {
    body.password = nextPassword
  }

  return body
}

function buildShellGrantPayload(
  payload: Record<string, unknown>,
  currentUser: FilaAtendimentoUserView | null,
  roleCatalog: FilaAtendimentoRoleDefinition[],
  activeTenantId: string,
  directoryUser: FilaAtendimentoShellDirectoryUser | null
) {
  const role = normalizeText(payload.role || currentUser?.role || 'store_terminal')
  const scope = normalizeText(roleCatalog.find((item) => item.id === role)?.scope)
  const tenantId = scope === 'platform'
    ? ''
    : normalizeText(payload.tenantId ?? currentUser?.tenantId ?? activeTenantId)
  const storeIds = isStoreScopedRole(role)
    ? normalizeStringArray(payload.storeIds ?? currentUser?.storeIds).slice(0, 1)
    : []

  return {
    coreUserId: normalizeText(payload.coreUserId ?? currentUser?.coreUserId ?? directoryUser?.coreUserId),
    displayName: normalizeText(payload.displayName ?? directoryUser?.displayName ?? currentUser?.displayName),
    email: normalizeEmail(payload.email ?? directoryUser?.email ?? currentUser?.email),
    role,
    tenantId,
    storeIds,
    active: normalizeBoolean(payload.active, currentUser?.active ?? true)
  }
}

export const useFilaAtendimentoUsersStore = defineStore('fila-atendimento-users', () => {
  const { bffFetch } = useBffFetch()
  const operationsStore = useFilaAtendimentoOperationsStore()
  const sessionSimulation = useSessionSimulationStore()

  const users = ref<FilaAtendimentoUserView[]>([])
  const roleCatalog = ref<FilaAtendimentoRoleDefinition[]>([])
  const directoryUsers = ref<FilaAtendimentoShellDirectoryUser[]>([])
  const pending = ref(false)
  const directoryPending = ref(false)
  const ready = ref(false)
  const directoryReady = ref(false)
  const errorMessage = ref('')

  const activeTenantId = computed(() =>
    normalizeText(
      operationsStore.moduleContext?.context?.activeTenantId
      || operationsStore.moduleContext?.principal?.tenantId
      || operationsStore.moduleContext?.context?.tenants?.[0]?.id
      || ''
    )
  )
  const manageable = computed(() => canManageUsers(operationsStore.role))
  const assignableRoles = computed(() => {
    const currentRole = normalizeAppRole(operationsStore.role)
    return roleCatalog.value.filter((role) => currentRole === 'platform_admin' || role.id !== 'platform_admin')
  })

  function clearState() {
    users.value = []
    ready.value = false
    errorMessage.value = ''
  }

  function clearDirectoryState() {
    directoryUsers.value = []
    directoryReady.value = false
  }

  function findDirectoryUser(coreUserId: string) {
    return directoryUsers.value.find((user) => user.coreUserId === normalizeText(coreUserId)) || null
  }

  async function ensureRoleCatalog() {
    if (roleCatalog.value.length) {
      return roleCatalog.value
    }

    const response = await bffFetch<FilaAtendimentoRoleCatalogResponse>('/api/admin/modules/fila-atendimento/auth-roles')
    roleCatalog.value = normalizeRoleCatalog(response)
    return roleCatalog.value
  }

  async function loadDirectoryUsers(force = false) {
    await ensureRoleCatalog()

    if (!operationsStore.sessionReady || !manageable.value) {
      clearDirectoryState()
      return []
    }

    if (directoryReady.value && !force) {
      return directoryUsers.value
    }

    directoryPending.value = true

    try {
      sessionSimulation.initialize()
      const scopedClientId = normalizeInteger(sessionSimulation.effectiveClientId || sessionSimulation.clientId)
      const response = await bffFetch<UsersListResponse>('/api/admin/users', {
        query: {
          page: 1,
          limit: 200,
          clientId: scopedClientId > 0 ? scopedClientId : undefined
        }
      })

      directoryUsers.value = (Array.isArray(response.data) ? response.data : [])
        .map((user) => normalizeDirectoryUser(user))
        .filter((user) => user.atendimentoAccess && user.coreUserId && user.email)
        .sort((left, right) => `${left.displayName}|${left.email}`.localeCompare(`${right.displayName}|${right.email}`, 'pt-BR'))
      directoryReady.value = true
      return directoryUsers.value
    } catch {
      clearDirectoryState()
      return []
    } finally {
      directoryPending.value = false
    }
  }

  async function refreshUsers() {
    await ensureRoleCatalog()

    if (!operationsStore.sessionReady || !manageable.value) {
      clearState()
      return []
    }

    pending.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<FilaAtendimentoUsersResponse>(
        `/api/admin/modules/fila-atendimento/users?${buildListQuery(activeTenantId.value)}`
      )
      users.value = normalizeUsers(response)
      ready.value = true
      return users.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os usuarios.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function ensureLoaded() {
    await ensureRoleCatalog()

    if (!operationsStore.sessionReady || !manageable.value) {
      clearState()
      clearDirectoryState()
      return false
    }

    void loadDirectoryUsers()

    if (ready.value) {
      return true
    }

    try {
      await refreshUsers()
      return true
    } catch {
      return false
    }
  }

  async function grantShellUser(payload: Record<string, unknown>) {
    await ensureRoleCatalog()
    await loadDirectoryUsers()

    if (!operationsStore.sessionReady || !manageable.value) {
      return { ok: false, message: 'Sem permissao para gerenciar usuarios.' } as FilaAtendimentoUserMutationResult
    }

    const requestBody = buildShellGrantPayload(payload, null, roleCatalog.value, activeTenantId.value, findDirectoryUser(normalizeText(payload.coreUserId)))
    if (!requestBody.coreUserId || !requestBody.displayName || !requestBody.email) {
      return { ok: false, message: 'Selecione um usuario ja existente no shell administrativo.' } as FilaAtendimentoUserMutationResult
    }
    if (requestBody.role === 'consultant') {
      return { ok: false, message: 'Consultores devem ser criados na gestao de consultores.' } as FilaAtendimentoUserMutationResult
    }

    try {
      const response = await bffFetch<{ user?: unknown }>(
        `/api/admin/modules/fila-atendimento/user-grants/core/${encodeURIComponent(requestBody.coreUserId)}`,
        {
          method: 'PUT',
          body: requestBody
        }
      )

      await refreshUsers()
      return {
        ok: true,
        user: normalizeUser(response?.user)
      } as FilaAtendimentoUserMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel liberar o acesso do modulo.')
      } as FilaAtendimentoUserMutationResult
    }
  }

  async function createUser(payload: Record<string, unknown>) {
    return grantShellUser(payload)
  }

  async function updateUser(userId: string, payload: Record<string, unknown>) {
    await ensureRoleCatalog()

    if (!operationsStore.sessionReady || !manageable.value) {
      return { ok: false, message: 'Sem permissao para gerenciar usuarios.' } as FilaAtendimentoUserMutationResult
    }

    const currentUser = users.value.find((user) => user.id === normalizeText(userId))
    if (!currentUser) {
      return { ok: false, message: 'Usuario nao encontrado.' } as FilaAtendimentoUserMutationResult
    }

    if (isShellManagedUser(currentUser)) {
      await loadDirectoryUsers()

      if (normalizeText(payload.password)) {
        return { ok: false, message: 'A senha desse acesso e gerida no shell administrativo.' } as FilaAtendimentoUserMutationResult
      }

      const requestBody = buildShellGrantPayload(
        payload,
        currentUser,
        roleCatalog.value,
        activeTenantId.value,
        findDirectoryUser(currentUser.coreUserId)
      )
      const sameRole = requestBody.role === normalizeText(currentUser.role)
      const sameTenant = requestBody.tenantId === normalizeText(currentUser.tenantId)
      const sameStoreIds = JSON.stringify(requestBody.storeIds) === JSON.stringify(normalizeStringArray(currentUser.storeIds))
      const sameActive = requestBody.active === Boolean(currentUser.active)

      if (sameRole && sameTenant && sameStoreIds && sameActive) {
        return { ok: true, noChange: true } as FilaAtendimentoUserMutationResult
      }

      try {
        const response = await bffFetch<{ user?: unknown }>(
          `/api/admin/modules/fila-atendimento/user-grants/core/${encodeURIComponent(requestBody.coreUserId)}`,
          {
            method: 'PUT',
            body: requestBody
          }
        )

        await refreshUsers()
        return {
          ok: true,
          user: normalizeUser(response?.user)
        } as FilaAtendimentoUserMutationResult
      } catch (error) {
        return {
          ok: false,
          message: normalizeErrorMessage(error, 'Nao foi possivel atualizar os grants do modulo.')
        } as FilaAtendimentoUserMutationResult
      }
    }

    if (isConsultantManagedUser(currentUser)) {
      return { ok: false, message: 'Esse acesso de consultor deve ser gerenciado na aba Consultores.' } as FilaAtendimentoUserMutationResult
    }

    const body = buildUpdatePayload(payload, currentUser, roleCatalog.value, activeTenantId.value)
    if (!Object.keys(body).length) {
      return { ok: true, noChange: true } as FilaAtendimentoUserMutationResult
    }

    try {
      const response = await bffFetch<{ user?: unknown }>(
        `/api/admin/modules/fila-atendimento/users/${encodeURIComponent(normalizeText(userId))}`,
        {
          method: 'PATCH',
          body
        }
      )

      await refreshUsers()
      return {
        ok: true,
        user: normalizeUser(response?.user)
      } as FilaAtendimentoUserMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel atualizar usuario.')
      } as FilaAtendimentoUserMutationResult
    }
  }

  async function archiveUser(userId: string) {
    if (!operationsStore.sessionReady || !manageable.value) {
      return { ok: false, message: 'Sem permissao para gerenciar usuarios.' } as FilaAtendimentoUserMutationResult
    }

    const currentUser = users.value.find((user) => user.id === normalizeText(userId))
    if (isShellManagedUser(currentUser)) {
      try {
        const response = await bffFetch<{ user?: unknown }>(
          `/api/admin/modules/fila-atendimento/user-grants/core/${encodeURIComponent(normalizeText(currentUser?.coreUserId))}/archive`,
          { method: 'POST' }
        )

        await refreshUsers()
        return {
          ok: true,
          user: normalizeUser(response?.user)
        } as FilaAtendimentoUserMutationResult
      } catch (error) {
        return {
          ok: false,
          message: normalizeErrorMessage(error, 'Nao foi possivel inativar o acesso do modulo.')
        } as FilaAtendimentoUserMutationResult
      }
    }

    if (isConsultantManagedUser(currentUser)) {
      return { ok: false, message: 'Esse acesso de consultor deve ser gerenciado na aba Consultores.' } as FilaAtendimentoUserMutationResult
    }

    try {
      const response = await bffFetch<{ user?: unknown }>(
        `/api/admin/modules/fila-atendimento/users/${encodeURIComponent(normalizeText(userId))}/archive`,
        { method: 'POST' }
      )

      await refreshUsers()
      return {
        ok: true,
        user: normalizeUser(response?.user)
      } as FilaAtendimentoUserMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel inativar usuario.')
      } as FilaAtendimentoUserMutationResult
    }
  }

  async function resetPassword(userId: string, password: string) {
    if (!operationsStore.sessionReady || !manageable.value) {
      return { ok: false, message: 'Sem permissao para gerenciar usuarios.' } as FilaAtendimentoUserMutationResult
    }

    const currentUser = users.value.find((user) => user.id === normalizeText(userId))
    if (isShellManagedUser(currentUser)) {
      return { ok: false, message: 'A senha desse acesso e gerida no shell administrativo.' } as FilaAtendimentoUserMutationResult
    }

    try {
      const response = await bffFetch<{ user?: unknown, temporaryPassword?: unknown }>(
        `/api/admin/modules/fila-atendimento/users/${encodeURIComponent(normalizeText(userId))}/reset-password`,
        {
          method: 'POST',
          body: {
            password: normalizeText(password)
          }
        }
      )

      await refreshUsers()
      return {
        ok: true,
        user: normalizeUser(response?.user),
        temporaryPassword: normalizeText(response?.temporaryPassword)
      } as FilaAtendimentoUserMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel redefinir a senha.')
      } as FilaAtendimentoUserMutationResult
    }
  }

  if (import.meta.client) {
    watch(
      () => [operationsStore.sessionReady, activeTenantId.value, operationsStore.role] as const,
      ([sessionReady, tenantId, role], previousValue) => {
        const [previousSessionReady, previousTenantId, previousRole] = previousValue ?? []

        if (!sessionReady || !canManageUsers(role)) {
          clearState()
          clearDirectoryState()
          return
        }

        if (!previousSessionReady || previousTenantId !== tenantId || previousRole !== role) {
          clearState()
          clearDirectoryState()
        }
      }
    )

    watch(
      () => sessionSimulation.requestContextHash,
      () => {
        clearDirectoryState()
      }
    )
  }

  return {
    users,
    roleCatalog,
    directoryUsers,
    assignableRoles,
    pending,
    directoryPending,
    ready,
    errorMessage,
    manageable,
    activeTenantId,
    ensureRoleCatalog,
    ensureLoaded,
    loadDirectoryUsers,
    refreshUsers,
    grantShellUser,
    createUser,
    updateUser,
    archiveUser,
    resetPassword,
    clearState
  }
})