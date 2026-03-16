<script setup lang="ts">
import type { AuthUser } from "~/types";
import type { CoreAuthUser } from "~/types/core";

definePageMeta({
  layout: false
});

const route = useRoute();
const { isAuthenticated, hydrate, setSession } = useAuth();
const { setSession: setCoreSession, clearSession: clearCoreSession } = useCoreAuth();
const { apiFetch } = useApi();

const devDefaultLogin = {
  email: "root@core.local",
  password: "123456"
} as const;

const form = reactive({
  email: import.meta.dev ? devDefaultLogin.email : "",
  password: import.meta.dev ? devDefaultLogin.password : ""
});

const isLoading = ref(false);
const errorMessage = ref("");
const SENSITIVE_QUERY_KEYS = ["tenantSlug", "email", "password"] as const;

const redirectAfterLogin = computed(() => {
  const raw = route.query.redirect;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSafeAdminRedirectPath(value) ? String(value) : "/admin";
});

function hasSensitiveQueryParams() {
  return SENSITIVE_QUERY_KEYS.some((key) => {
    const rawValue = route.query[key];
    if (Array.isArray(rawValue)) {
      return rawValue.some((entry) => String(entry ?? "").trim().length > 0);
    }
    return String(rawValue ?? "").trim().length > 0;
  });
}

onMounted(async () => {
  hydrate();

  if (hasSensitiveQueryParams()) {
    await navigateTo("/admin/login", { replace: true });
    return;
  }

  if (isAuthenticated.value) {
    await navigateTo(redirectAfterLogin.value, { replace: true });
  }
});

async function submit() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiFetch<{
      token: string;
      user: AuthUser;
      coreAccessToken?: string;
      coreUser?: CoreAuthUser;
    }>("/auth/login", {
      method: "POST",
      body: {
        email: form.email,
        password: form.password
      }
    });

    setSession(response.token, response.user);
    if (response.coreAccessToken && response.coreUser) {
      setCoreSession(response.coreAccessToken, response.coreUser);
    } else {
      clearCoreSession();
    }
    await navigateTo(redirectAfterLogin.value, { replace: true });
  } catch (error: unknown) {
    clearCoreSession();
    errorMessage.value = error instanceof Error ? error.message : "Falha ao autenticar";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <UCard class="login-page__card">
      <template #header>
        <div class="login-page__header">
          <h1 class="login-page__title">Painel Admin</h1>
          <p class="login-page__subtitle">
            Login centralizado no platform-core (Go)
          </p>
        </div>
      </template>

      <form class="login-page__form" method="post" novalidate onsubmit="return false;" @submit.prevent="submit">
        <UFormField label="Email">
          <UInput v-model="form.email" type="email" placeholder="admin@demo.local" autocomplete="username" />
        </UFormField>

        <UFormField label="Senha">
          <UInput v-model="form.password" type="password" placeholder="123456" autocomplete="current-password" />
        </UFormField>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
        />

        <UButton block type="submit" :loading="isLoading">
          Entrar
        </UButton>
      </form>
    </UCard>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.login-page__card {
  width: min(100%, 28rem);
}

.login-page__header {
  display: grid;
  gap: 0.25rem;
}

.login-page__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.login-page__subtitle {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.875rem;
}

.login-page__form {
  display: grid;
  gap: 1rem;
}
</style>
