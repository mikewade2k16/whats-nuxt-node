import { useAdminSession } from "~/composables/useAdminSession";

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return;
  }

  if (!to.path.startsWith("/admin")) {
    return;
  }

  const loginPath = "/admin/login";
  const homePath = "/admin";
  const isPublicPath = isPublicAdminPath(to.path);
  const { isAuthenticated, hasSessionMismatch, hydrate, clearSession, restoreRememberedSession, validateSession } = useAdminSession();

  hydrate();
  if (hasSessionMismatch.value) {
    clearSession();
  }

  if (!isAuthenticated.value) {
    await restoreRememberedSession();
  }

  if (isPublicPath) {
    if (isAuthenticated.value) {
      return navigateTo(homePath, { replace: true });
    }
    return;
  }

  if (isAuthenticated.value) {
    const valid = await validateSession();
    if (!valid) {
      return;
    }
  }

  if (!isAuthenticated.value) {
    return navigateTo({
      path: loginPath,
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true });
  }
});
