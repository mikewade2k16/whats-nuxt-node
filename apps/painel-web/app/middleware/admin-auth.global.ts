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

  if (import.meta.dev && import.meta.client) {
    console.info("[admin-auth-debug] enter", {
      path: to.fullPath,
      isPublicPath,
      isAuthenticated: isAuthenticated.value
    });
  }

  hydrate();
  if (hasSessionMismatch.value) {
    clearSession();
  }

  if (!isAuthenticated.value) {
    await restoreRememberedSession();
  }

  if (isPublicPath) {
    if (isAuthenticated.value) {
      if (import.meta.dev && import.meta.client) {
        console.info("[admin-auth-debug] public->home", {
          path: to.fullPath
        });
      }
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
    if (import.meta.dev && import.meta.client) {
      console.info("[admin-auth-debug] redirect-login", {
        path: to.fullPath
      });
    }
    return navigateTo({
      path: loginPath,
      query: isSafeAdminRedirectPath(to.fullPath)
        ? { redirect: to.fullPath }
        : undefined
    }, { replace: true });
  }
});
