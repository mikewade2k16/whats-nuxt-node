export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return
  }

  const path = String(to.path || '')
  if (!path.startsWith('/admin')) {
    return
  }

  const coreAuth = useCoreAuthStore()
  coreAuth.hydrate()
  const auth = useAuthStore()
  auth.hydrate()

  const sessionSimulation = useSessionSimulationStore()
  sessionSimulation.initialize()

  const authReady = Boolean(auth.isAuthenticated)
  const coreAuthReady = Boolean(coreAuth.isAuthenticated)
  if (authReady !== coreAuthReady) {
    auth.clearSession()
    coreAuth.clearSession()
    sessionSimulation.reset()

    if (path === '/admin/login') {
      return
    }

    return navigateTo({
      path: '/admin/login',
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true })
  }

  if (coreAuth.token && (!sessionSimulation.modulesHydrated || !sessionSimulation.lastClientOptionsSyncAt)) {
    await sessionSimulation.refreshClientOptions()
  }

  const access = evaluateAdminRouteAccess(path, {
    isAuthenticated: Boolean(auth.isAuthenticated || coreAuth.isAuthenticated),
    isRootUser: Boolean(sessionSimulation.profileIsPlatformAdmin || coreAuth.user?.isPlatformAdmin),
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
    auth.clearSession()
    coreAuth.clearSession()
    sessionSimulation.reset()
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
