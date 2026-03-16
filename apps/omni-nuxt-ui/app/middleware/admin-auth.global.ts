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

  hydrate();

  if (to.path === loginPath) {
    if (isAuthenticated.value) {
      return navigateTo(homePath, { replace: true });
    }
    return;
  }

  if (!isAuthenticated.value) {
    return navigateTo(loginPath, { replace: true });
  }
});
