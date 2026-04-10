<script setup lang="ts">
import type { AvatarProps, DropdownMenuItem } from '@nuxt/ui'
import AdminSessionSimulationBar from '~/components/admin/AdminSessionSimulationBar.vue'
import adminAuthBrandLogo from '~/assets/images/logo.png'

export interface AdminHeaderMenuItem {
  label: string
  to?: string
  children?: DropdownMenuItem[][]
}

export interface AdminHeaderActionItem {
  icon: string
  label: string
  to?: string
  onClick?: () => void
}

interface AdminHeaderNavLink {
  label: string
  to: string
  icon?: string
}

interface AdminHeaderMobileSection {
  key: string
  title: string
  links: AdminHeaderNavLink[]
}

const props = withDefaults(
  defineProps<{
    logoTitle?: string
    logoSubtitle?: string
    logoTo?: string
    menuItems?: AdminHeaderMenuItem[]
    actionItems?: AdminHeaderActionItem[]
    profileName?: string
    profileRole?: string
    viewerUserType?: string
    viewerLevel?: string
    alwaysShowSessionSimulation?: boolean
    profileItems?: DropdownMenuItem[][]
    profileAvatar?: AvatarProps
    slideoverTitle?: string
    slideoverDescription?: string
    showThemeToggle?: boolean
  }>(),
  {
    logoTitle: 'crow',
    logoSubtitle: 'visuais',
    logoTo: '/',
    menuItems: () => [],
    actionItems: () => [],
    profileName: 'User',
    profileRole: '',
    viewerUserType: '',
    viewerLevel: '',
    alwaysShowSessionSimulation: false,
    profileItems: () => [],
    profileAvatar: () => ({}),
    slideoverTitle: 'Menu',
    slideoverDescription: 'Navegacao rapida do admin.',
    showThemeToggle: true
  }
)

const route = useRoute()
const sidebarOpen = ref(false)
const menuOpenState = reactive<Record<string, boolean>>({})
const menuTriggerHoverState = reactive<Record<string, boolean>>({})
const menuContentHoverState = reactive<Record<string, boolean>>({})
const menuCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const MENU_CLOSE_DELAY_MS = 180
const {
  currentTheme,
  hasCustomTheme,
  initializeFromStorage,
  applyTheme,
  getThemeLabel
} = useOmniTheme()

const resolvedAvatar = computed<AvatarProps>(() => ({
  alt: props.profileName,
  ...props.profileAvatar
}))

const canShowSessionSimulation = computed(() => {
  if (props.alwaysShowSessionSimulation) return true
  return String(props.viewerUserType || '').trim().toLowerCase() === 'admin'
    && String(props.viewerLevel || '').trim().toLowerCase() === 'admin'
})

const themeButton = computed(() => {
  if (currentTheme.value === 'dark') {
    return {
      icon: 'i-lucide-moon',
      label: getThemeLabel('dark')
    }
  }

  if (currentTheme.value === 'apple') {
    return {
      icon: 'i-lucide-sparkles',
      label: getThemeLabel('apple')
    }
  }

  if (currentTheme.value === 'custom') {
    return {
      icon: 'i-lucide-palette',
      label: getThemeLabel('custom')
    }
  }

  return {
    icon: 'i-lucide-sun',
    label: getThemeLabel('light')
  }
})

const themeMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: `Tema atual: ${themeButton.value.label}`,
      type: 'label'
    }
  ],
  [
    {
      label: getThemeLabel('light'),
      icon: 'i-lucide-sun',
      onSelect: () => applyTheme('light')
    },
    {
      label: getThemeLabel('dark'),
      icon: 'i-lucide-moon',
      onSelect: () => applyTheme('dark')
    },
    {
      label: getThemeLabel('apple'),
      icon: 'i-lucide-sparkles',
      onSelect: () => applyTheme('apple')
    },
    {
      label: getThemeLabel('custom'),
      icon: 'i-lucide-palette',
      disabled: !hasCustomTheme.value,
      onSelect: () => applyTheme('custom')
    }
  ]
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function resolveMobileLink(item: Partial<DropdownMenuItem>): AdminHeaderNavLink | null {
  const label = normalizeText(item.label)
  const to = normalizeText(item.to)
  if (!label || !to) {
    return null
  }

  const icon = normalizeText((item as { icon?: unknown }).icon)
  return {
    label,
    to,
    icon: icon || undefined
  }
}

function flattenMenuChildren(children?: DropdownMenuItem[][]) {
  if (!children?.length) {
    return [] as AdminHeaderNavLink[]
  }

  const output: AdminHeaderNavLink[] = []
  const seen = new Set<string>()

  for (const group of children) {
    for (const child of group) {
      const link = resolveMobileLink(child)
      if (!link) {
        continue
      }

      const key = `${link.label}::${link.to}`
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      output.push(link)
    }
  }

  return output
}

const mobilePrimaryLinks = computed<AdminHeaderNavLink[]>(() =>
  props.menuItems
    .filter(item => !item.children?.length && normalizeText(item.to) !== '')
    .map(item => ({
      label: item.label,
      to: String(item.to),
      icon: undefined
    }))
)

const mobileMenuSections = computed<AdminHeaderMobileSection[]>(() =>
  props.menuItems
    .filter(item => item.children?.length)
    .map((item) => ({
      key: getMenuItemKey(item),
      title: item.label,
      links: flattenMenuChildren(item.children)
    }))
    .filter(section => section.links.length > 0)
)

const slideoverActionItems = computed(() =>
  props.actionItems.filter(action => Boolean(normalizeText(action.to)) || typeof action.onClick === 'function')
)

function routeMatches(target?: string) {
  if (!target) return false
  return route.path === target || route.path.startsWith(`${target}/`)
}

function branchHasActiveRoute(children?: DropdownMenuItem[][]) {
  if (!children?.length) return false

  for (const group of children) {
    for (const child of group) {
      const childTo = typeof child?.to === 'string' ? child.to : ''
      if (routeMatches(childTo)) {
        return true
      }

      const nestedChildren = Array.isArray(child?.children) ? child.children : undefined
      if (nestedChildren && branchHasActiveRoute([nestedChildren as DropdownMenuItem[]])) {
        return true
      }
    }
  }

  return false
}

function isItemActive(item: AdminHeaderMenuItem) {
  if (routeMatches(item.to)) {
    return true
  }

  if (item.children?.length) {
    return branchHasActiveRoute(item.children)
  }

  return false
}

function getMenuItemKey(item: AdminHeaderMenuItem) {
  return `${item.label}::${item.to ?? ''}`
}

function isDesktopMenuMode() {
  if (!import.meta.client) return false
  return window.matchMedia('(min-width: 1280px)').matches
}

function clearMenuCloseTimer(key: string) {
  const timer = menuCloseTimers.get(key)
  if (!timer) return
  clearTimeout(timer)
  menuCloseTimers.delete(key)
}

function isMenuPointerInsideByKey(key: string) {
  return Boolean(menuTriggerHoverState[key] || menuContentHoverState[key])
}

function scheduleMenuCloseByKey(key: string) {
  clearMenuCloseTimer(key)
  menuCloseTimers.set(
    key,
    setTimeout(() => {
      if (isMenuPointerInsideByKey(key)) {
        menuCloseTimers.delete(key)
        return
      }
      menuOpenState[key] = false
      menuCloseTimers.delete(key)
    }, MENU_CLOSE_DELAY_MS)
  )
}

function setMenuOpen(item: AdminHeaderMenuItem, open: boolean) {
  const key = getMenuItemKey(item)
  if (open) {
    Object.keys(menuOpenState).forEach((menuKey) => {
      if (menuKey === key) return
      menuOpenState[menuKey] = false
      menuTriggerHoverState[menuKey] = false
      menuContentHoverState[menuKey] = false
      clearMenuCloseTimer(menuKey)
    })
    clearMenuCloseTimer(key)
  }
  menuOpenState[key] = open
}

function onMenuMouseEnter(item: AdminHeaderMenuItem) {
  if (!isDesktopMenuMode()) return
  const key = getMenuItemKey(item)
  menuTriggerHoverState[key] = true
  setMenuOpen(item, true)
}

function onMenuMouseLeave(item: AdminHeaderMenuItem) {
  if (!isDesktopMenuMode()) return
  const key = getMenuItemKey(item)
  menuTriggerHoverState[key] = false
  scheduleMenuCloseByKey(key)
}

function onMenuContentEnter(item: AdminHeaderMenuItem) {
  if (!isDesktopMenuMode()) return
  const key = getMenuItemKey(item)
  menuContentHoverState[key] = true
  clearMenuCloseTimer(key)
  setMenuOpen(item, true)
}

function onMenuContentLeave(item: AdminHeaderMenuItem) {
  if (!isDesktopMenuMode()) return
  const key = getMenuItemKey(item)
  menuContentHoverState[key] = false
  scheduleMenuCloseByKey(key)
}

function getMenuContentConfig(item: AdminHeaderMenuItem) {
  return {
    align: 'start',
    sideOffset: 2,
    collisionPadding: 8,
    onPointerenter: () => onMenuContentEnter(item),
    onPointerleave: () => onMenuContentLeave(item)
  } as any
}

function onMenuOpenUpdate(item: AdminHeaderMenuItem, open: boolean) {
  if (open) {
    setMenuOpen(item, true)
    return
  }

  if (isDesktopMenuMode()) {
    const key = getMenuItemKey(item)
    if (isMenuPointerInsideByKey(key)) {
      menuOpenState[key] = true
      return
    }
    scheduleMenuCloseByKey(key)
    return
  }

  setMenuOpen(item, false)
}

function closeSidebar() {
  sidebarOpen.value = false
}

function onMobileActionSelect(action: AdminHeaderActionItem) {
  closeSidebar()
  action.onClick?.()
}

function closeAllMenus() {
  Object.keys(menuOpenState).forEach((key) => {
    menuOpenState[key] = false
    menuTriggerHoverState[key] = false
    menuContentHoverState[key] = false
    clearMenuCloseTimer(key)
  })
}

watch(
  () => route.path,
  () => {
    closeSidebar()
    closeAllMenus()
  }
)

onMounted(() => {
  initializeFromStorage()
})

onBeforeUnmount(() => {
  closeAllMenus()
})
</script>

<template>
  <header class="admin-header">
    <div class="admin-header__row">
      <div class="admin-header__brand">
        <div class="admin-header__brand-inner admin-header__brand-inner--standalone">
          <UButton
            icon="i-lucide-menu"
            color="neutral"
            variant="ghost"
            aria-label="Abrir menu lateral"
            class="admin-header__icon-btn admin-header__menu-toggle-btn admin-header__menu-toggle-btn--brand"
            @click="sidebarOpen = true"
          />

          <NuxtLink :to="logoTo" class="admin-header__brand-link">
            <img :src="adminAuthBrandLogo" :alt="logoTitle || 'Plataforma'" class="admin-header__brand-logo">
          </NuxtLink>
        </div>
      </div>

      <div class="admin-header__panel">
        <div class="admin-header__panel-start">
          <div class="admin-header__brand-inner admin-header__brand-inner--panel">
            <UButton
              icon="i-lucide-menu"
              color="neutral"
              variant="ghost"
              aria-label="Abrir menu lateral"
              class="admin-header__icon-btn admin-header__menu-toggle-btn"
              @click="sidebarOpen = true"
            />

            <NuxtLink :to="logoTo" class="admin-header__brand-link">
              <img :src="adminAuthBrandLogo" :alt="logoTitle || 'Plataforma'" class="admin-header__brand-logo">
            </NuxtLink>
          </div>
        </div>

        <nav class="admin-header__nav h-full">
          <template v-for="item in menuItems" :key="item.label">
            <div
              v-if="item.children?.length"
              class="admin-header__menu-item h-full"
              @mouseenter="onMenuMouseEnter(item)"
              @mouseleave="onMenuMouseLeave(item)"
            >
              <UDropdownMenu
                :items="item.children"
                :open="Boolean(menuOpenState[getMenuItemKey(item)])"
                :modal="false"
                :portal="false"
                :content="getMenuContentConfig(item)"
                :ui="{ content: 'w-60 admin-header__menu-dropdown-content' }"
                @update:open="onMenuOpenUpdate(item, $event)"
              >
                <template #default>
                  <UButton
                    :label="item.label"
                    color="neutral"
                    variant="ghost"
                    trailing-icon="i-lucide-chevron-down"
                    class="admin-header__menu-btn admin-header__nav-btn admin-header__nav-btn--group h-full"
                    :class="[
                      isItemActive(item) ? 'is-active' : '',
                      Boolean(menuOpenState[getMenuItemKey(item)]) ? 'is-open' : ''
                    ]"
                  />
                </template>
              </UDropdownMenu>
            </div>

            <NuxtLink v-else-if="item.to" :to="item.to" class="h-full">
              <UButton
                :label="item.label"
                color="neutral"
                variant="ghost"
                class="admin-header__menu-btn admin-header__nav-btn h-full"
                :class="isItemActive(item) ? 'is-active' : ''"
              />
            </NuxtLink>
          </template>
        </nav>

        <div class="admin-header__spacer" />

        <div class="admin-header__actions">
          <UDropdownMenu
            v-if="showThemeToggle"
            :items="themeMenuItems"
            :modal="false"
            :content="{ align: 'end' }"
            :ui="{ content: 'w-52' }"
          >
            <UButton
              :icon="themeButton.icon"
              color="neutral"
              variant="ghost"
              :aria-label="`Selecionar tema. Tema atual: ${themeButton.label}`"
              class="admin-header__icon-btn admin-header__action-btn admin-header__action-btn--theme admin-header__theme-btn"
            />
          </UDropdownMenu>

          <template v-for="action in actionItems" :key="action.label">
            <NuxtLink v-if="action.to" :to="action.to" class="admin-header__utility-action">
              <UButton
                :icon="action.icon"
                color="neutral"
                variant="ghost"
                :aria-label="action.label"
                class="admin-header__icon-btn admin-header__action-btn"
              />
            </NuxtLink>

            <UButton
              v-else
              :icon="action.icon"
              color="neutral"
              variant="ghost"
              :aria-label="action.label"
              class="admin-header__icon-btn admin-header__action-btn admin-header__utility-action"
              @click="action.onClick?.()"
            />
          </template>

          <div class="admin-header__profile-wrap">
            <UDropdownMenu :items="profileItems" :modal="false" :content="{ align: 'end' }" :ui="{ content: 'w-56' }">
              <UButton color="neutral" variant="ghost" class="admin-header__profile-btn admin-header__profile-trigger-btn">
                <template #default>
                  <div class="admin-header__profile-content">
                    <div class="admin-header__profile-text">
                      <p class="admin-header__profile-name">{{ profileName }}</p>
                      <p class="admin-header__profile-role">{{ profileRole }}</p>
                    </div>
                    <UAvatar v-bind="resolvedAvatar" size="md" class="admin-header__avatar" />
                  </div>
                </template>
              </UButton>

              <template v-if="canShowSessionSimulation" #content-bottom>
                <div class="admin-header__profile-session">
                  <AdminSessionSimulationBar compact :show-summary="false" :show-refresh="false" title="Sessao simulada" />
                </div>
              </template>
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </div>

    <USlideover
      v-model:open="sidebarOpen"
      side="left"
      :title="slideoverTitle"
      :description="slideoverDescription"
      :ui="{ content: 'w-full sm:w-[22rem]' }"
    >
      <template #body>
        <div class="admin-header__mobile-nav">
          <section v-if="mobilePrimaryLinks.length" class="admin-header__mobile-section">
            <p class="admin-header__mobile-section-title">Navegacao</p>

            <div class="admin-header__mobile-links">
              <NuxtLink
                v-for="link in mobilePrimaryLinks"
                :key="`mobile-link-${link.to}`"
                :to="link.to"
                @click="closeSidebar()"
              >
                <UButton
                  :label="link.label"
                  :icon="link.icon"
                  color="neutral"
                  variant="ghost"
                  block
                  class="admin-header__mobile-btn admin-header__mobile-nav-btn admin-header__mobile-link"
                  :class="routeMatches(link.to) ? 'is-active' : ''"
                />
              </NuxtLink>
            </div>
          </section>

          <section
            v-for="section in mobileMenuSections"
            :key="section.key"
            class="admin-header__mobile-section"
          >
            <p class="admin-header__mobile-section-title">{{ section.title }}</p>

            <div class="admin-header__mobile-links">
              <NuxtLink
                v-for="link in section.links"
                :key="`${section.key}:${link.to}`"
                :to="link.to"
                @click="closeSidebar()"
              >
                <UButton
                  :label="link.label"
                  :icon="link.icon"
                  color="neutral"
                  variant="ghost"
                  block
                  class="admin-header__mobile-btn admin-header__mobile-nav-btn admin-header__mobile-link"
                  :class="routeMatches(link.to) ? 'is-active' : ''"
                />
              </NuxtLink>
            </div>
          </section>

          <section v-if="slideoverActionItems.length" class="admin-header__mobile-section">
            <p class="admin-header__mobile-section-title">Acoes rapidas</p>

            <div class="admin-header__mobile-links">
              <template v-for="action in slideoverActionItems" :key="`mobile-action-${action.label}`">
                <NuxtLink v-if="action.to" :to="action.to" @click="closeSidebar()">
                  <UButton
                    :label="action.label"
                    :icon="action.icon"
                    color="neutral"
                    variant="ghost"
                    block
                    class="admin-header__mobile-btn admin-header__mobile-action-btn admin-header__mobile-link"
                  />
                </NuxtLink>

                <UButton
                  v-else
                  :label="action.label"
                  :icon="action.icon"
                  color="neutral"
                  variant="ghost"
                  block
                  class="admin-header__mobile-btn admin-header__mobile-action-btn admin-header__mobile-link"
                  @click="onMobileActionSelect(action)"
                />
              </template>
            </div>
          </section>

          <section v-if="canShowSessionSimulation" class="admin-header__mobile-section">
            <p class="admin-header__mobile-section-title">Sessao simulada</p>

            <div class="admin-header__mobile-session">
              <AdminSessionSimulationBar compact :show-summary="false" :show-refresh="false" title="Sessao simulada" />
            </div>
          </section>
        </div>
      </template>
    </USlideover>
  </header>
</template>
