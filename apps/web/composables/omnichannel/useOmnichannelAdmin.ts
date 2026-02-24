import { computed, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from "vue";
import type {
  TenantSettings,
  TenantUser,
  WhatsAppBootstrapResponse,
  WhatsAppQrCodeResponse,
  WhatsAppStatusResponse
} from "~/types";

type UserRole = "ADMIN" | "AGENT";

export function useOmnichannelAdmin() {
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
    role: "AGENT" as UserRole
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
      (statusResult.value?.connectionState as { instance?: { state?: string } } | undefined)?.instance?.state ??
      "unknown";
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

      await Promise.all([refreshWhatsAppStatus({ silent: true }), fetchQrCode({ force: true, silent: true })]);
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
      const data = await apiFetch<WhatsAppQrCodeResponse>(`/tenant/whatsapp/qrcode?force=${force ? "true" : "false"}`);
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
      await Promise.all([loadTenant(), refreshWhatsAppStatus({ silent: true }), fetchQrCode({ force: true, silent: true })]);
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

      await Promise.all([refreshWhatsAppStatus({ silent: true }), fetchQrCode({ force: true, silent: true })]);
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

  return {
    user,
    loading,
    savingTenant,
    creatingUser,
    bootstrapping,
    connectingQr,
    connectingPairing,
    refreshingStatus,
    fetchingQr,
    tenant,
    users,
    statusResult,
    bootstrapResult,
    qrResult,
    infoMessage,
    errorMessage,
    pairingCode,
    tenantForm,
    userForm,
    whatsappForm,
    roleItems,
    connectionState,
    isConnected,
    connectionBadgeColor,
    qrImageSrc,
    saveTenant,
    createUser,
    refreshWhatsAppStatus,
    fetchQrCode,
    bootstrapWhatsApp,
    connectWithQr,
    generatePairingCode
  };
}
