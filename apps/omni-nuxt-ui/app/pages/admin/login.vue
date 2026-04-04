<script setup lang="ts">
import type { AuthUser } from "~/types";
import type { CoreAuthUser, CoreLoginResponse } from "~/types/core";

definePageMeta({
  layout: false
});

const route = useRoute();
const { isAuthenticated, hydrate, setSession, clearSession } = useAuth();
const { isAuthenticated: isCoreAuthenticated, hydrate: hydrateCoreAuth, setSession: setCoreSession, clearSession: clearCoreSession } = useCoreAuth();
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
const showPassword = ref(false);
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
  hydrateCoreAuth();

  if (hasSensitiveQueryParams()) {
    await navigateTo("/admin/login", { replace: true });
    return;
  }

  if (isAuthenticated.value || isCoreAuthenticated.value) {
    await navigateTo(redirectAfterLogin.value, { replace: true });
  }
});

async function submit() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    clearSession();
    clearCoreSession();

    const coreLogin = await $fetch<CoreLoginResponse>("/api/core-bff/core/auth/login", {
      method: "POST",
      body: {
        email: form.email,
        password: form.password
      }
    });

    setCoreSession(coreLogin.accessToken, coreLogin.user as CoreAuthUser);

    const response = await apiFetch<{
      token: string;
      user: AuthUser;
    }>("/auth/session", {
      method: "POST",
      headers: {
        "x-core-token": coreLogin.accessToken
      }
    });

    setSession(response.token, response.user);
    await navigateTo(redirectAfterLogin.value, { replace: true });
  } catch (error: unknown) {
    clearSession();
    clearCoreSession();
    errorMessage.value = error instanceof Error ? error.message : "Credenciais inválidas";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="login-logo__icon">
          <circle cx="24" cy="24" r="24" fill="white" fill-opacity="0.08" />
          <path d="M16 24C16 19.582 19.582 16 24 16C26.21 16 28.21 16.895 29.657 18.343" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M32 24C32 28.418 28.418 32 24 32C21.79 32 19.79 31.105 18.343 29.657" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="24" cy="24" r="3" fill="white"/>
        </svg>
        <span class="login-logo__name">Plataforma</span>
      </div>

      <form class="login-form" method="post" novalidate onsubmit="return false;" @submit.prevent="submit">
        <div class="login-field">
          <input
            v-model="form.email"
            type="email"
            placeholder="Login"
            autocomplete="username"
            class="login-input"
            :disabled="isLoading"
          />
        </div>

        <div class="login-field login-field--password">
          <input
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password"
            autocomplete="current-password"
            class="login-input"
            :disabled="isLoading"
          />
          <button
            type="button"
            class="login-eye-btn"
            :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
            @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>

        <div class="login-options">
          <label class="login-remember">
            <input type="checkbox" class="login-remember__check" autocomplete="off" />
            <span>Lembrar senha</span>
          </label>
          <a href="#" class="login-forgot">esqueceu a senha?</a>
        </div>

        <Transition name="fade">
          <div v-if="errorMessage" class="login-error">
            {{ errorMessage }}
          </div>
        </Transition>

        <button type="submit" class="login-submit" :disabled="isLoading">
          <span v-if="!isLoading">Entrar</span>
          <span v-else class="login-submit__spinner" />
        </button>

        <p class="login-register">
          Não tem uma conta?
          <a href="#" class="login-register__link">Criar conta</a>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background-color: #0f1117;
  padding: 1rem;
}

.login-card {
  width: min(100%, 26rem);
  background: #181b24;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 1rem;
  padding: 2.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Logo */
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.login-logo__icon {
  width: 3rem;
  height: 3rem;
}

.login-logo__name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-field {
  position: relative;
}

.login-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1117;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: #fff;
  font-size: 0.9375rem;
  padding: 0.75rem 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.login-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.login-input:focus {
  border-color: rgba(255, 255, 255, 0.3);
}

.login-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Password toggle */
.login-field--password .login-input {
  padding-right: 2.75rem;
}

.login-eye-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.35);
  padding: 0.25rem;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.login-eye-btn:hover {
  color: rgba(255, 255, 255, 0.7);
}

.login-eye-btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

/* Options row */
.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.45);
}

.login-remember {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.login-remember__check {
  width: 0.875rem;
  height: 0.875rem;
  cursor: pointer;
  accent-color: #6c63ff;
}

.login-forgot {
  color: rgba(255, 255, 255, 0.45);
  text-decoration: none;
  transition: color 0.2s;
}

.login-forgot:hover {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: underline;
}

/* Error */
.login-error {
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.3);
  color: #fca5a5;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
}

/* Submit */
.login-submit {
  width: 100%;
  padding: 0.8rem;
  background: #6c63ff;
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  margin-top: 0.25rem;
}

.login-submit:hover:not(:disabled) {
  background: #7c74ff;
}

.login-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-submit__spinner {
  width: 1.125rem;
  height: 1.125rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* Register link */
.login-register {
  text-align: center;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.35);
  margin: 0;
}

.login-register__link {
  color: #6c63ff;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.login-register__link:hover {
  color: #9d97ff;
  text-decoration: underline;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
