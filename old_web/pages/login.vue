<script setup lang="ts">
import type { AuthUser } from "~/types";
import { UAlert, UButton, UCard, UFormField, UInput } from "#components";

const { setSession, isAuthenticated } = useAuth();
const { apiFetch } = useApi();

const form = reactive({
  tenantSlug: "demo",
  email: "admin@demo.local",
  password: "123456"
});

const isLoading = ref(false);
const errorMessage = ref("");

if (isAuthenticated.value) {
  await navigateTo("/");
}

async function submit() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: form
    });

    setSession(response.token, response.user);
    await navigateTo("/");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao autenticar";
    errorMessage.value = message;
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
          <h1 class="login-page__title">Omnichannel MVP</h1>
          <p class="login-page__subtitle">
            Login multi-tenant para testes locais
          </p>
        </div>
      </template>

      <form class="login-page__form" @submit.prevent="submit">
        <UFormField label="Tenant" name="tenantSlug">
          <UInput v-model="form.tenantSlug" placeholder="demo" />
        </UFormField>

        <UFormField label="Email" name="email">
          <UInput v-model="form.email" type="email" placeholder="admin@demo.local" />
        </UFormField>

        <UFormField label="Senha" name="password">
          <UInput v-model="form.password" type="password" placeholder="123456" />
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
