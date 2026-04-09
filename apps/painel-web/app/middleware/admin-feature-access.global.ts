import { useAdminSession } from "~/composables/useAdminSession";

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return
  }

  const path = String(to.path || '')
  if (!path.startsWith('/admin')) {
    return
  }

  const { isAuthenticated, hasSessionMismatch, hydrate, clearSession, coreUser, restoreRememberedSession } = useAdminSession()
  hydrate()

  if (!isAuthenticated.value) {
    await restoreRememberedSession()
  }

  const sessionSimulation = useSessionSimulationStore()
  sessionSimulation.initialize()

  if (hasSessionMismatch.value) {
    clearSession()

    if (isPublicAdminPath(path)) {
      return
    }

    return navigateTo({
      path: '/admin/login',
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true })
  }

  if (isAuthenticated.value && (!sessionSimulation.modulesHydrated || !sessionSimulation.lastClientOptionsSyncAt)) {
    await sessionSimulation.refreshClientOptions()
  }

  const access = evaluateAdminRouteAccess(path, {
    isAuthenticated: Boolean(isAuthenticated.value),
    isRootUser: Boolean(sessionSimulation.profileIsPlatformAdmin || coreUser.value?.isPlatformAdmin),
    profileUserType: sessionSimulation.profileUserType,
    profileUserLevel: sessionSimulation.profileUserLevel,
    sessionUserType: sessionSimulation.userType,
    sessionUserLevel: sessionSimulation.userLevel,
    preferences: sessionSimulation.profilePreferences,
    hasModule: moduleCode => sessionSimulation.hasModule(moduleCode)
  })

  if (access.allowed) {
    return
  }

  if (access.reason === 'login-required') {
    clearSession()
    return navigateTo({
      path: '/admin/login',
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true })
  }

  return navigateTo({
    path: '/admin/access-denied',
    query: {
      reason: access.reason,
      feature: access.featureCode,
      from: to.fullPath,
      ts: String(Date.now())
    }
  }, { replace: true })
})
