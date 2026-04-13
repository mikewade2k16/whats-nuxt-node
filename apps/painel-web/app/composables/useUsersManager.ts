import type { UserFieldKey, UserItem, UserMutationResponse, UsersListResponse, SimpleSelectOption } from '~/types/users'

interface UpdateFieldOptions {
  immediate?: boolean
}

interface UserCreatePayload {
  name: string
  nick: string
  email: string
  password: string
  phone: string
  clientId: number | null
  level: string
  userType: string
  businessRole: string
  storeId: string | null
  registrationNumber: string
  isPlatformAdmin: boolean
}

const UPDATE_DELAY_MS = 360
const DEFAULT_USERS_FETCH_LIMIT = 120
const DEFAULT_CLIENTS_FETCH_LIMIT = 120

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeEmail(value: unknown) {
  return normalizeText(value, 255).toLowerCase()
}

function normalizeClientId(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function normalizeOptionClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function normalizeLevel(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'consultant' || normalized === 'manager' || normalized === 'marketing' || normalized === 'finance' || normalized === 'viewer') {
    return normalized
  }

  return 'marketing'
}

function normalizeUserType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'admin' ? 'admin' : 'client'
}

function normalizeStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'active' ? 'active' : 'inactive'
}

function normalizeBusinessRole(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'consultant':
    case 'store_manager':
    case 'marketing':
    case 'finance':
    case 'general_manager':
    case 'owner':
    case 'viewer':
    case 'system_admin':
      return normalized
    default:
      return 'marketing'
  }
}

function isStoreScopedBusinessRole(value: unknown) {
  const normalized = normalizeBusinessRole(value)
  return normalized === 'consultant' || normalized === 'store_manager'
}

function normalizeStoreId(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '0' || normalized.toLowerCase() === 'all' || normalized.toLowerCase() === 'todas') {
    return null
  }

  return normalized.slice(0, 80)
}

function normalizeRegistrationNumber(value: unknown) {
  return normalizeText(value, 60)
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const output: string[] = []

  for (const entry of source) {
    const normalized = String(entry ?? '').trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

function normalizeClientStores(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((store) => {
      const id = normalizeStoreId((store as { id?: unknown })?.id)
      if (!id) {
        return null
      }

      return {
        id,
        name: normalizeText((store as { name?: unknown })?.name, 120)
      }
    })
    .filter((store): store is NonNullable<typeof store> => Boolean(store))
}

function normalizeBooleanLike(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return fallback
  }

  return ['1', 'true', 'on', 'enabled', 'active', 'sim'].includes(normalized)
}

function normalizeClientOption(option: SimpleSelectOption): SimpleSelectOption {
  return {
    ...option,
    label: normalizeText(option.label, 120),
    value: typeof option.value === 'number' ? option.value : String(option.value ?? '').trim(),
    moduleCodes: normalizeModuleCodes(option.moduleCodes),
    stores: normalizeClientStores(option.stores),
    requireUserStoreLink: normalizeBooleanLike(option.requireUserStoreLink, true),
    requireUserRegistration: normalizeBooleanLike(option.requireUserRegistration, true),
    storesCount: Math.max(0, Number(option.storesCount ?? (Array.isArray(option.stores) ? option.stores.length : 0)) || 0)
  }
}

function normalizeUserRecord(item: UserItem): UserItem {
  const normalizedClientId = normalizeClientId(item.clientId)
  const normalizedLevel = normalizeLevel(item.level) as UserItem['level']
  const normalizedType = normalizeUserType(item.userType) as UserItem['userType']
  const normalizedBusinessRole = (item.isPlatformAdmin ? 'system_admin' : normalizeBusinessRole(item.businessRole)) as UserItem['businessRole']
  const moduleCodes = normalizeModuleCodes(item.moduleCodes)
  const normalizedStoreId = normalizeStoreId(item.storeId)

  return {
    ...item,
    level: normalizedLevel,
    userType: normalizedType,
    businessRole: normalizedBusinessRole,
    clientId: normalizedClientId,
    storeId: normalizedStoreId,
    storeName: normalizeText(item.storeName ?? '', 120),
    registrationNumber: normalizeRegistrationNumber(item.registrationNumber),
    clientName: String(item.clientName ?? '').trim() || (item.isPlatformAdmin ? 'Root' : ''),
    moduleCodes,
    atendimentoAccess: Boolean(item.atendimentoAccess) || moduleCodes.includes('atendimento')
  }
}

export function useUsersManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const { coreToken, coreUser, sessionExpiresAt, setSession, hydrate } = useAdminSession()
  const realtime = useTenantRealtime()
  realtime.start()

  const users = ref<UserItem[]>([])
  const clientOptions = ref<SimpleSelectOption[]>([])

  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  const pendingFieldTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const isCrossClientViewer = computed(() => Boolean(coreUser.value?.isPlatformAdmin) && sessionSimulation.effectiveUserType === 'admin')

  function keyFor(id: number, field: UserFieldKey | 'delete' | 'create' | 'approve') {
    return `${id}:${field}`
  }

  function setSaving(key: string, value: boolean) {
    const next = { ...savingMap.value }
    if (value) {
      next[key] = true
    } else {
      delete next[key]
    }

    savingMap.value = next
  }

  function replaceUserRow(payload: UserItem) {
    const normalizedPayload = normalizeUserRecord(payload)
    const index = users.value.findIndex(user => user.id === payload.id)
    if (index < 0) {
      users.value.unshift(normalizedPayload)
      syncSessionFromUserRecord(normalizedPayload)
      return
    }

    users.value[index] = normalizedPayload
    syncSessionFromUserRecord(normalizedPayload)
  }

  function patchUserLocally(id: number, patch: Partial<UserItem>) {
    const target = users.value.find(user => user.id === id)
    if (!target) return

    const normalized = normalizeUserRecord({
      ...target,
      ...patch
    })
    Object.assign(target, normalized)
    syncSessionFromUserRecord(target)
  }

  function isCurrentSessionUser(record: UserItem) {
    const recordEmail = normalizeEmail(record.email)
    const currentEmail = normalizeEmail(coreUser.value?.email ?? '')

    const recordCoreUserID = String((record as unknown as { coreUserId?: unknown }).coreUserId ?? '').trim()
    const currentCoreUserID = String(coreUser.value?.id ?? '').trim()
    if (recordCoreUserID && currentCoreUserID && recordCoreUserID === currentCoreUserID) {
      return true
    }

    return Boolean(recordEmail) && Boolean(currentEmail) && recordEmail === currentEmail
  }

  function syncSessionFromUserRecord(record: UserItem) {
  if (!isCurrentSessionUser(record) || !coreUser.value || !coreToken.value) {
      return
    }

  setSession({
    token: coreToken.value,
    coreAccessToken: coreToken.value,
    coreUser: {
      ...coreUser.value,
      name: String(record.name || '').trim() || coreUser.value.name,
      email: String(record.email || '').trim() || coreUser.value.email,
      nick: String(record.nick || '').trim(),
      profileImage: String(record.profileImage || '').trim()
    },
    expiresAt: sessionExpiresAt.value
  })
  }

  function extractStatusCode(error: unknown) {
    if (typeof error !== 'object' || error === null) return 0
    const statusCode = Number((error as { statusCode?: unknown }).statusCode)
    if (Number.isFinite(statusCode) && statusCode > 0) return statusCode
    const status = Number((error as { status?: unknown }).status)
    if (Number.isFinite(status) && status > 0) return status
    return 0
  }

  async function ensureSessionScopeReady() {
    hydrate()
    sessionSimulation.initialize()

    if (!coreToken.value) {
      return
    }

    if (!sessionSimulation.modulesHydrated || !sessionSimulation.lastClientOptionsSyncAt) {
      await sessionSimulation.refreshClientOptions()
    }
  }

  async function fetchUsers() {
    loading.value = true
    errorMessage.value = ''

    try {
      await ensureSessionScopeReady()

      const response = await bffFetch<UsersListResponse>('/api/admin/users', {
        query: {
          page: 1,
          limit: DEFAULT_USERS_FETCH_LIMIT
        }
      })

      users.value = Array.isArray(response.data)
        ? response.data.map(item => normalizeUserRecord(item))
        : []
      const currentMatch = users.value.find(item => isCurrentSessionUser(item))
      if (currentMatch) {
        syncSessionFromUserRecord(currentMatch)
      }
    } catch (error) {
      const statusCode = extractStatusCode(error)
      if (statusCode === 401 || statusCode === 403) {
        errorMessage.value = 'Voce nao tem permissao para acessar usuarios nesta sessao.'
      } else {
        errorMessage.value = 'Falha ao carregar usuarios.'
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchClientOptions() {
    await ensureSessionScopeReady()

    if (!isCrossClientViewer.value) {
      const currentClientId = normalizeOptionClientId(sessionSimulation.effectiveClientId)
      const currentClientLabel = String(sessionSimulation.activeClientLabel ?? '').trim()

      if (currentClientId <= 0) {
        clientOptions.value = []
        return
      }

      try {
        const clientDetail = await bffFetch<{
          id: number
          name: string
          moduleCodes?: string[]
          modules?: Array<{ code?: string }>
          stores?: Array<{ id?: string, name?: string }>
          storesCount?: number
          requireUserStoreLink?: boolean
          requireUserRegistration?: boolean
        }>(`/api/core-bff/core/admin/clients/${currentClientId}`)

        clientOptions.value = [normalizeClientOption({
          label: String(clientDetail?.name ?? '').trim() || currentClientLabel || `Cliente #${currentClientId}`,
          value: currentClientId,
          moduleCodes: normalizeModuleCodes(
            Array.isArray(clientDetail?.moduleCodes) && clientDetail.moduleCodes.length > 0
              ? clientDetail.moduleCodes
              : (clientDetail?.modules || []).map(module => module.code)
          ),
          stores: normalizeClientStores(clientDetail?.stores),
          storesCount: Number(clientDetail?.storesCount || 0),
          requireUserStoreLink: Boolean(clientDetail?.requireUserStoreLink ?? true),
          requireUserRegistration: Boolean(clientDetail?.requireUserRegistration ?? true)
        })]
      } catch {
        clientOptions.value = [normalizeClientOption({
          label: currentClientLabel || `Cliente #${currentClientId}`,
          value: currentClientId,
          moduleCodes: [...sessionSimulation.activeClientModuleCodes],
          stores: [],
          storesCount: 0,
          requireUserStoreLink: true,
          requireUserRegistration: true
        })]
      }

      return
    }

    try {
      const response = await bffFetch<{
        status: string,
        data: Array<{
          id: number,
          name: string,
          moduleCodes?: string[],
          modules?: Array<{ code?: string }>,
          stores?: Array<{ id?: string, name?: string }>,
          storesCount?: number,
          requireUserStoreLink?: boolean,
          requireUserRegistration?: boolean
        }>
      }>('/api/admin/clients', {
        query: {
          page: 1,
          limit: DEFAULT_CLIENTS_FETCH_LIMIT,
          status: 'active'
        }
      })

      const options = (response.data || [])
        .map(item => normalizeClientOption({
          label: item.name,
          value: item.id,
          moduleCodes: normalizeModuleCodes(
            Array.isArray(item.moduleCodes) && item.moduleCodes.length > 0
              ? item.moduleCodes
              : (item.modules || []).map(module => module.code)
          ),
          stores: normalizeClientStores(item.stores),
          storesCount: Number(item.storesCount || 0),
          requireUserStoreLink: Boolean(item.requireUserStoreLink ?? true),
          requireUserRegistration: Boolean(item.requireUserRegistration ?? true)
        }))

      clientOptions.value = options
    } catch {
      clientOptions.value = []
    }
  }

  async function fetchAll() {
    await Promise.all([fetchUsers(), fetchClientOptions()])
  }

  async function persistField(id: number, field: UserFieldKey, value: unknown) {
    const savingKey = keyFor(id, field)
    setSaving(savingKey, true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<UserMutationResponse>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: {
          field,
          value
        }
      })

      replaceUserRow(response.data)
    } catch {
      errorMessage.value = 'Falha ao salvar alteracao do usuario.'
      await fetchUsers()
    } finally {
      setSaving(savingKey, false)
    }
  }

  function queueFieldPersist(id: number, field: UserFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
    const timerKey = keyFor(id, field)
    const existingTimer = pendingFieldTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
      pendingFieldTimers.delete(timerKey)
    }

    const run = () => {
      pendingFieldTimers.delete(timerKey)
      void persistField(id, field, value)
    }

    if (options.immediate) {
      run()
      return
    }

    const timer = setTimeout(run, UPDATE_DELAY_MS)
    pendingFieldTimers.set(timerKey, timer)
  }

  function updateField(id: number, field: UserFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
    if (field === 'level') {
      patchUserLocally(id, { level: normalizeLevel(value) as UserItem['level'] })
    }

    if (field === 'clientId') {
      const nextClientId = normalizeClientId(value)
      const target = users.value.find(user => user.id === id)
      const nextClientOption = clientOptions.value.find(
        option => normalizeOptionClientId(option.value) === (nextClientId ?? 0)
      )
      const nextClientName = nextClientOption?.label ?? ''
      const currentStoreId = normalizeStoreId(target?.storeId)
      const matchedStore = (nextClientOption?.stores || []).find(store => store.id === currentStoreId)

      patchUserLocally(id, {
        clientId: nextClientId,
        clientName: nextClientId ? nextClientName : '',
        storeId: matchedStore?.id ?? null,
        storeName: matchedStore?.name ?? ''
      })
    }

    if (field === 'name') {
      patchUserLocally(id, { name: normalizeText(value, 255) })
    }

    if (field === 'nick') {
      patchUserLocally(id, { nick: normalizeText(value, 50) })
    }

    if (field === 'email') {
      patchUserLocally(id, { email: normalizeEmail(value) })
    }

    if (field === 'password') {
      patchUserLocally(id, { password: normalizeText(value, 255) })
    }

    if (field === 'phone') {
      patchUserLocally(id, { phone: normalizeText(value, 20) })
    }

    if (field === 'status') {
      patchUserLocally(id, { status: normalizeStatus(value) as UserItem['status'] })
    }

    if (field === 'profileImage') {
      patchUserLocally(id, { profileImage: normalizeText(value, 255) })
    }

    if (field === 'lastLogin') {
      patchUserLocally(id, { lastLogin: normalizeText(value, 40) })
    }

    if (field === 'createdAt') {
      patchUserLocally(id, { createdAt: normalizeText(value, 40) })
    }

    if (field === 'userType') {
      patchUserLocally(id, { userType: normalizeUserType(value) as UserItem['userType'] })
    }

    if (field === 'businessRole') {
      const nextBusinessRole = normalizeBusinessRole(value) as UserItem['businessRole']
      patchUserLocally(id, {
        businessRole: nextBusinessRole,
        storeId: isStoreScopedBusinessRole(nextBusinessRole) ? users.value.find(user => user.id === id)?.storeId ?? null : null,
        storeName: isStoreScopedBusinessRole(nextBusinessRole) ? users.value.find(user => user.id === id)?.storeName ?? '' : ''
      })
    }

    if (field === 'storeId') {
      const target = users.value.find(user => user.id === id)
      const targetClientId = normalizeClientId(target?.clientId)
      const clientOption = clientOptions.value.find(option => normalizeOptionClientId(option.value) === (targetClientId ?? 0))
      const nextStoreId = normalizeStoreId(value)
      const matchedStore = (clientOption?.stores || []).find(store => store.id === nextStoreId)

      patchUserLocally(id, {
        storeId: matchedStore?.id ?? null,
        storeName: matchedStore?.name ?? ''
      })
    }

    if (field === 'registrationNumber') {
      patchUserLocally(id, { registrationNumber: normalizeRegistrationNumber(value) })
    }

    if (field === 'preferences') {
      patchUserLocally(id, { preferences: String(value ?? '').trim().slice(0, 4000) })
    }

    if (field === 'atendimentoAccess') {
      patchUserLocally(id, { atendimentoAccess: Boolean(value) })
    }

    queueFieldPersist(id, field, value, options)
  }

  async function approveLogin(id: number) {
    const savingKey = keyFor(id, 'approve')
    setSaving(savingKey, true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<UserMutationResponse>(`/api/admin/users/${id}/approve`, {
        method: 'POST'
      })

      replaceUserRow(response.data)
    } catch {
      errorMessage.value = 'Falha ao aprovar login do usuario.'
      await fetchUsers()
    } finally {
      setSaving(savingKey, false)
    }
  }

  async function createUser(payload?: Partial<UserCreatePayload>) {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<UserMutationResponse>('/api/admin/users', {
        method: 'POST',
        body: {
          name: normalizeText(payload?.name ?? 'Novo usuario', 255),
          nick: normalizeText(payload?.nick ?? '', 50),
          email: normalizeEmail(payload?.email ?? ''),
          password: normalizeText(payload?.password ?? 'Senha@123', 255),
          phone: normalizeText(payload?.phone ?? '', 20),
          clientId: normalizeClientId(payload?.clientId),
          level: normalizeLevel(payload?.level),
          userType: normalizeUserType(payload?.userType),
          businessRole: normalizeBusinessRole(payload?.businessRole),
          storeId: normalizeStoreId(payload?.storeId),
          registrationNumber: normalizeRegistrationNumber(payload?.registrationNumber),
          isPlatformAdmin: Boolean(payload?.isPlatformAdmin)
        }
      })

      const normalizedCreated = normalizeUserRecord(response.data)
      users.value.unshift(normalizedCreated)
      return normalizedCreated.id
    } catch {
      errorMessage.value = 'Falha ao criar usuario.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function deleteUser(id: number) {
    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/users/${id}`, {
        method: 'DELETE'
      })

      users.value = users.value.filter(user => user.id !== id)
    } catch {
      errorMessage.value = 'Falha ao excluir usuario.'
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  onBeforeUnmount(() => {
    for (const timer of pendingFieldTimers.values()) {
      clearTimeout(timer)
    }

    pendingFieldTimers.clear()
  })

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchAll()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('users', () => {
    void fetchAll()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    users,
    clientOptions,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchAll,
    fetchUsers,
    updateField,
    approveLogin,
    createUser,
    deleteUser
  }
}
