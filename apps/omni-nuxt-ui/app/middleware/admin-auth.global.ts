export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) {
    return;
  }

  if (!to.path.startsWith("/admin")) {
    return;
  }

  const loginPath = "/admin/login";
  const homePath = "/admin";
  const { isAuthenticated, hydrate } = useAuth();
  const { isAuthenticated: isCoreAuthenticated, hydrate: hydrateCoreAuth } = useCoreAuth();

  hydrate();
  hydrateCoreAuth();

  const hasAnyAdminSession = isAuthenticated.value || isCoreAuthenticated.value;

  if (to.path === loginPath) {
    if (hasAnyAdminSession) {
      return navigateTo(homePath, { replace: true });
    }
    return;
  }

  if (!hasAnyAdminSession) {
    return navigateTo(loginPath, { replace: true });
  }
});
