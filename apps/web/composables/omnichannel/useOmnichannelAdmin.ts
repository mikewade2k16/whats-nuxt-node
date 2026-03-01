import { computed, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from "vue";
import type {
  WhatsAppEndpointValidationResponse,
  TenantFailuresDashboardResponse,
  TenantSettings,
  TenantUser,
  UserRole,
  WhatsAppBootstrapResponse,
  WhatsAppQrCodeResponse,
  WhatsAppStatusResponse
} from "~/types";

export function useOmnichannelAdmin() {
  const { user } = useAuth();
  const { apiFetch } = useApi();

  const loading = ref(false);
  const savingTenant = ref(false);
  const creatingUser = ref(false);
  const bootstrapping = ref(false);
  const connectingQr = ref(false);
  const connectingPairing = ref(false);
  const disconnectingWhatsApp = ref(false);
  const refreshingStatus = ref(false);
  const fetchingQr = ref(false);
  const loadingFailures = ref(false);
  const validatingEndpoints = ref(false);

  const tenant = ref<TenantSettings | null>(null);
  const users = ref<TenantUser[]>([]);
  const statusResult = ref<WhatsAppStatusResponse | null>(null);
  const bootstrapResult = ref<WhatsAppBootstrapResponse | null>(null);
  const qrResult = ref<WhatsAppQrCodeResponse | null>(null);
  const failuresDashboard = ref<TenantFailuresDashboardResponse | null>(null);
  const endpointValidation = ref<WhatsAppEndpointValidationResponse | null>(null);

  const infoMessage = ref("");
  const errorMessage = ref("");
  const pairingCode = ref<string | null>(null);
  const qrPollingTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const failureWindowDays = ref(7);

  const tenantForm = reactive({
    name: "",
    whatsappInstance: "",
    evolutionApiKey: "",
    maxChannels: 1,
    maxUsers: 2,
    retentionDays: 15,
    maxUploadMb: 500
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
    { label: "SUPERVISOR", value: "SUPERVISOR" as const },
    { label: "VIEWER", value: "VIEWER" as const },
    { label: "ADMIN", value: "ADMIN" as const }
  ];

  const canManageTenant = computed(() => user.value?.role === "ADMIN");
  const canViewOpsDashboard = computed(() => {
    if (!user.value) {
      return false;
    }

    return user.value.role === "ADMIN" || user.value.role === "SUPERVISOR";
  });

  const connectionState = computed(() => {
    const state =
      (statusResult.value?.connectionState as { instance?: { state?: string } } | undefined)?.instance?.state ??
      "unknown";
    return String(state);
  });

  const connectionStateNormalized = computed(() => connectionState.value.trim().toLowerCase());

  const isConnected = computed(() => {
    const value = connectionStateNormalized.value;
    return value === "open" || value === "connected";
  });

  const connectionBadgeColor = computed(() => {
    if (isConnected.value) {
      return "success";
    }
    if (connectionStateNormalized.value === "connecting") {
      return "warning";
    }
    if (
      connectionStateNormalized.value === "close" ||
      connectionStateNormalized.value === "closed" ||
      connectionStateNormalized.value === "disconnected" ||
      connectionStateNormalized.value === "logout"
    ) {
      return "error";
    }
    return "neutral";
  });

  const connectionStateLabel = computed(() => {
    const value = connectionStateNormalized.value;
    if (value === "open" || value === "connected") {
      return "Conectado";
    }

    if (value === "connecting") {
      return hasQrCode.value ? "Desconectado (aguardando QR)" : "Desconectado (iniciando QR)";
    }

    if (value === "close" || value === "closed" || value === "disconnected" || value === "logout") {
      return "Desconectado";
    }

    return "Status desconhecido";
  });

  const qrImageSrc = computed(() => qrResult.value?.qrCode ?? null);
  const hasQrCode = computed(() => Boolean(qrImageSrc.value));

  const connectionAlertColor = computed(() => {
    if (isConnected.value) {
      return "success";
    }
    if (connectionStateNormalized.value === "connecting" || hasQrCode.value) {
      return "warning";
    }
    return "error";
  });

  const connectionAlertTitle = computed(() => {
    if (isConnected.value) {
      return "WhatsApp conectado";
    }

    if (hasQrCode.value) {
      return "WhatsApp desconectado (QR pronto para leitura)";
    }

    if (connectionStateNormalized.value === "connecting") {
      return "WhatsApp desconectado (aguardando QR)";
    }

    return "WhatsApp desconectado";
  });

  const connectionAlertDescription = computed(() => {
    if (isConnected.value) {
      return "A inbox esta apta para receber e enviar mensagens em tempo real.";
    }

    if (hasQrCode.value) {
      return "Escaneie o QR Code abaixo no WhatsApp para reconectar esta instancia.";
    }

    if (connectionStateNormalized.value === "connecting") {
      return "A instancia iniciou conexao, mas ainda nao publicou QR. Clique em Atualizar QR e aguarde.";
    }

    return "Nenhuma sessao ativa. Clique em Conectar por QR para gerar o codigo de pareamento.";
  });

  const qrUnavailableMessage = computed(() => {
    if (hasQrCode.value) {
      return "";
    }

    if (qrResult.value?.message && qrResult.value.message.trim().length > 0) {
      return qrResult.value.message.trim();
    }

    if (isConnected.value) {
      return "Instancia ja conectada. Desconecte a sessao atual para gerar um novo QR Code.";
    }

    if (connectionStateNormalized.value === "connecting") {
      return "Aguardando emissao do QR Code pela instancia...";
    }

    return "QR ainda indisponivel. Clique em Conectar por QR.";
  });

  watchEffect(() => {
    if (user.value && !canViewOpsDashboard.value) {
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
    tenantForm.maxChannels = data.maxChannels;
    tenantForm.maxUsers = data.maxUsers;
    tenantForm.retentionDays = data.retentionDays;
    tenantForm.maxUploadMb = data.maxUploadMb;
    whatsappForm.instanceName = data.whatsappInstance ?? "";
  }

  async function loadUsers() {
    users.value = await apiFetch<TenantUser[]>("/users");
  }

  async function loadInitialData() {
    loading.value = true;
    clearMessages();
    try {
      const requests: Array<Promise<unknown>> = [
        loadTenant(),
        loadUsers(),
        refreshWhatsAppStatus({ silent: true }),
        loadFailuresDashboard({ silent: true })
      ];

      if (canManageTenant.value) {
        requests.push(fetchQrCode({ force: false, silent: true }));
      }

      await Promise.all(requests);
      await validateEvolutionEndpoints({ silent: true });
    } catch (error) {
      setError(extractError(error));
    } finally {
      loading.value = false;
    }
  }

  async function saveTenant() {
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para alterar configuracoes do tenant.");
      return;
    }

    savingTenant.value = true;
    clearMessages();
    try {
      const fallbackMaxChannels = tenant.value?.maxChannels ?? 1;
      const fallbackMaxUsers = tenant.value?.maxUsers ?? 2;
      const fallbackRetentionDays = tenant.value?.retentionDays ?? 15;
      const fallbackMaxUploadMb = tenant.value?.maxUploadMb ?? 500;

      const nextMaxChannels = Number.isFinite(tenantForm.maxChannels)
        ? Math.trunc(tenantForm.maxChannels)
        : fallbackMaxChannels;
      const nextMaxUsers = Number.isFinite(tenantForm.maxUsers)
        ? Math.trunc(tenantForm.maxUsers)
        : fallbackMaxUsers;
      const nextRetentionDays = Number.isFinite(tenantForm.retentionDays)
        ? Math.trunc(tenantForm.retentionDays)
        : fallbackRetentionDays;
      const nextMaxUploadMb = Number.isFinite(tenantForm.maxUploadMb)
        ? Math.trunc(tenantForm.maxUploadMb)
        : fallbackMaxUploadMb;

      const data = await apiFetch<TenantSettings>("/tenant", {
        method: "PATCH",
        body: {
          name: tenantForm.name,
          whatsappInstance: tenantForm.whatsappInstance || undefined,
          evolutionApiKey: tenantForm.evolutionApiKey,
          maxChannels: nextMaxChannels,
          maxUsers: nextMaxUsers,
          retentionDays: nextRetentionDays,
          maxUploadMb: nextMaxUploadMb
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
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para criar usuarios.");
      return;
    }

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
      statusResult.value = {
        configured: false,
        message: "Nao foi possivel consultar status do canal WhatsApp."
      };
      if (!options.silent) {
        setError(extractError(error));
      }
    } finally {
      refreshingStatus.value = false;
    }
  }

  async function fetchQrCode(options: { force?: boolean; silent?: boolean } = {}) {
    if (!canManageTenant.value) {
      return;
    }

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
      if (!options.silent) {
        infoMessage.value = data.qrCode
          ? "QR atualizado. Escaneie no app WhatsApp."
          : (data.message || qrUnavailableMessage.value);
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
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para configurar o canal WhatsApp.");
      return;
    }

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
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para conectar o WhatsApp.");
      return;
    }

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
      infoMessage.value = hasQrCode.value
        ? "QR atualizado. Escaneie no app WhatsApp."
        : qrUnavailableMessage.value;
    } catch (error) {
      setError(extractError(error));
    } finally {
      connectingQr.value = false;
    }
  }

  async function disconnectWhatsAppSession() {
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para desconectar o WhatsApp.");
      return;
    }

    disconnectingWhatsApp.value = true;
    clearMessages();
    try {
      await apiFetch("/tenant/whatsapp/logout", {
        method: "POST",
        body: {}
      });

      qrResult.value = null;
      pairingCode.value = null;
      await refreshWhatsAppStatus({ silent: true });
      infoMessage.value = "Sessao desconectada. Clique em Conectar por QR para gerar um novo codigo.";
    } catch (error) {
      setError(extractError(error));
    } finally {
      disconnectingWhatsApp.value = false;
    }
  }

  async function generatePairingCode() {
    if (!canManageTenant.value) {
      setError("Perfil sem permissao para gerar pairing code.");
      return;
    }

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

  async function loadFailuresDashboard(options: { days?: number; silent?: boolean } = {}) {
    loadingFailures.value = true;
    if (!options.silent) {
      clearMessages(true);
    }
    try {
      const days = options.days ?? failureWindowDays.value;
      const data = await apiFetch<TenantFailuresDashboardResponse>(`/tenant/metrics/failures?days=${days}`);
      failureWindowDays.value = days;
      failuresDashboard.value = data;
    } catch (error) {
      if (!options.silent) {
        setError(extractError(error));
      }
    } finally {
      loadingFailures.value = false;
    }
  }

  async function validateEvolutionEndpoints(options: { silent?: boolean } = {}) {
    if (!canViewOpsDashboard.value) {
      return;
    }

    validatingEndpoints.value = true;
    if (!options.silent) {
      clearMessages(true);
    }

    try {
      endpointValidation.value = await apiFetch<WhatsAppEndpointValidationResponse>(
        "/tenant/whatsapp/validate-endpoints",
        {
          method: "POST",
          body: {
            instanceName: whatsappForm.instanceName.trim() || undefined
          }
        }
      );
      if (!options.silent) {
        infoMessage.value = "Validacao de endpoints da Evolution atualizada.";
      }
    } catch (error) {
      endpointValidation.value = null;
      if (!options.silent) {
        setError(extractError(error));
      }
    } finally {
      validatingEndpoints.value = false;
    }
  }

  onMounted(async () => {
    if (canViewOpsDashboard.value) {
      await loadInitialData();
      if (canManageTenant.value && !isConnected.value) {
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
    disconnectingWhatsApp,
    refreshingStatus,
    fetchingQr,
    loadingFailures,
    validatingEndpoints,
    tenant,
    users,
    statusResult,
    bootstrapResult,
    qrResult,
    failuresDashboard,
    endpointValidation,
    infoMessage,
    errorMessage,
    pairingCode,
    failureWindowDays,
    tenantForm,
    userForm,
    whatsappForm,
    roleItems,
    canManageTenant,
    canViewOpsDashboard,
    connectionState,
    connectionStateLabel,
    isConnected,
    connectionBadgeColor,
    connectionAlertColor,
    connectionAlertTitle,
    connectionAlertDescription,
    qrImageSrc,
    hasQrCode,
    qrUnavailableMessage,
    saveTenant,
    createUser,
    refreshWhatsAppStatus,
    fetchQrCode,
    bootstrapWhatsApp,
    connectWithQr,
    disconnectWhatsAppSession,
    generatePairingCode,
    loadFailuresDashboard,
    validateEvolutionEndpoints
  };
}
