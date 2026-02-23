export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, hydrate } = useAuth();

  if (import.meta.client) {
    hydrate();
  }

  if (to.path === "/login") {
    if (isAuthenticated.value) {
      return navigateTo("/");
    }
    return;
  }

  if (!isAuthenticated.value) {
    return navigateTo("/login");
  }
});
