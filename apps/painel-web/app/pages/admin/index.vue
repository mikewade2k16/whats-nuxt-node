<script setup lang="ts">
import { useAdminSession } from "~/composables/useAdminSession";

definePageMeta({
  layout: "admin"
});

const sessionSimulation = useSessionSimulationStore();
const { isAuthenticated, coreUser } = useAdminSession();
const redirecting = ref(false);
const sessionContextReady = computed(() => !sessionSimulation.loadingClientOptions && sessionSimulation.clientOptionsSynced);

const redirectTarget = computed(() => {
  if (!isAuthenticated.value) {
    return "/admin/login";
  }

  return resolveAccessibleAdminRedirect("/admin", {
    isAuthenticated: true,
    isRootUser: Boolean(sessionSimulation.profileIsPlatformAdmin || coreUser.value?.isPlatformAdmin),
    profileUserType: sessionSimulation.profileUserType,
    profileUserLevel: sessionSimulation.profileUserLevel,
    sessionUserType: sessionSimulation.userType,
    sessionUserLevel: sessionSimulation.userLevel,
    preferences: sessionSimulation.profilePreferences,
    hasModule: (moduleCode) => sessionSimulation.hasModule(moduleCode)
  });
});

watchEffect(() => {
  if (!import.meta.client || redirecting.value) {
    return;
  }

  if (isAuthenticated.value && !sessionContextReady.value) {
    return;
  }

  const target = String(redirectTarget.value || "").trim();
  if (!target || target === "/admin") {
    return;
  }

  redirecting.value = true;
  void navigateTo(target, { replace: true }).finally(() => {
    redirecting.value = false;
  });
});
</script>

<template>
  <section class="admin-home-redirect">
    <UCard>
      <template #header>
        <h1 class="admin-home-redirect__title">Redirecionando painel</h1>
      </template>

      <p class="admin-home-redirect__text">
        Abrindo a primeira area disponivel para o seu contexto atual.
      </p>
    </UCard>
  </section>
</template>

<style scoped>
.admin-home-redirect {
  display: grid;
  gap: 1rem;
}

.admin-home-redirect__title {
  margin: 0;
}

.admin-home-redirect__text {
  margin: 0;
  color: rgb(var(--muted));
}
</style>
