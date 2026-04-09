<script setup lang="ts">
import AdminAuthShell from "~/components/admin/auth/AdminAuthShell.vue";
import { useCoreApi } from "~/composables/useCoreApi";
import type {
  CorePasswordResetConfirmResponse,
  CorePasswordResetRequestResponse
} from "~/types/core";
import { resolveAdminPasswordResetErrorMessage } from "~/utils/admin-password-reset-feedback";

definePageMeta({
  layout: false
});

type RecoveryStep = "request" | "confirm" | "success";

const { coreApiFetch } = useCoreApi();

const step = ref<RecoveryStep>("request");
const requestForm = reactive({
  email: ""
});
const confirmForm = reactive({
  email: "",
  code: "",
  newPassword: "",
  confirmPassword: ""
});

const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const isRequesting = ref(false);
const isConfirming = ref(false);
const requestMessage = ref("");
const successMessage = ref("");
const requestError = ref("");
const confirmError = ref("");

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeResetCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

function syncRecoveryEmail() {
  const normalizedEmail = normalizeText(requestForm.email).toLowerCase();
  requestForm.email = normalizedEmail;
  confirmForm.email = normalizedEmail;
  return normalizedEmail;
}

function validatePasswordConfirmation() {
  if (!confirmForm.code || confirmForm.code.length < 6) {
    confirmError.value = "Informe o codigo de 6 digitos enviado por email.";
    return false;
  }

  if (normalizeText(confirmForm.newPassword).length < 6) {
    confirmError.value = "A nova senha precisa ter no minimo 6 caracteres.";
    return false;
  }

  if (confirmForm.newPassword !== confirmForm.confirmPassword) {
    confirmError.value = "A confirmacao da senha precisa ser igual a nova senha.";
    return false;
  }

  return true;
}

async function requestResetCode() {
  const email = syncRecoveryEmail();
  if (!email) {
    const message = "Informe o email que sera usado para recuperar a senha.";
    requestError.value = message;
    confirmError.value = message;
    return;
  }

  isRequesting.value = true;
  requestError.value = "";
  confirmError.value = "";

  try {
    const response = await coreApiFetch<CorePasswordResetRequestResponse>("/core/auth/password-reset/request", {
      method: "POST",
      body: { email }
    });

    requestMessage.value = response.message;
    confirmForm.code = "";
    confirmForm.newPassword = "";
    confirmForm.confirmPassword = "";
    confirmError.value = "";
    step.value = "confirm";
  } catch (error: unknown) {
    const message = resolveAdminPasswordResetErrorMessage(error);
    requestError.value = message;
    confirmError.value = message;
  } finally {
    isRequesting.value = false;
  }
}

async function confirmResetPassword() {
  confirmForm.email = syncRecoveryEmail();
  if (!validatePasswordConfirmation()) {
    return;
  }

  isConfirming.value = true;
  confirmError.value = "";

  try {
    const response = await coreApiFetch<CorePasswordResetConfirmResponse>("/core/auth/password-reset/confirm", {
      method: "POST",
      body: {
        email: confirmForm.email,
        code: confirmForm.code,
        newPassword: confirmForm.newPassword
      }
    });

    successMessage.value = response.message;
    step.value = "success";
  } catch (error: unknown) {
    confirmError.value = resolveAdminPasswordResetErrorMessage(error);
  } finally {
    isConfirming.value = false;
  }
}
</script>

<template>
  <AdminAuthShell
    title=""
    description="Envie um codigo por email e defina uma nova senha para voltar ao painel."
    card-width="29rem"
  >
    <form v-if="step === 'request'" class="admin-auth-form" method="post" novalidate onsubmit="return false;" @submit.prevent="requestResetCode">
      <div class="admin-auth-field">
        <input
          v-model="requestForm.email"
          type="email"
          placeholder="Email"
          autocomplete="email"
          class="admin-auth-input"
          :disabled="isRequesting"
        >
      </div>

      <Transition name="admin-auth-fade">
        <div v-if="requestError" class="admin-auth-alert admin-auth-alert--error">
          {{ requestError }}
        </div>
      </Transition>

      <button type="submit" class="admin-auth-submit" :disabled="isRequesting">
        <span v-if="!isRequesting">Enviar codigo por email</span>
        <span v-else class="admin-auth-submit__spinner" />
      </button>

      <div class="admin-auth-actions">
        <NuxtLink to="/admin/login" class="admin-auth-link">Voltar ao login</NuxtLink>
      </div>
    </form>

    <form v-else-if="step === 'confirm'" class="admin-auth-form" method="post" novalidate onsubmit="return false;" @submit.prevent="confirmResetPassword">
      <div class="admin-auth-alert admin-auth-alert--info">
        {{ requestMessage }}<br>
        Email alvo: {{ confirmForm.email }}
      </div>

      <div class="admin-auth-code-grid">
        <div class="admin-auth-field">
          <input
            :value="confirmForm.code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            class="admin-auth-input admin-auth-input--code"
            :disabled="isConfirming"
            @input="confirmForm.code = sanitizeResetCode(($event.target as HTMLInputElement)?.value)"
          >
        </div>
      </div>

      <div class="admin-auth-field admin-auth-field--password">
        <input
          v-model="confirmForm.newPassword"
          :type="showNewPassword ? 'text' : 'password'"
          placeholder="Nova senha"
          autocomplete="new-password"
          class="admin-auth-input"
          :disabled="isConfirming"
        >
        <button
          type="button"
          class="admin-auth-eye-btn"
          :aria-label="showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'"
          @click="showNewPassword = !showNewPassword"
        >
          <svg v-if="!showNewPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
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

      <div class="admin-auth-field admin-auth-field--password">
        <input
          v-model="confirmForm.confirmPassword"
          :type="showConfirmPassword ? 'text' : 'password'"
          placeholder="Confirmar nova senha"
          autocomplete="new-password"
          class="admin-auth-input"
          :disabled="isConfirming"
        >
        <button
          type="button"
          class="admin-auth-eye-btn"
          :aria-label="showConfirmPassword ? 'Ocultar confirmacao da senha' : 'Mostrar confirmacao da senha'"
          @click="showConfirmPassword = !showConfirmPassword"
        >
          <svg v-if="!showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
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

      <Transition name="admin-auth-fade">
        <div v-if="confirmError" class="admin-auth-alert admin-auth-alert--error">
          {{ confirmError }}
        </div>
      </Transition>

      <button type="submit" class="admin-auth-submit" :disabled="isConfirming">
        <span v-if="!isConfirming">Redefinir senha</span>
        <span v-else class="admin-auth-submit__spinner" />
      </button>

      <div class="admin-auth-actions">
        <button type="button" class="admin-auth-action" :disabled="isRequesting" @click="requestResetCode">
          {{ isRequesting ? 'Reenviando codigo...' : 'Reenviar codigo' }}
        </button>
        <NuxtLink to="/admin/login" class="admin-auth-link">Voltar ao login</NuxtLink>
      </div>
    </form>

    <div v-else class="admin-auth-form">
      <div class="admin-auth-alert admin-auth-alert--success">
        {{ successMessage }}
      </div>

      <NuxtLink to="/admin/login" class="admin-auth-submit">Entrar com a nova senha</NuxtLink>

      <p class="admin-auth-meta">A redefinicao encerra sessoes antigas para proteger o acesso da conta.</p>
    </div>
  </AdminAuthShell>
</template>