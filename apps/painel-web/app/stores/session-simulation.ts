import { defineStore } from 'pinia'
import { parseAdminPreferences } from '~/utils/admin-access'
import { useCoreAuthStore } from '~/stores/core-auth'

export type SessionSimulationUserType = 'admin' | 'client'
export type SessionSimulationUserLevel = 'admin' | 'consultant' | 'manager' | 'marketing' | 'finance' | 'viewer'

export interface SessionSimulationClientOption {
  label: string
  value: number
  coreTenantId?: string
  moduleCodes?: string[]
}

interface AdminProfileSummaryResponse {
  status?: string
  data?: {
    id?: string
    email?: string
    level?: string
    userType?: string
    clientId?: number | null
    clientName?: string
    tenantId?: string
    nick?: string | null
    storeName?: string | null
    profileImage?: string | null
    preferences?: unknown
    isPlatformAdmin?: boolean
    moduleCodes?: string[]
    atendimentoAccess?: boolean
  }
}

interface CoreAdminClientResponse {
  id?: number | null
  name?: string
  moduleCodes?: string[]
  modules?: Array<{
    code?: string
  }>
}

interface PersistedSimulationState {
  userType?: unknown
  userLevel?: unknown
  clientId?: unknown
}

interface RefreshClientOptionsOptions {
  force?: boolean
}

const STORAGE_KEY = 'omni.session-simulation.v3'
export const DEFAULT_ADMIN_CLIENT_ID = 106
const UNASSIGNED_CLIENT_ID = 0
const DEFAULT_CLIENT_OPTIONS: SessionSimulationClientOption[] = []

function clearLegacyAdminShadowStorage() {
  if (!import.meta.client) return
  localStorage.removeItem('admin:compat:token')
  localStorage.removeItem('admin:compat:user')
  localStorage.removeItem('admin:compat:expires-at')
  sessionStorage.removeItem('admin:compat:token')
  sessionStorage.removeItem('admin:compat:user')
  sessionStorage.removeItem('admin:compat:expires-at')
}

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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function hasOwnField(source: object, field: string) {
  return Object.prototype.hasOwnProperty.call(source, field)
}

function debugSessionSimulation(message: string, details?: Record<string, unknown>) {
  if (!import.meta.dev || !import.meta.client) {
    return
  }

  console.info('[session-simulation-debug]', message, details ?? {})
}

function resolveModuleScopedAtendimentoAccess(accessFlag: unknown, moduleCodes: string[]) {
  return Boolean(accessFlag) && moduleCodes.includes('atendimento')
}

function normalizeCoreTenantId(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeUserType(value: unknown): SessionSimulationUserType {
  return String(value ?? '').trim().toLowerCase() === 'client' ? 'client' : 'admin'
}

function normalizeUserLevel(value: unknown): SessionSimulationUserLevel {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'consultant' || normalized === 'manager' || normalized === 'finance' || normalized === 'viewer') {
    return normalized
  }
  return 'marketing'
}

function normalizeOptionalClientId(value: unknown): number {
  if (value === '' || value === null || value === undefined) {
    return UNASSIGNED_CLIENT_ID
  }

  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return UNASSIGNED_CLIENT_ID
  }

  return parsed
}

function normalizeSimulatedClientId(value: unknown): number {
  const parsed = normalizeOptionalClientId(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ADMIN_CLIENT_ID
  }

  return parsed
}

function resolveClientLabel(clientId: number, value?: unknown) {
  const label = String(value ?? '').trim()
  if (label) {
    return label
  }

  if (clientId <= 0) {
    return 'Sem cliente'
  }

  return `Cliente #${clientId}`
}

function dedupeClientOptions(options: SessionSimulationClientOption[]) {
  const merged = new Map<number, SessionSimulationClientOption>()
  options.forEach((option) => {
    const clientId = normalizeOptionalClientId(option.value)
    const label = resolveClientLabel(clientId, option.label)
    const moduleCodes = normalizeModuleCodes(option.moduleCodes)
    const current = merged.get(clientId)
    merged.set(clientId, {
      value: clientId,
      label,
      coreTenantId: normalizeCoreTenantId(option.coreTenantId) || normalizeCoreTenantId(current?.coreTenantId),
      moduleCodes: moduleCodes.length > 0 ? moduleCodes : normalizeModuleCodes(current?.moduleCodes)
    })
  })

  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

export function resolveSessionSimulationFallbackClientId(options: {
  canSimulate: boolean
  currentClientId: number
  profileClientId: number
  availableOptions: SessionSimulationClientOption[]
}) {
  const normalizedCurrentClientId = options.canSimulate
    ? normalizeSimulatedClientId(options.currentClientId)
    : normalizeOptionalClientId(options.currentClientId)
  const normalizedProfileClientId = normalizeOptionalClientId(options.profileClientId)
  const normalizedOptions = dedupeClientOptions(options.availableOptions)

  if (normalizedOptions.some(option => option.value === normalizedCurrentClientId)) {
    return normalizedCurrentClientId
  }

  if (normalizedProfileClientId > 0 && normalizedOptions.some(option => option.value === normalizedProfileClientId)) {
    return normalizedProfileClientId
  }

  const nextClientId = normalizedOptions[0]?.value ?? UNASSIGNED_CLIENT_ID
  return options.canSimulate
    ? normalizeSimulatedClientId(nextClientId)
    : normalizeOptionalClientId(nextClientId)
}

export function buildSessionRequestHeaders(options: {
  canSimulate: boolean
  userType: SessionSimulationUserType
  userLevel: SessionSimulationUserLevel
  clientId: number
  effectiveClientId: number
  effectiveCoreTenantId?: string
}) {
  const headers: Record<string, string> = {}
  const effectiveClientId = normalizeOptionalClientId(options.effectiveClientId)
  const effectiveCoreTenantId = normalizeCoreTenantId(options.effectiveCoreTenantId)

  if (effectiveClientId > 0) {
    headers['x-client-id'] = String(effectiveClientId)
  }
  if (effectiveCoreTenantId) {
    headers['x-tenant-id'] = effectiveCoreTenantId
  }

  if (!options.canSimulate) {
    return headers
  }

  headers['x-user-type'] = options.userType
  headers['x-user-level'] = options.userLevel
  headers['x-client-id'] = String(normalizeSimulatedClientId(options.clientId))
  return headers
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
  const profileClientId = ref<number>(UNASSIGNED_CLIENT_ID)
  const profileNick = ref('')
  const profileStoreName = ref('')
  const profileImage = ref('')
  const profilePreferences = ref('{}')
  const profileIsPlatformAdmin = ref(false)
  const profileModuleCodes = ref<string[]>([])
  const profileAtendimentoAccess = ref(false)
  const clientOptions = ref<SessionSimulationClientOption[]>(dedupeClientOptions(DEFAULT_CLIENT_OPTIONS))
  const lastClientOptionsSyncAt = ref('')
  const clientOptionsSynced = computed(() => modulesHydrated.value && Boolean(lastClientOptionsSyncAt.value))

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
  const requestHeaders = computed(() => buildSessionRequestHeaders({
    canSimulate: canSimulate.value,
    userType: userType.value,
    userLevel: userLevel.value,
    clientId: clientId.value,
    effectiveClientId: effectiveClientId.value,
    effectiveCoreTenantId: activeClientCoreTenantId.value
  }))
  const activeClientLabel = computed(() => {
    const found = clientOptions.value.find(option => option.value === effectiveClientId.value)
    if (found) return found.label
    return resolveClientLabel(effectiveClientId.value)
  })
  const activeClientCoreTenantId = computed(() => {
    const found = clientOptions.value.find(option => option.value === effectiveClientId.value)
    return normalizeCoreTenantId(found?.coreTenantId)
  })
  const fallbackUserModuleCodes = computed(() => normalizeModuleCodes(useCoreAuthStore().user?.moduleCodes))
  const activeClientModuleCodes = computed(() => {
    if (effectiveClientId.value <= 0) {
      return modulesHydrated.value ? [] : fallbackUserModuleCodes.value
    }

    const found = clientOptions.value.find(option => option.value === effectiveClientId.value)
    const clientModuleCodes = normalizeModuleCodes(found?.moduleCodes)
    if (clientModuleCodes.length > 0) {
      return clientModuleCodes
    }

    if (profileModuleCodes.value.length > 0) {
      return profileModuleCodes.value
    }

    return modulesHydrated.value ? [] : fallbackUserModuleCodes.value
  })
  const requestContextHash = computed(() => [
    effectiveUserType.value,
    effectiveUserLevel.value,
    String(effectiveClientId.value),
    activeClientCoreTenantId.value,
    activeClientModuleCodes.value.join(','),
    profilePreferences.value,
    profileModuleCodes.value.join(','),
    profileAtendimentoAccess.value ? '1' : '0'
  ].join(':'))
  const effectiveAccessOverrides = computed(() => parseAdminPreferences(profilePreferences.value).adminAccess)
  const effectiveAtendimentoAccess = computed(() => profileAtendimentoAccess.value && activeClientModuleCodes.value.includes('atendimento'))
  let pendingClientOptionsRefresh: Promise<void> | null = null

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
      { label: resolveClientLabel(targetClientId), value: targetClientId }
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
      clientId.value = normalizeSimulatedClientId(parsed.clientId)
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
    clientId.value = normalizeSimulatedClientId(next)
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
      clientId.value = normalizeSimulatedClientId(next.clientId)
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
    profileClientId.value = UNASSIGNED_CLIENT_ID
    profileNick.value = ''
    profileStoreName.value = ''
    profileImage.value = ''
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
    debugSessionSimulation('clearAllSessions', {
      path: import.meta.client ? window.location.pathname : null
    })
    useCoreAuthStore().clearSession()
    clearLegacyAdminShadowStorage()
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
      const fallbackClientId = canSimulate.value
        ? normalizeSimulatedClientId(clientId.value)
        : normalizeOptionalClientId(effectiveClientId.value)

      clientOptions.value = fallbackClientId > 0
        ? dedupeClientOptions([
            {
              value: fallbackClientId,
              label: resolveClientLabel(fallbackClientId, activeClientLabel.value),
              coreTenantId: activeClientCoreTenantId.value,
              moduleCodes: profileModuleCodes.value
            }
          ])
        : []
      modulesHydrated.value = true
      persist()
      return
    }

    clientId.value = resolveSessionSimulationFallbackClientId({
      canSimulate: canSimulate.value,
      currentClientId: clientId.value,
      profileClientId: profileClientId.value,
      availableOptions: normalized
    })

    clientOptions.value = normalized
    modulesHydrated.value = true
    persist()
  }

  function markClientOptionsSynced() {
    modulesHydrated.value = true
    lastClientOptionsSyncAt.value = new Date().toISOString()
  }

  function finalizeClientOptionsFallback(option?: Partial<SessionSimulationClientOption>) {
    if (clientOptions.value.length === 0) {
      const fallbackClientId = canSimulate.value
        ? normalizeSimulatedClientId(clientId.value)
        : normalizeOptionalClientId(effectiveClientId.value)

      if (fallbackClientId > 0) {
        clientOptions.value = dedupeClientOptions([{
          value: fallbackClientId,
          label: resolveClientLabel(fallbackClientId, option?.label ?? activeClientLabel.value),
          coreTenantId: normalizeCoreTenantId(option?.coreTenantId) || activeClientCoreTenantId.value,
          moduleCodes: normalizeModuleCodes(option?.moduleCodes?.length ? option.moduleCodes : profileModuleCodes.value)
        }])
        persist()
      }
    }

    markClientOptionsSynced()
  }

  function applyCoreAuthProfileFallback(coreAuth = useCoreAuthStore()) {
    const coreUser = coreAuth.user
    const fallbackModuleCodes = normalizeModuleCodes(coreUser?.moduleCodes)
    const fallbackClientId = normalizeOptionalClientId(coreUser?.clientId)

    profileIsPlatformAdmin.value = Boolean(coreUser?.isPlatformAdmin)
    profileUserType.value = normalizeUserType(coreUser?.userType ?? (profileIsPlatformAdmin.value ? 'admin' : 'client'))
    profileUserLevel.value = normalizeUserLevel(coreUser?.level ?? (profileIsPlatformAdmin.value ? 'admin' : 'marketing'))
    profileClientId.value = fallbackClientId
    profileModuleCodes.value = fallbackModuleCodes
    profileAtendimentoAccess.value = resolveModuleScopedAtendimentoAccess(
      coreUser?.atendimentoAccess,
      fallbackModuleCodes
    )

    if (!canSimulate.value) {
      userType.value = profileIsPlatformAdmin.value ? 'admin' : 'client'
      userLevel.value = profileUserLevel.value
      clientId.value = fallbackClientId
    }

    finalizeClientOptionsFallback({
      value: fallbackClientId,
      label: normalizeText(coreUser?.clientName),
      coreTenantId: normalizeCoreTenantId(coreUser?.tenantId),
      moduleCodes: fallbackModuleCodes
    })
  }

  function hasModule(moduleCode: unknown) {
    const normalized = normalizeModuleCode(moduleCode)
    if (!normalized) return false
    return activeClientModuleCodes.value.includes(normalized)
  }

  async function refreshClientOptions(options: RefreshClientOptionsOptions = {}) {
    if (pendingClientOptionsRefresh) {
      return pendingClientOptionsRefresh
    }

    if (!options.force && clientOptionsSynced.value) {
      return
    }

    pendingClientOptionsRefresh = (async () => {
      debugSessionSimulation('refreshClientOptions:start', {
        force: Boolean(options.force),
        clientOptionsSynced: clientOptionsSynced.value
      })
      loadingClientOptions.value = true
      try {
        const coreAuth = useCoreAuthStore()
        coreAuth.hydrate()
        const coreToken = String(coreAuth.token ?? '').trim()

        if (!coreToken) {
          return
        }

        let profileResponse: AdminProfileSummaryResponse | null = null
        try {
          profileResponse = await $fetch<AdminProfileSummaryResponse>('/api/admin/profile/summary', {
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
          applyCoreAuthProfileFallback(coreAuth)
          return
        }

        if (!profileResponse?.data) {
          clearAllSessions()
          return
        }

        const profileData = profileResponse.data
        const resolvedProfileTenantId = normalizeCoreTenantId(hasOwnField(profileData, 'tenantId') ? profileData.tenantId : coreAuth.user?.tenantId)
        profileUserType.value = normalizeUserType(profileData.userType ?? (coreAuth.user?.isPlatformAdmin ? 'admin' : 'client'))
        profileUserLevel.value = normalizeUserLevel(profileData.level ?? (coreAuth.user?.isPlatformAdmin ? 'admin' : 'marketing'))
        profileClientId.value = normalizeOptionalClientId(hasOwnField(profileData, 'clientId') ? profileData.clientId : coreAuth.user?.clientId)
        profileNick.value = normalizeText(profileResponse?.data?.nick)
        profileStoreName.value = normalizeText(profileResponse?.data?.storeName)
        profileImage.value = normalizeText(profileResponse?.data?.profileImage)
        profilePreferences.value = typeof profileResponse?.data?.preferences === 'string'
          ? String(profileResponse?.data?.preferences ?? '{}')
          : JSON.stringify(profileResponse?.data?.preferences ?? {})
        profileIsPlatformAdmin.value = Boolean(profileResponse?.data?.isPlatformAdmin ?? coreAuth.user?.isPlatformAdmin)
        profileModuleCodes.value = normalizeModuleCodes(profileResponse?.data?.moduleCodes)
        profileAtendimentoAccess.value = resolveModuleScopedAtendimentoAccess(
          profileResponse?.data?.atendimentoAccess,
          profileModuleCodes.value
        )

        if (!canSimulate.value) {
          userType.value = profileIsPlatformAdmin.value ? 'admin' : 'client'
          userLevel.value = profileUserLevel.value
          clientId.value = profileClientId.value
        }

        const isPlatformAdmin = Boolean(profileIsPlatformAdmin.value)
        if (!isPlatformAdmin) {
          let nextClientId = normalizeOptionalClientId(profileClientId.value)
          let nextClientLabel = resolveClientLabel(
            nextClientId,
            profileResponse?.data?.clientName ?? coreAuth.user?.clientName
          )
          let nextModuleCodes = [...profileModuleCodes.value]

          if (resolvedProfileTenantId && (nextClientId <= 0 || !nextClientLabel || nextModuleCodes.length === 0)) {
            try {
              const clientDetail = await $fetch<CoreAdminClientResponse>(
                `/api/core-bff/core/admin/clients/${encodeURIComponent(resolvedProfileTenantId)}`,
                {
                  headers: {
                    'x-core-token': coreToken
                  }
                }
              )

              nextClientId = normalizeOptionalClientId(clientDetail?.id ?? nextClientId)
              nextClientLabel = resolveClientLabel(nextClientId, clientDetail?.name ?? nextClientLabel)
              const clientModuleCodes = normalizeModuleCodes(
                Array.isArray(clientDetail?.moduleCodes) && clientDetail.moduleCodes.length > 0
                  ? clientDetail.moduleCodes
                  : (clientDetail?.modules || []).map(module => module.code)
              )

              if (clientModuleCodes.length > 0) {
                nextModuleCodes = clientModuleCodes
              }
            } catch (error) {
              finalizeClientOptionsFallback({
                value: nextClientId,
                label: nextClientLabel,
                coreTenantId: resolvedProfileTenantId,
                moduleCodes: nextModuleCodes
              })
            }
          }

          profileClientId.value = nextClientId
          if (nextModuleCodes.length > 0) {
            profileModuleCodes.value = [...nextModuleCodes]
          }
          profileAtendimentoAccess.value = resolveModuleScopedAtendimentoAccess(
            profileResponse?.data?.atendimentoAccess,
            profileModuleCodes.value
          )
          if (!canSimulate.value) {
            clientId.value = nextClientId
          }

          replaceClientOptions([{
            value: nextClientId,
            label: nextClientLabel,
            coreTenantId: resolvedProfileTenantId,
            moduleCodes: nextClientId > 0 ? nextModuleCodes : []
          }])
          markClientOptionsSynced()
          return
        }

        const response = await $fetch<{
          status: string
          data: Array<{
            id: number
            name: string
            coreTenantId?: string
            modules?: Array<{ code?: string }>
          }>
        }>('/api/admin/clients', {
          query: {
            page: 1,
            limit: 120,
            status: 'active'
          },
          headers: {
            'x-core-token': coreToken
          }
        })

        const mapped = (response.data || [])
          .map(item => ({
            value: normalizeOptionalClientId(item.id),
            label: String(item.name ?? '').trim() || `Cliente #${item.id}`,
            coreTenantId: normalizeCoreTenantId(item.coreTenantId),
            moduleCodes: normalizeModuleCodes((item.modules || []).map(module => module.code))
          }))
          .filter(item => Number.isFinite(item.value) && item.value > 0)

        replaceClientOptions(mapped)
        markClientOptionsSynced()
      } catch (error) {
        finalizeClientOptionsFallback()
      } finally {
        debugSessionSimulation('refreshClientOptions:done', {
          force: Boolean(options.force),
          clientOptionsSynced: clientOptionsSynced.value,
          hasCoreToken: Boolean(useCoreAuthStore().token)
        })
        loadingClientOptions.value = false
        pendingClientOptionsRefresh = null
      }
    })()

    return pendingClientOptionsRefresh
  }

  return {
    initialized,
    loadingClientOptions,
    modulesHydrated,
    clientOptionsSynced,
    userType,
    userLevel,
    clientId,
    profileUserType,
    profileUserLevel,
    profileClientId,
    profileNick,
    profileStoreName,
    profileImage,
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
    effectiveAtendimentoAccess,
    requestContextHash,
    requestHeaders,
    activeClientLabel,
    activeClientCoreTenantId,
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
