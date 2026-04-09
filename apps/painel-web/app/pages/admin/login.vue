<script setup lang="ts">
import AdminAuthShell from "~/components/admin/auth/AdminAuthShell.vue";
import { useAdminSession } from "~/composables/useAdminSession";
import { useCoreApi } from "~/composables/useCoreApi";
import type { CoreLoginResponse } from "~/types/core";
import { storeAdminLoginCredential } from "~/utils/admin-browser-credentials";
import { resolveAdminLoginErrorMessage } from "~/utils/admin-auth-feedback";
import {
  clearRememberedAdminLoginEmail,
  getRememberedAdminLoginEmail,
  isPersistentAdminSessionPreferred,
  persistRememberedAdminLoginEmail
} from "~/utils/admin-session-persistence";

definePageMeta({
  layout: false
});

const route = useRoute();
const {
  isAuthenticated,
  hydrate,
  setSession,
  coreUser
} = useAdminSession();
const { coreApiFetch } = useCoreApi();
const rememberedLoginEmail = import.meta.client ? getRememberedAdminLoginEmail() : "";
const emailInputRef = ref<HTMLInputElement | null>(null);
const passwordInputRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  email: rememberedLoginEmail,
  password: ""
});

const isLoading = ref(false);
const errorMessage = ref("");
const showPassword = ref(false);
const rememberLogin = ref(import.meta.client
  ? Boolean(rememberedLoginEmail || isPersistentAdminSessionPreferred())
  : false);
const SENSITIVE_QUERY_KEYS = ["tenantSlug", "email", "password"] as const;

const requestedRedirectPath = computed(() => {
  const raw = route.query.redirect;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSafeAdminRedirectPath(value) ? String(value) : "/admin";
});

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const entry of source) {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function normalizeUserType(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "client" ? "client" : "admin";
}

function normalizeUserLevel(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "finance" || normalized === "viewer") {
    return normalized;
  }

  return "marketing";
}

function resolveRedirectTarget(user: CoreLoginResponse["user"] | null | undefined) {
  if (!user) {
    return "/admin";
  }

  const isRootUser = Boolean(user.isPlatformAdmin);
  const profileUserType = normalizeUserType(user.userType ?? (isRootUser ? "admin" : "client"));
  const profileUserLevel = normalizeUserLevel(user.level ?? (isRootUser ? "admin" : "marketing"));
  const moduleCodes = new Set(normalizeModuleCodes(user.moduleCodes));

  return resolveAccessibleAdminRedirect(requestedRedirectPath.value, {
    isAuthenticated: true,
    isRootUser,
    profileUserType,
    profileUserLevel,
    sessionUserType: profileUserType,
    sessionUserLevel: profileUserLevel,
    preferences: user.preferences ?? "{}",
    hasModule: (moduleCode: string) => {
      if (isRootUser && profileUserType === "admin" && profileUserLevel === "admin") {
        return true;
      }

      return moduleCodes.has(String(moduleCode ?? "").trim().toLowerCase());
    }
  });
}

function hasSensitiveQueryParams() {
  return SENSITIVE_QUERY_KEYS.some((key) => {
    const rawValue = route.query[key];
    if (Array.isArray(rawValue)) {
      return rawValue.some((entry) => String(entry ?? "").trim().length > 0);
    }
    return String(rawValue ?? "").trim().length > 0;
  });
}

function syncFormFromDomInputs() {
  const emailValue = emailInputRef.value?.value;
  const passwordValue = passwordInputRef.value?.value;

  if (typeof emailValue === "string") {
    form.email = emailValue.trim().toLowerCase();
  }

  if (typeof passwordValue === "string") {
    form.password = passwordValue;
  }
}

function validateLoginForm() {
  if (!form.email || !form.email.includes("@")) {
    errorMessage.value = "Informe um email valido.";
    return false;
  }

  if (!form.password) {
    errorMessage.value = "Informe sua senha para entrar.";
    return false;
  }

  return true;
}

onMounted(async () => {
  hydrate();

  if (hasSensitiveQueryParams()) {
    await navigateTo("/admin/login", { replace: true });
    return;
  }

  if (isAuthenticated.value && coreUser.value) {
    await navigateTo(resolveRedirectTarget(coreUser.value), { replace: true });
  }
});

async function submit() {
  errorMessage.value = "";
  syncFormFromDomInputs();

  if (!validateLoginForm()) {
    return;
  }

  isLoading.value = true;

  try {
    const response = await coreApiFetch<CoreLoginResponse>("/core/auth/login", {
      method: "POST",
      body: {
        email: form.email,
        password: form.password,
        rememberLogin: rememberLogin.value
      }
    });

    setSession({
      token: response.accessToken,
      coreAccessToken: response.accessToken,
      coreUser: response.user,
      expiresAt: response.expiresAt,
      persistent: rememberLogin.value
    });

    if (rememberLogin.value) {
      persistRememberedAdminLoginEmail(form.email);
      await storeAdminLoginCredential({
        email: form.email,
        password: form.password,
        name: response.user.name
      });
    } else {
      clearRememberedAdminLoginEmail();
    }

    await navigateTo(resolveRedirectTarget(response.user), { replace: true });
  } catch (error: unknown) {
    errorMessage.value = resolveAdminLoginErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
}

watch(rememberLogin, (enabled) => {
  if (!enabled) {
    clearRememberedAdminLoginEmail();
  }
});
</script>

<template>
  <AdminAuthShell
    title=""
    description=""
    card-width="26rem"
  >
    <form class="admin-auth-form" method="post" autocomplete="on" novalidate onsubmit="return false;" @submit.prevent="submit">
      <div class="admin-auth-field">
        <input
          ref="emailInputRef"
          v-model="form.email"
          id="admin-login-username"
          name="username"
          type="email"
          placeholder="Email"
          autocomplete="username"
          inputmode="email"
          autocapitalize="none"
          class="admin-auth-input"
          :readonly="isLoading"
        >
      </div>

      <div class="admin-auth-field admin-auth-field--password">
        <input
          ref="passwordInputRef"
          v-model="form.password"
          id="admin-login-password"
          name="password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Senha"
          autocomplete="current-password"
          class="admin-auth-input"
          :readonly="isLoading"
        >
        <button
          type="button"
          class="admin-auth-eye-btn"
          :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
          @click="showPassword = !showPassword"
        >
          <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
      </div>

      <div class="admin-auth-options">
        <label class="admin-auth-checkbox">
          <input v-model="rememberLogin" type="checkbox" class="admin-auth-checkbox__check" autocomplete="off">
          <span>Lembrar login</span>
        </label>
        <NuxtLink to="/admin/recuperar-senha" class="admin-auth-link">Esqueceu a senha?</NuxtLink>
      </div>

      <Transition name="admin-auth-fade">
        <div v-if="errorMessage" class="admin-auth-alert admin-auth-alert--error">
          {{ errorMessage }}
        </div>
      </Transition>

      <button type="submit" class="admin-auth-submit" :disabled="isLoading">
        <span v-if="isLoading" class="admin-auth-submit__spinner" />
        <span>{{ isLoading ? 'Entrando...' : 'Entrar' }}</span>
      </button>

      <p class="admin-auth-meta">Se o acesso estiver inativo, bloqueado ou sem cliente vinculado, fale com um administrador.</p>
    </form>
  </AdminAuthShell>
</template>
