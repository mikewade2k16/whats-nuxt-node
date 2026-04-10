<script setup lang="ts">
import { useAdminSession } from '~/composables/useAdminSession'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TenantSettings } from '~/types'

interface AdminProfileResponse {
  status?: string
  data?: {
    nick?: string
    profileImage?: string
  }
}

const sessionSimulation = useSessionSimulationStore()
const { user, coreUser, legacyRole, tenantSlug, isAuthenticated, validateSession, logout: performLogout, hydrate } = useAdminSession()
const { apiFetch } = useApi()
const { bffFetch } = useBffFetch()
const route = useRoute()
const realtime = useTenantRealtime()
realtime.start()

const layoutReady = ref(false)
const resolvedTenantName = ref('')
const resolvedNick = ref('')
const resolvedProfileImage = ref('')
const SESSION_HEARTBEAT_INTERVAL_MS = 60_000

let sessionHeartbeatTimer: number | null = null

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const isRootAdmin = computed(() => Boolean(coreUser.value?.isPlatformAdmin))
const accessContext = computed(() => ({
  isAuthenticated: Boolean(isAuthenticated.value),
  isRootUser: isRootAdmin.value,
  profileUserType: sessionSimulation.profileUserType,
  profileUserLevel: sessionSimulation.profileUserLevel,
  sessionUserType: sessionSimulation.userType,
  sessionUserLevel: sessionSimulation.userLevel,
  preferences: sessionSimulation.profilePreferences,
  hasModule: (moduleCode: unknown) => sessionSimulation.hasModule(moduleCode)
}))
const accessFlags = computed(() => resolveAdminAccessFlags(accessContext.value))
const canAccessRootManage = computed(() => evaluateAdminRouteAccess('/admin/manage/clientes', accessContext.value).allowed)
const canAccessUsersManage = computed(() => evaluateAdminRouteAccess('/admin/manage/users', accessContext.value).allowed)
const canAccessQa = computed(() => evaluateAdminRouteAccess('/admin/manage/qa', accessContext.value).allowed)
const canAccessAudit = computed(() => evaluateAdminRouteAccess('/admin/manage/auditoria', accessContext.value).allowed)
const canAccessThemes = computed(() => accessFlags.value.canAccessThemes)
const canAccessMonitoring = computed(() => evaluateAdminRouteAccess('/admin/containers', accessContext.value).allowed)
const canAccessOmnichannel = computed(() => evaluateAdminRouteAccess('/admin/omnichannel/inbox', accessContext.value).allowed)
const canAccessFilaAtendimento = computed(() => evaluateAdminRouteAccess('/admin/fila-atendimento', accessContext.value).allowed)
const canAccessFinance = computed(() => evaluateAdminRouteAccess('/admin/finance', accessContext.value).allowed)
const canAccessTasks = computed(() => evaluateAdminRouteAccess('/admin/tasks', accessContext.value).allowed)
const canAccessTracking = computed(() => evaluateAdminRouteAccess('/admin/tracking', accessContext.value).allowed)
const canAccessTools = computed(() => evaluateAdminRouteAccess('/admin/tools', accessContext.value).allowed)
const canAccessTeam = computed(() => evaluateAdminRouteAccess('/admin/team', accessContext.value).allowed)
const canAccessSite = computed(() => evaluateAdminRouteAccess('/admin/site', accessContext.value).allowed)
const viewerUserType = computed(() => sessionSimulation.profileUserType)
const viewerLevel = computed(() => sessionSimulation.profileUserLevel)

const profileEmail = computed(() => normalizeText(user.value?.email ?? coreUser.value?.email))

const profileDisplayName = computed(() => {
  const authNick = normalizeText(user.value?.nick)
  if (authNick) return authNick

  const coreNick = normalizeText(coreUser.value?.nick)
  if (coreNick) return coreNick

  const resolvedNickValue = normalizeText(resolvedNick.value)
  if (resolvedNickValue) return resolvedNickValue

  const fallbackName = normalizeText(user.value?.name ?? coreUser.value?.name)
  if (fallbackName) return fallbackName

  const email = normalizeText(profileEmail.value)
  if (email.includes('@')) {
    return email.split('@')[0] || 'Usuario'
  }

  return email || 'Usuario'
})

const profileClientName = computed(() => {
  if (isRootAdmin.value) {
    const simulatedClientLabel = normalizeText(sessionSimulation.activeClientLabel)
    if (simulatedClientLabel) return simulatedClientLabel
  }

  const clientName = normalizeText(coreUser.value?.clientName)
  if (clientName) return clientName

  const tenantName = normalizeText(resolvedTenantName.value)
  if (tenantName) return tenantName

  const slug = normalizeText(tenantSlug.value)
  if (slug) return slug

  return 'Cliente'
})

const profileRoleLabel = computed(() => {
  const localRole = normalizeText(legacyRole.value).toLowerCase()
  const activeLevel = normalizeText(sessionSimulation.effectiveUserLevel).toLowerCase()
  const role = isRootAdmin.value
    && sessionSimulation.canSimulate
    && sessionSimulation.effectiveUserType === 'admin'
    && sessionSimulation.effectiveUserLevel === 'admin'
    ? 'root admin'
    : (activeLevel || localRole || 'usuario')
  return `${role} / ${profileClientName.value}`
})

const profileAvatar = computed(() => ({
  alt: profileDisplayName.value,
  src: normalizeText(user.value?.profileImage) || normalizeText(coreUser.value?.profileImage) || normalizeText(resolvedProfileImage.value) || undefined
}))

watch(
  () => [normalizeText(user.value?.nick), normalizeText(coreUser.value?.nick)],
  ([authNick, coreNick]) => {
    const next = authNick || coreNick
    resolvedNick.value = next || ''
  },
  { immediate: true }
)

watch(
  () => [normalizeText(user.value?.profileImage), normalizeText(coreUser.value?.profileImage)],
  ([authProfileImage, coreProfileImage]) => {
    const next = authProfileImage || coreProfileImage
    resolvedProfileImage.value = next || ''
  },
  { immediate: true }
)

const menuItems = computed(() => {
  const baseItems: Array<{
    label: string
    to: string
    icon?: string
    children?: DropdownMenuItem[][]
  }> = []

  if (canAccessTasks.value) {
    baseItems.push({ label: 'Tasks', to: '/admin/tasks' })
  }

  if (canAccessTracking.value) {
    baseItems.push({ label: 'Tracking', to: '/admin/tracking' })
  }

  if (canAccessTools.value) {
    baseItems.push({
      label: 'Tools',
      to: '/admin/tools',
      children: [[
        { label: 'QR Code', icon: 'i-lucide-scan-line', to: '/admin/tools/qr-code' },
        { label: 'Encurtador de Link', icon: 'i-lucide-link-2', to: '/admin/tools/encurtador-link' },
        { label: 'Scripts', icon: 'i-lucide-scroll-text', to: '/admin/tools/scripts' }
      ]]
    })
  }

  if (canAccessTeam.value) {
    baseItems.push({
      label: 'Team',
      to: '/admin/team',
      children: [[
        { label: 'Treinamento', icon: 'i-lucide-graduation-cap', to: '/admin/team/treinamento' },
        { label: 'Candidatos', icon: 'i-lucide-user-check', to: '/admin/team/candidatos' }
      ]]
    })
  }

  if (canAccessSite.value) {
    baseItems.push({
      label: 'Site',
      to: '/admin/site',
      children: [[
        { label: 'Produtos', icon: 'i-lucide-layout-template', to: '/admin/site/produtos' },
        { label: 'Leads', icon: 'i-lucide-inbox', to: '/admin/site/leads' }
      ]]
    })
  }

  if (canAccessOmnichannel.value) {
    baseItems.unshift({
      label: 'Omnichannel',
      to: '/admin/omnichannel/inbox'
    })
  }

  if (canAccessFilaAtendimento.value) {
    baseItems.push({ label: 'Fila', to: '/admin/fila-atendimento' })
  }

  if (canAccessFinance.value) {
    baseItems.push({ label: 'Finance', to: '/admin/finance' })
  }

  if (canAccessMonitoring.value) {
    baseItems.push({ label: 'Monitoramento', icon: 'i-lucide-monitor-play', to: '/admin/containers' })
  }

  if (canAccessRootManage.value) {
    const rootManageChildren: DropdownMenuItem[] = [
      { label: 'Clientes', icon: 'i-lucide-users-round', to: '/admin/manage/clientes' },
      { label: 'Users', icon: 'i-lucide-user-cog', to: '/admin/manage/users' },
      { label: 'Temas', icon: 'i-lucide-palette', to: '/admin/themes' },
      { label: 'Componentes', icon: 'i-lucide-component', to: '/admin/manage/componentes' }
    ]

    if (canAccessQa.value) {
      rootManageChildren.splice(2, 0, { label: 'QA', icon: 'i-lucide-list-checks', to: '/admin/manage/qa' })
    }
    if (canAccessAudit.value) {
      rootManageChildren.push({ label: 'Auditoria', icon: 'i-lucide-activity', to: '/admin/manage/auditoria' })
    }

    return [
      ...baseItems,
      {
        label: 'Manage',
        to: '/admin/manage',
        children: [rootManageChildren]
      }
    ]
  }

  const scopedManageChildren: DropdownMenuItem[] = []
  if (canAccessUsersManage.value) {
    scopedManageChildren.push({ label: 'Users', icon: 'i-lucide-user-cog', to: '/admin/manage/users' })
  }
  if (canAccessQa.value) {
    scopedManageChildren.push({ label: 'QA', icon: 'i-lucide-list-checks', to: '/admin/manage/qa' })
  }
  if (canAccessThemes.value) {
    scopedManageChildren.push({ label: 'Temas', icon: 'i-lucide-palette', to: '/admin/themes' })
  }
  if (canAccessAudit.value) {
    scopedManageChildren.push({ label: 'Auditoria', icon: 'i-lucide-activity', to: '/admin/manage/auditoria' })
  }

  if (scopedManageChildren.length === 0) {
    return baseItems
  }

  return [
    ...baseItems,
    {
      label: 'Manage',
      to: '/admin/manage/users',
      children: [scopedManageChildren]
    }
  ]
})

const actionItems = [
  { icon: 'i-lucide-expand', label: 'Fullscreen' },
  { icon: 'i-lucide-bell', label: 'Notificacoes' }
]

const profileItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: profileDisplayName.value,
      type: 'label',
      avatar: profileAvatar.value
    }
  ],
  [
    {
      label: profileEmail.value || 'Email nao informado',
      icon: 'i-lucide-mail',
      disabled: true
    },
    {
      label: profileClientName.value,
      icon: 'i-lucide-building-2',
      disabled: true
    }
  ],
  [
    { label: 'Perfil', icon: 'i-lucide-user', to: '/admin/profile' },
    { label: 'Configuracoes', icon: 'i-lucide-settings', to: '/admin/settings' }
  ],
  [
    {
      label: 'Sair',
      icon: 'i-lucide-log-out',
      color: 'error',
      onSelect: () => {
        void logout()
      }
    }
  ]
])

async function logout() {
  await performLogout()
}

function clearSessionHeartbeat() {
  if (sessionHeartbeatTimer !== null) {
    window.clearInterval(sessionHeartbeatTimer)
    sessionHeartbeatTimer = null
  }
}

function runSessionHeartbeat(force = false) {
  if (!import.meta.client || !isAuthenticated.value) {
    return
  }

  void validateSession({
    force,
    redirectToLogin: true
  })
}

function handleWindowFocus() {
  runSessionHeartbeat(true)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    runSessionHeartbeat(true)
  }
}

function startSessionHeartbeat() {
  if (!import.meta.client) {
    return
  }

  clearSessionHeartbeat()
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (!isAuthenticated.value) {
    return
  }

  sessionHeartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      runSessionHeartbeat(true)
    }
  }, SESSION_HEARTBEAT_INTERVAL_MS)

  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function initializeSessionContext() {
  sessionSimulation.initialize()
}

async function refreshSessionContext() {
  await sessionSimulation.refreshClientOptions()
}

async function ensureCurrentRouteAccess() {
  if (!import.meta.client) {
    return
  }

  const currentPath = normalizeText(route.fullPath || route.path)
  if (!currentPath.startsWith('/admin') || isPublicAdminPath(currentPath)) {
    return
  }

  const access = evaluateAdminRouteAccess(currentPath, accessContext.value)
  if (access.allowed) {
    return
  }

  if (access.reason === 'login-required') {
    await navigateTo('/admin/login', { replace: true })
    return
  }

  const redirectPath = resolveAccessibleAdminRedirect(currentPath, accessContext.value)
  if (redirectPath === currentPath) {
    return
  }

  await navigateTo(redirectPath, { replace: true })
}

function isCurrentUserRealtimeEvent(event: { payload?: unknown }) {
  const payload = event?.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : null

  const targetCoreUserId = normalizeText(payload?.coreUserId)
  const currentCoreUserId = normalizeText(coreUser.value?.id)
  if (targetCoreUserId && currentCoreUserId && targetCoreUserId === currentCoreUserId) {
    return true
  }

  const targetEmail = normalizeText(payload?.email).toLowerCase()
  const currentEmail = normalizeText(coreUser.value?.email).toLowerCase()
  return Boolean(targetEmail) && Boolean(currentEmail) && targetEmail === currentEmail
}

const stopClientsRealtimeSubscription = realtime.subscribeEntity('clients', (event) => {
  if (Number(event.clientId || 0) > 0 && Number(event.clientId) !== Number(sessionSimulation.effectiveClientId || 0)) {
    return
  }

  void (async () => {
    await refreshSessionContext()
    await ensureCurrentRouteAccess()
  })()
})

const stopUsersRealtimeSubscription = realtime.subscribeEntity('users', (event) => {
  if (!isCurrentUserRealtimeEvent(event)) {
    return
  }

  void (async () => {
    await Promise.all([
      refreshSessionContext(),
      resolveProfileIdentity()
    ])
    await ensureCurrentRouteAccess()
  })()
})

async function resolveTenantName() {
  if (isRootAdmin.value) {
    resolvedTenantName.value = ''
    return
  }

  try {
    const tenant = await apiFetch<TenantSettings>('/tenant')
    resolvedTenantName.value = normalizeText(tenant?.name)
  } catch {
    resolvedTenantName.value = normalizeText(coreUser.value?.clientName) || normalizeText(tenantSlug.value)
  }
}

async function resolveProfileIdentity() {
  if (!profileEmail.value && !user.value && !coreUser.value) {
    return
  }

  try {
    const response = await bffFetch<AdminProfileResponse>('/api/admin/profile')
    resolvedNick.value = normalizeText(response?.data?.nick)
    resolvedProfileImage.value = normalizeText(response?.data?.profileImage)
  } catch {
    resolvedNick.value = ''
    resolvedProfileImage.value = ''
  }
}

onMounted(async () => {
  hydrate()
  initializeSessionContext()
  layoutReady.value = true
  startSessionHeartbeat()

  await nextTick()
  void Promise.allSettled([
    refreshSessionContext(),
    resolveTenantName(),
    resolveProfileIdentity()
  ])
})

onBeforeUnmount(() => {
	clearSessionHeartbeat()
	if (import.meta.client) {
		window.removeEventListener('focus', handleWindowFocus)
		document.removeEventListener('visibilitychange', handleVisibilityChange)
	}
})

watch(isAuthenticated, () => {
	startSessionHeartbeat()
})

watch(() => sessionSimulation.requestContextHash, () => {
  void ensureCurrentRouteAccess()
})

onBeforeUnmount(() => {
  stopClientsRealtimeSubscription()
  stopUsersRealtimeSubscription()
})
</script>

<template>
  <div class="admin-layout">
    <ClientOnly>
      <AdminHeader logo-title="crow" logo-subtitle="visuais" :menu-items="menuItems" :action-items="actionItems"
        :profile-name="profileDisplayName" :profile-role="profileRoleLabel" :profile-items="profileItems"
        :profile-avatar="profileAvatar" :viewer-user-type="viewerUserType" :viewer-level="viewerLevel"
        slideover-title="Menu" slideover-description="Navegacao rapida do admin." />
      <template #fallback>
        <header class="h-[72px] border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      </template>
    </ClientOnly>

    <main class="admin-layout__main">
      <section class="admin-layout__content">
        <div v-if="layoutReady">
          <slot />
        </div>
        <div v-else class="px-3 py-4 sm:px-0">
          <AppPageLoadingShell
            title="Carregando painel"
            description="Preparando autenticação, preferências e contexto do shell."
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: rgb(var(--bg));
  color: rgb(var(--text));
}

.admin-layout__main {
  width: 100%;
  margin: 0 auto;
  padding: 0 0.75rem 1rem;
}

.admin-layout__content {
  min-height: calc(100vh - 7rem);
  border-radius: var(--radius-lg);
}

@media (min-width: 640px) {
  .admin-layout__main {
    padding: 0 1rem 1.25rem;
  }
}

@media (min-width: 768px) {
  .admin-layout__main {
    padding: 0 1.25rem 1.5rem;
  }
}

@media (min-width: 1280px) {
  .admin-layout__main {
    padding: 0 0.75rem 1rem;
  }
}
</style>
