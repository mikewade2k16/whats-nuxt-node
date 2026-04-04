import { defineStore } from 'pinia'
import { parseAdminPreferences } from '~/utils/admin-access'
import { useAuthStore } from '~/stores/auth'
import { useCoreAuthStore } from '~/stores/core-auth'

export type SessionSimulationUserType = 'admin' | 'client'
export type SessionSimulationUserLevel = 'admin' | 'manager' | 'marketing' | 'finance' | 'viewer'

export interface SessionSimulationClientOption {
  label: string
  value: number
  moduleCodes?: string[]
}

interface AdminProfileResponse {
  status?: string
  data?: {
    level?: string
    userType?: string
    clientId?: number | null
    preferences?: unknown
    isPlatformAdmin?: boolean
    moduleCodes?: string[]
    atendimentoAccess?: boolean
  }
}

interface CoreTenantResponse {
  id?: string
  name?: string
}

interface CoreTenantModulesResponse {
  items?: Array<{
    code?: string
  }>
}

interface PersistedSimulationState {
  userType?: unknown
  userLevel?: unknown
  clientId?: unknown
}

const STORAGE_KEY = 'omni.session-simulation.v2'
export const DEFAULT_ADMIN_CLIENT_ID = 1
const DEFAULT_CLIENT_OPTIONS: SessionSimulationClientOption[] = []

function normalizeModuleCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : []
  const dedupe = new Set<string>()
  const output: string[] = []

  for (const entry of source) {
    const code = normalizeModuleCode(entry)
    if (!code || dedupe.has(code)) continue
    dedupe.add(code)
    output.push(code)
  }

  return output
}

function normalizeUserType(value: unknown): SessionSimulationUserType {
  return String(value ?? '').trim().toLowerCase() === 'client' ? 'client' : 'admin'
}

function normalizeUserLevel(value: unknown): SessionSimulationUserLevel {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'manager' || normalized === 'finance' || normalized === 'viewer') {
    return normalized
  }
  return 'marketing'
}

function normalizeClientId(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ADMIN_CLIENT_ID
  }

  return parsed
}

function dedupeClientOptions(options: SessionSimulationClientOption[]) {
  const merged = new Map<number, SessionSimulationClientOption>()
  options.forEach((option) => {
    const clientId = normalizeClientId(option.value)
    const label = String(option.label ?? '').trim() || `Cliente #${clientId}`
    const moduleCodes = normalizeModuleCodes(option.moduleCodes)
    const current = merged.get(clientId)
    merged.set(clientId, {
      value: clientId,
      label,
      moduleCodes: moduleCodes.length > 0 ? moduleCodes : normalizeModuleCodes(current?.moduleCodes)
    })
  })

  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

function extractFetchStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 0
  }

  if ('statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode)
    return Number.isFinite(statusCode) ? statusCode : 0
  }

  if ('status' in error) {
    const statusCode = Number((error as { status?: unknown }).status)
    return Number.isFinite(statusCode) ? statusCode : 0
  }

  return 0
}

export const useSessionSimulationStore = defineStore('sessionSimulation', () => {
  const initialized = ref(false)
  const loadingClientOptions = ref(false)
  const modulesHydrated = ref(false)
  const userType = ref<SessionSimulationUserType>('admin')
  const userLevel = ref<SessionSimulationUserLevel>('admin')
  const clientId = ref<number>(DEFAULT_ADMIN_CLIENT_ID)
  const profileUserType = ref<SessionSimulationUserType>('client')
  const profileUserLevel = ref<SessionSimulationUserLevel>('marketing')
  const profileClientId = ref<number>(DEFAULT_ADMIN_CLIENT_ID)
  const profilePreferences = ref('{}')
  const profileIsPlatformAdmin = ref(false)
  const profileModuleCodes = ref<string[]>([])
  const profileAtendimentoAccess = ref(false)
  const clientOptions = ref<SessionSimulationClientOption[]>(dedupeClientOptions(DEFAULT_CLIENT_OPTIONS))
  const lastClientOptionsSyncAt = ref('')

  const canSimulate = computed(() => profileIsPlatformAdmin.value
    && profileUserType.value === 'admin'
    && profileUserLevel.value === 'admin')
  const effectiveUserType = computed<SessionSimulationUserType>(() => {
    if (!canSimulate.value) {
      return profileIsPlatformAdmin.value ? 'admin' : 'client'
    }
    return userType.value
  })
  const effectiveUserLevel = computed<SessionSimulationUserLevel>(() => {
    if (!canSimulate.value) {
      return profileUserLevel.value
    }
    return userLevel.value
  })
  const effectiveClientId = computed<number>(() => {
    if (!canSimulate.value) {
      return profileClientId.value
    }
    return clientId.value
  })
  const isAdmin = computed(() => effectiveUserType.value === 'admin')
  const isClient = computed(() => effectiveUserType.value === 'client')
  const requestContextHash = computed(() => `${effectiveUserType.value}:${effectiveUserLevel.value}:${effectiveClientId.value}:${profilePreferences.value}:${profileModuleCodes.value.join(',')}`)
  const requestHeaders = computed(() => {
    if (!canSimulate.value) {
      return {}
    }
    return {
      'x-user-type': userType.value,
      'x-user-level': userLevel.value,
      'x-client-id': String(clientId.value)
    }
  })
  const activeClientLabel = computed(() => {
    const found = clientOptions.value.find(option => option.value === effectiveClientId.value)
    if (found) return found.label
    return 'Cliente'
  })
  const activeClientModuleCodes = computed(() => {
    const found = clientOptions.value.find(option => option.value === effectiveClientId.value)
    return normalizeModuleCodes(found?.moduleCodes)
  })
  const effectiveAccessOverrides = computed(() => parseAdminPreferences(profilePreferences.value).adminAccess)

  function persist() {
    if (!import.meta.client) return

    const payload: PersistedSimulationState = {
      userType: userType.value,
      userLevel: userLevel.value,
      clientId: clientId.value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  function clearPersistedState() {
    if (!import.meta.client) return
    localStorage.removeItem(STORAGE_KEY)
  }

  function ensureClientOptionForCurrentContext() {
    const targetClientId = effectiveClientId.value
    const exists = clientOptions.value.some(option => option.value === targetClientId)
    if (exists) return

    clientOptions.value = dedupeClientOptions([
      ...clientOptions.value,
      { label: `Cliente #${targetClientId}`, value: targetClientId }
    ])
  }

  function hydrateFromStorage() {
    if (!import.meta.client) return

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as PersistedSimulationState
      userType.value = normalizeUserType(parsed.userType)
      userLevel.value = normalizeUserLevel(parsed.userLevel)
      clientId.value = normalizeClientId(parsed.clientId)
      ensureClientOptionForCurrentContext()
    } catch {
      userType.value = 'admin'
      userLevel.value = 'admin'
      clientId.value = DEFAULT_ADMIN_CLIENT_ID
    }
  }

  function initialize() {
    if (initialized.value) return
    hydrateFromStorage()
    initialized.value = true
  }

  function setUserType(next: unknown) {
    if (!canSimulate.value) return
    userType.value = normalizeUserType(next)
    ensureClientOptionForCurrentContext()
    persist()
  }

  function setUserLevel(next: unknown) {
    if (!canSimulate.value) return
    userLevel.value = normalizeUserLevel(next)
    persist()
  }

  function setClientId(next: unknown) {
    if (!canSimulate.value) return
    clientId.value = normalizeClientId(next)
    ensureClientOptionForCurrentContext()
    persist()
  }

  function setContext(next: { userType?: unknown, userLevel?: unknown, clientId?: unknown }) {
    if (!canSimulate.value) return
    if (Object.prototype.hasOwnProperty.call(next, 'userType')) {
      userType.value = normalizeUserType(next.userType)
    }

    if (Object.prototype.hasOwnProperty.call(next, 'userLevel')) {
      userLevel.value = normalizeUserLevel(next.userLevel)
    }

    if (Object.prototype.hasOwnProperty.call(next, 'clientId')) {
      clientId.value = normalizeClientId(next.clientId)
    }

    ensureClientOptionForCurrentContext()
    persist()
  }

  function reset() {
    userType.value = 'admin'
    userLevel.value = 'admin'
    clientId.value = DEFAULT_ADMIN_CLIENT_ID
    profileUserType.value = 'client'
    profileUserLevel.value = 'marketing'
    profileClientId.value = DEFAULT_ADMIN_CLIENT_ID
    profilePreferences.value = '{}'
    profileIsPlatformAdmin.value = false
    profileModuleCodes.value = []
    profileAtendimentoAccess.value = false
    clientOptions.value = dedupeClientOptions(DEFAULT_CLIENT_OPTIONS)
    lastClientOptionsSyncAt.value = ''
    modulesHydrated.value = false
    clearPersistedState()
  }

  function clearAllSessions() {
    useAuthStore().clearSession()
    useCoreAuthStore().clearSession()
    reset()
  }

  function mergeClientOptions(next: SessionSimulationClientOption[]) {
    clientOptions.value = dedupeClientOptions([
      ...DEFAULT_CLIENT_OPTIONS,
      ...clientOptions.value,
      ...next
    ])
    ensureClientOptionForCurrentContext()
    persist()
  }

  function replaceClientOptions(next: SessionSimulationClientOption[]) {
    const normalized = dedupeClientOptions(next)
    if (normalized.length === 0) {
      clientOptions.value = dedupeClientOptions([
        { value: clientId.value, label: activeClientLabel.value }
      ])
      modulesHydrated.value = false
      persist()
      return
    }

    const hasCurrent = normalized.some(option => option.value === clientId.value)
    if (!hasCurrent) {
      clientId.value = normalized[0]?.value || DEFAULT_ADMIN_CLIENT_ID
    }

    clientOptions.value = normalized
    modulesHydrated.value = true
    persist()
  }

  function hasModule(moduleCode: unknown) {
    if (canSimulate.value && effectiveUserType.value === 'admin' && effectiveUserLevel.value === 'admin') {
      return true
    }

    const normalized = normalizeModuleCode(moduleCode)
    if (!normalized) return false
    const clientHasModule = activeClientModuleCodes.value.includes(normalized)
    if (!clientHasModule) {
      return false
    }

    if (canSimulate.value) {
      return true
    }

    return profileModuleCodes.value.includes(normalized)
  }

  async function refreshClientOptions() {
    if (loadingClientOptions.value) return

    loadingClientOptions.value = true
    try {
      const coreAuth = useCoreAuthStore()
      coreAuth.hydrate()
      const coreToken = String(coreAuth.token ?? '').trim()

      if (!coreToken) {
        return
      }

      let profileResponse: AdminProfileResponse | null = null
      try {
        profileResponse = await $fetch<AdminProfileResponse>('/api/admin/profile', {
          headers: {
            'x-core-token': coreToken
          }
        })
      } catch (error) {
        const statusCode = extractFetchStatusCode(error)
        if (statusCode === 401 || statusCode === 403) {
          clearAllSessions()
          return
        }
        return
      }

      if (!profileResponse?.data) {
        clearAllSessions()
        return
      }

      profileUserType.value = normalizeUserType(profileResponse?.data?.userType ?? (coreAuth.user?.isPlatformAdmin ? 'admin' : 'client'))
      profileUserLevel.value = normalizeUserLevel(profileResponse?.data?.level ?? (coreAuth.user?.isPlatformAdmin ? 'admin' : 'marketing'))
      profileClientId.value = normalizeClientId(profileResponse?.data?.clientId ?? clientId.value)
      profilePreferences.value = typeof profileResponse?.data?.preferences === 'string'
        ? String(profileResponse?.data?.preferences ?? '{}')
        : JSON.stringify(profileResponse?.data?.preferences ?? {})
      profileIsPlatformAdmin.value = Boolean(profileResponse?.data?.isPlatformAdmin ?? coreAuth.user?.isPlatformAdmin)
      profileModuleCodes.value = normalizeModuleCodes(profileResponse?.data?.moduleCodes)
      profileAtendimentoAccess.value = Boolean(profileResponse?.data?.atendimentoAccess) || profileModuleCodes.value.includes('atendimento')

      if (!canSimulate.value) {
        userType.value = profileIsPlatformAdmin.value ? 'admin' : 'client'
        userLevel.value = profileUserLevel.value
        clientId.value = profileClientId.value
      }

      const isPlatformAdmin = Boolean(profileIsPlatformAdmin.value)
      if (!isPlatformAdmin) {
        const tenantId = String(coreAuth.user?.tenantId ?? '').trim()
        if (!tenantId) {
          clearAllSessions()
          return
        }

        let tenantResponse: CoreTenantResponse | null = null
        let tenantModulesResponse: CoreTenantModulesResponse | null = null
        try {
          [tenantResponse, tenantModulesResponse] = await Promise.all([
            $fetch<CoreTenantResponse>(`/api/core-bff/core/tenants/${tenantId}`, {
              headers: {
                'x-core-token': coreToken
              }
            }),
            $fetch<CoreTenantModulesResponse>(`/api/core-bff/core/tenants/${tenantId}/modules`, {
              headers: {
                'x-core-token': coreToken
              }
            })
          ])
        } catch (error) {
          const statusCode = extractFetchStatusCode(error)
          if (statusCode === 401 || statusCode === 403) {
            clearAllSessions()
          }
          return
        }

        const resolvedClientId = normalizeClientId(profileClientId.value)
        const resolvedTenantName = String(tenantResponse?.name ?? '').trim() || `Cliente #${resolvedClientId}`
        const moduleCodes = normalizeModuleCodes((tenantModulesResponse?.items || []).map(module => module.code))

        replaceClientOptions([{
          value: resolvedClientId,
          label: resolvedTenantName,
          moduleCodes
        }])
        modulesHydrated.value = true
        lastClientOptionsSyncAt.value = new Date().toISOString()
        return
      }

      const response = await $fetch<{
        status: string
        data: Array<{
          id: number
          name: string
          modules?: Array<{ code?: string }>
        }>
      }>('/api/admin/clients', {
        query: {
          page: 1,
          limit: 120,
          status: 'active'
        },
        headers: {
          'x-user-type': 'admin',
          'x-user-level': 'admin',
          'x-client-id': String(profileClientId.value || DEFAULT_ADMIN_CLIENT_ID),
          'x-core-token': coreToken
        }
      })

      const mapped = (response.data || [])
        .map(item => ({
          value: normalizeClientId(item.id),
          label: String(item.name ?? '').trim() || `Cliente #${item.id}`,
          moduleCodes: normalizeModuleCodes((item.modules || []).map(module => module.code))
        }))
        .filter(item => Number.isFinite(item.value) && item.value > 0)

      replaceClientOptions(mapped)
      modulesHydrated.value = true
      lastClientOptionsSyncAt.value = new Date().toISOString()
    } catch (error) {
      const statusCode = extractFetchStatusCode(error)
      if (statusCode === 401 || statusCode === 403) {
        clearAllSessions()
      }
    } finally {
      loadingClientOptions.value = false
    }
  }

  return {
    initialized,
    loadingClientOptions,
    modulesHydrated,
    userType,
    userLevel,
    clientId,
    profileUserType,
    profileUserLevel,
    profileClientId,
    profilePreferences,
    profileIsPlatformAdmin,
    profileModuleCodes,
    profileAtendimentoAccess,
    clientOptions,
    lastClientOptionsSyncAt,
    isAdmin,
    isClient,
    canSimulate,
    effectiveUserType,
    effectiveUserLevel,
    effectiveClientId,
    effectiveAccessOverrides,
    requestContextHash,
    requestHeaders,
    activeClientLabel,
    activeClientModuleCodes,
    initialize,
    setUserType,
    setUserLevel,
    setClientId,
    setContext,
    reset,
    mergeClientOptions,
    replaceClientOptions,
    refreshClientOptions,
    hasModule
  }
})
