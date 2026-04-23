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
  if (import.meta.dev && import.meta.client) {
    console.info("[admin-feature-debug] enter", {
      path: to.fullPath,
      isAuthenticated: isAuthenticated.value
    })
  }
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

  if (isAuthenticated.value && !sessionSimulation.clientOptionsSynced) {
    if (import.meta.dev && import.meta.client) {
      console.info("[admin-feature-debug] refresh-start", {
        path: to.fullPath,
        isAuthenticated: isAuthenticated.value
      })
    }
    await sessionSimulation.refreshClientOptions()
    if (import.meta.dev && import.meta.client) {
      console.info("[admin-feature-debug] refresh-done", {
        path: to.fullPath,
        isAuthenticated: isAuthenticated.value,
        clientOptionsSynced: sessionSimulation.clientOptionsSynced
      })
    }
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
    if (import.meta.dev && import.meta.client) {
      console.info("[admin-feature-debug] login-required", {
        path: to.fullPath,
        isAuthenticated: isAuthenticated.value,
        profileUserType: sessionSimulation.profileUserType,
        profileUserLevel: sessionSimulation.profileUserLevel
      })
    }
    clearSession()
    return navigateTo({
      path: '/admin/login',
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true })
  }

  if (import.meta.dev && import.meta.client) {
    console.info("[admin-feature-debug] access-denied", {
      path: to.fullPath,
      reason: access.reason,
      featureCode: access.featureCode
    })
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
