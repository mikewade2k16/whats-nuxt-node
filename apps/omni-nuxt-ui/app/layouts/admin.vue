<script setup lang="ts">
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
const { user, clearSession, hydrate: hydrateAuth } = useAuth()
const { user: coreUser, clearSession: clearCoreSession, hydrate: hydrateCoreAuth } = useCoreAuth()
const { apiFetch } = useApi()
const { bffFetch } = useBffFetch()

const layoutReady = ref(false)
const resolvedTenantName = ref('')
const resolvedNick = ref('')
const resolvedProfileImage = ref('')

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const isRootAdmin = computed(() => Boolean(coreUser.value?.isPlatformAdmin))
const accessContext = computed(() => ({
  isAuthenticated: Boolean(user.value || coreUser.value),
  isRootUser: isRootAdmin.value,
  profileUserType: sessionSimulation.profileUserType,
  profileUserLevel: sessionSimulation.profileUserLevel,
  sessionUserType: sessionSimulation.userType,
  sessionUserLevel: sessionSimulation.userLevel,
  preferences: sessionSimulation.profilePreferences,
  hasModule: moduleCode => sessionSimulation.hasModule(moduleCode)
}))
const accessFlags = computed(() => resolveAdminAccessFlags(accessContext.value))
const canAccessRootManage = computed(() => evaluateAdminRouteAccess('/admin/manage/clientes', accessContext.value).allowed)
const canAccessUsersManage = computed(() => evaluateAdminRouteAccess('/admin/manage/users', accessContext.value).allowed)
const canAccessQa = computed(() => evaluateAdminRouteAccess('/admin/manage/qa', accessContext.value).allowed)
const canAccessThemes = computed(() => accessFlags.value.canAccessThemes)
const canAccessMonitoring = computed(() => evaluateAdminRouteAccess('/admin/containers', accessContext.value).allowed)
const canAccessOmnichannel = computed(() => evaluateAdminRouteAccess('/admin/omnichannel/inbox', accessContext.value).allowed)
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

  const tenantName = normalizeText(resolvedTenantName.value)
  if (tenantName) return tenantName

  const slug = normalizeText(user.value?.tenantSlug)
  if (slug) return slug

  return 'Cliente'
})

const profileRoleLabel = computed(() => {
  const localRole = normalizeText(user.value?.role).toLowerCase()
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
      to: '/admin/omnichannel/inbox',
      children: [[
        { label: 'Inbox', icon: 'i-lucide-message-square', to: '/admin/omnichannel/inbox' },
        { label: 'Operacao', icon: 'i-lucide-settings-2', to: '/admin/omnichannel/operacao' },
        { label: 'Docs', icon: 'i-lucide-file-text', to: '/admin/omnichannel/docs' }
      ]]
    })
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
  { icon: 'i-lucide-bell', label: 'Notificacoes' },
  { icon: 'i-lucide-settings', label: 'Configuracoes', to: '/admin/settings' }
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
  clearSession()
  clearCoreSession()
  sessionSimulation.reset()
  await navigateTo('/admin/login', { replace: true })
}

async function applySessionContext() {
  sessionSimulation.initialize()
  await sessionSimulation.refreshClientOptions()
}

async function resolveTenantName() {
  if (isRootAdmin.value) {
    resolvedTenantName.value = ''
    return
  }

  try {
    const tenant = await apiFetch<TenantSettings>('/tenant')
    resolvedTenantName.value = normalizeText(tenant?.name)
  } catch {
    resolvedTenantName.value = normalizeText(user.value?.tenantSlug)
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
  hydrateAuth()
  hydrateCoreAuth()
  try {
    await applySessionContext()
    await resolveTenantName()
    await resolveProfileIdentity()
  } finally {
    layoutReady.value = true
  }
})
</script>

<template>
  <div class="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
    <ClientOnly>
      <AdminHeader logo-title="crow" logo-subtitle="visuais" :menu-items="menuItems" :action-items="actionItems"
        :profile-name="profileDisplayName" :profile-role="profileRoleLabel" :profile-items="profileItems"
        :profile-avatar="profileAvatar" :viewer-user-type="viewerUserType" :viewer-level="viewerLevel"
        slideover-title="Menu" slideover-description="Navegacao rapida do admin." />
      <template #fallback>
        <header class="h-[72px] border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      </template>
    </ClientOnly>

    <main class="mx-auto w-full  px-1 pb-2 sm:px-6 lg:px-3">
      <section class="min-h-[calc(100vh-6.5rem)] rounded-[var(--radius-lg)] ">
        <div v-if="layoutReady">
          <slot />
        </div>
        <div v-else class="space-y-4 px-3 py-4 sm:px-0">
          <div class="rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <div class="space-y-3">
              <USkeleton class="h-6 w-40" />
              <USkeleton class="h-4 w-72" />
            </div>
          </div>
          <div class="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <div class="rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <div class="space-y-3">
                <USkeleton class="h-10 w-full" />
                <USkeleton class="h-10 w-full" />
                <USkeleton class="h-10 w-full" />
              </div>
            </div>
            <div class="rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <div class="space-y-3">
                <USkeleton class="h-8 w-48" />
                <USkeleton class="h-52 w-full" />
                <USkeleton class="h-10 w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
