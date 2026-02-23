<script setup lang="ts">
import type {
  TenantSettings,
  TenantUser,
  WhatsAppBootstrapResponse,
  WhatsAppQrCodeResponse,
  WhatsAppStatusResponse
} from "~/types";
import {
  UAlert,
  UBadge,
  UButton,
  UCard,
  UFormField,
  UInput,
  USelect,
  USeparator
} from "#components";

const { user } = useAuth();
const { apiFetch } = useApi();

const loading = ref(false);
const savingTenant = ref(false);
const creatingUser = ref(false);
const bootstrapping = ref(false);
const connectingQr = ref(false);
const connectingPairing = ref(false);
const refreshingStatus = ref(false);
const fetchingQr = ref(false);

const tenant = ref<TenantSettings | null>(null);
const users = ref<TenantUser[]>([]);
const statusResult = ref<WhatsAppStatusResponse | null>(null);
const bootstrapResult = ref<WhatsAppBootstrapResponse | null>(null);
const qrResult = ref<WhatsAppQrCodeResponse | null>(null);

const infoMessage = ref("");
const errorMessage = ref("");
const pairingCode = ref<string | null>(null);
const qrPollingTimer = ref<ReturnType<typeof setInterval> | null>(null);

const tenantForm = reactive({
  name: "",
  whatsappInstance: "",
  evolutionApiKey: ""
});

const userForm = reactive({
  name: "",
  email: "",
  password: "",
  role: "AGENT" as "ADMIN" | "AGENT"
});

const whatsappForm = reactive({
  instanceName: "",
  number: ""
});

const roleItems = [
  { label: "AGENT", value: "AGENT" as const },
  { label: "ADMIN", value: "ADMIN" as const }
];

const connectionState = computed(() => {
  const state =
    (statusResult.value?.connectionState as { instance?: { state?: string } } | undefined)?.instance
      ?.state ?? "unknown";
  return String(state);
});

const isConnected = computed(() => {
  const value = connectionState.value.toLowerCase();
  return value === "open" || value === "connected";
});

const connectionBadgeColor = computed(() => {
  if (isConnected.value) {
    return "success";
  }
  if (connectionState.value.toLowerCase() === "connecting") {
    return "warning";
  }
  return "neutral";
});

const qrImageSrc = computed(() => qrResult.value?.qrCode ?? null);

watchEffect(() => {
  if (user.value && user.value.role !== "ADMIN") {
    void navigateTo("/");
  }
});

function setError(message: string) {
  errorMessage.value = message;
}

function clearMessages(preserveInfo = false) {
  errorMessage.value = "";
  if (!preserveInfo) {
    infoMessage.value = "";
  }
}

function extractError(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: Record<string, unknown> }).data;
    if (data && typeof data.message === "string") {
      return data.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Operacao falhou";
}

function extractPairingCode(source: unknown): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const queue: unknown[] = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (typeof current === "string") {
      const trimmed = current.trim();
      if (trimmed && trimmed.length <= 64 && /^[A-Za-z0-9\-_.@:+/]+$/.test(trimmed)) {
        return trimmed;
      }
      continue;
    }

    if (typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    if (typeof obj.pairingCode === "string") {
      return obj.pairingCode;
    }
    if (typeof obj.code === "string" && obj.code.length <= 64) {
      return obj.code;
    }
    queue.push(...Object.values(obj));
  }

  return null;
}

function stopQrPolling() {
  if (qrPollingTimer.value) {
    clearInterval(qrPollingTimer.value);
    qrPollingTimer.value = null;
  }
}

function startQrPolling() {
  stopQrPolling();
  qrPollingTimer.value = setInterval(async () => {
    if (isConnected.value) {
      stopQrPolling();
      return;
    }

    await Promise.all([
      refreshWhatsAppStatus({ silent: true }),
      fetchQrCode({ force: true, silent: true })
    ]);
  }, 8_000);
}

async function loadTenant() {
  const data = await apiFetch<TenantSettings>("/tenant");
  tenant.value = data;
  tenantForm.name = data.name;
  tenantForm.whatsappInstance = data.whatsappInstance ?? "";
  tenantForm.evolutionApiKey = data.evolutionApiKey ?? "";
  whatsappForm.instanceName = data.whatsappInstance ?? "";
}

async function loadUsers() {
  users.value = await apiFetch<TenantUser[]>("/users");
}

async function loadInitialData() {
  loading.value = true;
  clearMessages();
  try {
    await Promise.all([
      loadTenant(),
      loadUsers(),
      refreshWhatsAppStatus({ silent: true }),
      fetchQrCode({ force: false, silent: true })
    ]);
  } catch (error) {
    setError(extractError(error));
  } finally {
    loading.value = false;
  }
}

async function saveTenant() {
  savingTenant.value = true;
  clearMessages();
  try {
    const data = await apiFetch<TenantSettings>("/tenant", {
      method: "PATCH",
      body: {
        name: tenantForm.name,
        whatsappInstance: tenantForm.whatsappInstance || undefined,
        evolutionApiKey: tenantForm.evolutionApiKey
      }
    });
    tenant.value = data;
    whatsappForm.instanceName = data.whatsappInstance ?? "";
    infoMessage.value = "Configuracoes do tenant salvas.";
  } catch (error) {
    setError(extractError(error));
  } finally {
    savingTenant.value = false;
  }
}

async function createUser() {
  creatingUser.value = true;
  clearMessages();
  try {
    await apiFetch<TenantUser>("/users", {
      method: "POST",
      body: {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role
      }
    });

    userForm.name = "";
    userForm.email = "";
    userForm.password = "";
    userForm.role = "AGENT";

    await loadUsers();
    infoMessage.value = "Usuario criado com sucesso.";
  } catch (error) {
    setError(extractError(error));
  } finally {
    creatingUser.value = false;
  }
}

async function refreshWhatsAppStatus(options: { silent?: boolean } = {}) {
  refreshingStatus.value = true;
  if (!options.silent) {
    clearMessages(true);
  }
  try {
    statusResult.value = await apiFetch<WhatsAppStatusResponse>("/tenant/whatsapp/status");
  } catch (error) {
    if (!options.silent) {
      setError(extractError(error));
    }
  } finally {
    refreshingStatus.value = false;
  }
}

async function fetchQrCode(options: { force?: boolean; silent?: boolean } = {}) {
  fetchingQr.value = true;
  if (!options.silent) {
    clearMessages(true);
  }
  try {
    const force = options.force ?? true;
    const data = await apiFetch<WhatsAppQrCodeResponse>(
      `/tenant/whatsapp/qrcode?force=${force ? "true" : "false"}`
    );
    qrResult.value = data;
    if (data.pairingCode) {
      pairingCode.value = data.pairingCode;
    }
  } catch (error) {
    if (!options.silent) {
      setError(extractError(error));
    }
  } finally {
    fetchingQr.value = false;
  }
}

async function bootstrapWhatsApp() {
  bootstrapping.value = true;
  clearMessages();
  try {
    const data = await apiFetch<WhatsAppBootstrapResponse>("/tenant/whatsapp/bootstrap", {
      method: "POST",
      body: {
        instanceName: whatsappForm.instanceName || undefined
      }
    });

    bootstrapResult.value = data;
    await Promise.all([
      loadTenant(),
      refreshWhatsAppStatus({ silent: true }),
      fetchQrCode({ force: true, silent: true })
    ]);
    startQrPolling();
    infoMessage.value = "Instancia iniciada. Escaneie o QR com seu WhatsApp.";
  } catch (error) {
    setError(extractError(error));
  } finally {
    bootstrapping.value = false;
  }
}

async function connectWithQr() {
  connectingQr.value = true;
  clearMessages();
  try {
    const data = await apiFetch<WhatsAppBootstrapResponse>("/tenant/whatsapp/connect", {
      method: "POST",
      body: {}
    });
    bootstrapResult.value = data;

    await Promise.all([
      refreshWhatsAppStatus({ silent: true }),
      fetchQrCode({ force: true, silent: true })
    ]);
    startQrPolling();
    infoMessage.value = "QR atualizado. Escaneie no app WhatsApp.";
  } catch (error) {
    setError(extractError(error));
  } finally {
    connectingQr.value = false;
  }
}

async function generatePairingCode() {
  if (!whatsappForm.number.trim()) {
    setError("Informe um numero para gerar pairing code.");
    return;
  }

  connectingPairing.value = true;
  clearMessages();
  try {
    const data = await apiFetch<WhatsAppBootstrapResponse>("/tenant/whatsapp/connect", {
      method: "POST",
      body: {
        number: whatsappForm.number.trim()
      }
    });
    bootstrapResult.value = data;

    const extracted = extractPairingCode(data.connectResult);
    pairingCode.value = extracted;
    await refreshWhatsAppStatus({ silent: true });

    infoMessage.value = extracted
      ? "Pairing code gerado. Use no WhatsApp para parear."
      : "Conexao por codigo solicitada. Confira retorno da Evolution.";
  } catch (error) {
    setError(extractError(error));
  } finally {
    connectingPairing.value = false;
  }
}

onMounted(async () => {
  if (user.value?.role === "ADMIN") {
    await loadInitialData();
    if (!isConnected.value) {
      startQrPolling();
    }
  }
});

onBeforeUnmount(() => {
  stopQrPolling();
});
</script>

<template>
  <div class="admin-console">
    <div class="admin-console__header">
      <div class="admin-console__headline">
        <h1 class="admin-console__title">Admin de Operacao</h1>
        <p class="admin-console__subtitle">
          Tenant <strong>{{ user?.tenantSlug }}</strong> | Fluxo de conexao WhatsApp por QR
        </p>
      </div>
      <UButton to="/" color="neutral" variant="outline">
        Voltar para Inbox
      </UButton>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="soft" :title="errorMessage" />
    <UAlert v-if="infoMessage" color="primary" variant="soft" :title="infoMessage" />

    <div v-if="loading" class="admin-console__loading">
      Carregando configuracoes...
    </div>

    <template v-else>
      <UCard>
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Tenant</h2>
            <UBadge :color="connectionBadgeColor" variant="soft">
              {{ connectionState }}
            </UBadge>
          </div>
        </template>

        <form class="tenant-form" @submit.prevent="saveTenant">
          <UFormField label="Nome da empresa">
            <UInput v-model="tenantForm.name" placeholder="Empresa X" />
          </UFormField>

          <UFormField label="Instancia WhatsApp">
            <UInput v-model="tenantForm.whatsappInstance" placeholder="demo-instance" />
          </UFormField>

          <UFormField label="Evolution API Key (opcional por tenant)">
            <UInput v-model="tenantForm.evolutionApiKey" placeholder="apikey-tenant" />
          </UFormField>

          <div class="tenant-form__footer">
            <p class="tenant-form__hint">
              Webhook: <code>{{ tenant?.webhookUrl }}</code>
            </p>
            <UButton type="submit" :loading="savingTenant">Salvar tenant</UButton>
          </div>
        </form>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="admin-card__title">Conexao WhatsApp</h2>
        </template>

        <div class="admin-grid-two">
          <div class="admin-stack">
            <UAlert
              color="neutral"
              variant="soft"
              title="Fluxo recomendado"
              description="Use Bootstrap uma vez e depois Conectar por QR sempre que precisar."
            />

            <UFormField label="Instance name">
              <UInput v-model="whatsappForm.instanceName" placeholder="demo-instance" />
            </UFormField>

            <div class="admin-actions-row">
              <UButton :loading="bootstrapping" @click="bootstrapWhatsApp">
                Bootstrap
              </UButton>
              <UButton :loading="connectingQr" color="primary" variant="outline" @click="connectWithQr">
                Conectar por QR
              </UButton>
              <UButton
                :loading="refreshingStatus"
                color="neutral"
                variant="soft"
                @click="refreshWhatsAppStatus()"
              >
                Atualizar status
              </UButton>
              <UButton
                :loading="fetchingQr"
                color="neutral"
                variant="soft"
                @click="fetchQrCode({ force: true })"
              >
                Atualizar QR
              </UButton>
            </div>

            <USeparator label="Opcional: Pairing Code" />

            <UFormField label="Numero para pairing code (opcional)">
              <UInput v-model="whatsappForm.number" placeholder="5511999999999" />
            </UFormField>

            <div class="admin-actions-row admin-actions-row--align-center">
              <UButton
                :loading="connectingPairing"
                color="neutral"
                variant="outline"
                @click="generatePairingCode"
              >
                Gerar pairing code
              </UButton>
              <UBadge v-if="pairingCode" color="warning" variant="subtle">
                Codigo: {{ pairingCode }}
              </UBadge>
            </div>
          </div>

          <UCard class="qr-panel">
            <template #header>
              <div class="admin-card__header">
                <h3 class="admin-card__title">QR Code Atual</h3>
                <UBadge color="neutral" variant="soft">
                  {{ qrResult?.source || "pending" }}
                </UBadge>
              </div>
            </template>

            <div class="qr-stage">
              <img
                v-if="qrImageSrc"
                :src="qrImageSrc"
                alt="QR Code WhatsApp"
                class="qr-image"
              />
              <div v-else class="qr-empty">
                QR ainda indisponivel. Clique em <strong>Conectar por QR</strong>.
              </div>
            </div>

            <template #footer>
              <p class="qr-hint">
                Enquanto estado estiver <code>connecting</code>, atualize QR ou aguarde polling automatico.
              </p>
            </template>
          </UCard>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="admin-card__title">Usuarios do Tenant</h2>
        </template>

        <form class="users-form" @submit.prevent="createUser">
          <UFormField label="Nome">
            <UInput v-model="userForm.name" placeholder="Novo agente" />
          </UFormField>

          <UFormField label="Email">
            <UInput v-model="userForm.email" type="email" placeholder="agente@empresa.com" />
          </UFormField>

          <UFormField label="Senha inicial">
            <UInput v-model="userForm.password" type="password" placeholder="******" />
          </UFormField>

          <UFormField label="Role">
            <USelect
              v-model="userForm.role"
              :items="roleItems"
              value-key="value"
            />
          </UFormField>

          <div class="users-form__footer">
            <UButton type="submit" :loading="creatingUser">Criar usuario</UButton>
          </div>
        </form>

        <div class="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr class="users-table__row users-table__row--head">
                <th class="users-table__cell users-table__cell--head">Nome</th>
                <th class="users-table__cell users-table__cell--head">Email</th>
                <th class="users-table__cell users-table__cell--head">Role</th>
                <th class="users-table__cell users-table__cell--head">Criado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenantUser in users" :key="tenantUser.id" class="users-table__row">
                <td class="users-table__cell">{{ tenantUser.name }}</td>
                <td class="users-table__cell">{{ tenantUser.email }}</td>
                <td class="users-table__cell">{{ tenantUser.role }}</td>
                <td class="users-table__cell">{{ new Date(tenantUser.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <details class="admin-debug">
        <summary class="admin-debug__summary">Debug tecnico (bootstrap/status/qr)</summary>
        <div class="admin-debug__grid">
          <pre class="admin-debug__code">{{ bootstrapResult ? JSON.stringify(bootstrapResult, null, 2) : "Sem bootstrap ainda." }}</pre>
          <pre class="admin-debug__code">{{ statusResult ? JSON.stringify(statusResult, null, 2) : "Sem status." }}</pre>
          <pre class="admin-debug__code">{{ qrResult ? JSON.stringify(qrResult, null, 2) : "Sem qr." }}</pre>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.admin-console {
  min-height: 100vh;
  padding: 1rem;
  display: grid;
  align-content: start;
  gap: 1rem;
}

.admin-console__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.admin-console__headline {
  min-width: 0;
}

.admin-console__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.admin-console__subtitle {
  margin: 0.2rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.9rem;
}

.admin-console__loading {
  color: rgb(var(--muted));
  font-size: 0.9rem;
}

.admin-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.admin-card__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.tenant-form,
.users-form {
  display: grid;
  gap: 0.75rem;
}

.tenant-form {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.users-form {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tenant-form__footer,
.users-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tenant-form__footer {
  grid-column: 1 / -1;
}

.users-form__footer {
  grid-column: 1 / -1;
  justify-content: flex-end;
}

.tenant-form__hint {
  margin: 0;
  font-size: 0.75rem;
  color: rgb(var(--muted));
}

.admin-grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.admin-stack {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.admin-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-actions-row--align-center {
  align-items: center;
}

.qr-panel {
  min-height: 360px;
}

.qr-stage {
  min-height: 260px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  padding: 1rem;
}

.qr-image {
  width: min(260px, 100%);
  height: auto;
  border-radius: 10px;
  background: #fff;
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
}

.qr-empty {
  text-align: center;
  color: rgb(var(--muted));
  font-size: 0.85rem;
}

.qr-hint {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.users-table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.users-table__row {
  border-bottom: 1px solid rgb(var(--border));
}

.users-table__row--head {
  color: rgb(var(--muted));
}

.users-table__cell {
  padding: 0.5rem;
  text-align: left;
}

.users-table__cell--head {
  font-weight: 600;
}

.admin-debug {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  padding: 0.75rem;
}

.admin-debug__summary {
  cursor: pointer;
  font-weight: 600;
}

.admin-debug__grid {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.admin-debug__code {
  margin: 0;
  max-height: 20rem;
  overflow: auto;
  border-radius: var(--radius-xs);
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.75rem;
  font-size: 0.75rem;
}

@media (max-width: 1024px) {
  .admin-grid-two {
    grid-template-columns: 1fr;
  }

  .admin-debug__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .tenant-form,
  .users-form {
    grid-template-columns: 1fr;
  }

  .admin-console__header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
