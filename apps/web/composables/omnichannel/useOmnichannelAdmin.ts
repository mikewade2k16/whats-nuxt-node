import { computed, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from "vue";
import type {
  WhatsAppEndpointValidationResponse,
  TenantFailuresDashboardResponse,
  TenantSettings,
  TenantUser,
  WhatsAppBootstrapResponse,
  WhatsAppQrCodeResponse,
  WhatsAppStatusResponse
} from "~/types";
import {
  ADMIN_ROLE_ITEMS,
  applyAdminFieldErrors,
  clearAdminFieldErrors,
  createClientFormState,
  createTenantFormState,
  createUserFormState,
  createWhatsAppFormState,
  extractAdminError as extractError,
  extractPairingCode
} from "~/composables/omnichannel/useOmnichannelAdminShared";
import { useOmnichannelAdminConnectionState } from "~/composables/omnichannel/useOmnichannelAdminConnectionState";
import { useOmnichannelAdminClientOps } from "~/composables/omnichannel/useOmnichannelAdminClientOps";
import { useOmnichannelAdminOperationalOps } from "~/composables/omnichannel/useOmnichannelAdminOperationalOps";
import { useOmnichannelAdminQrPolling } from "~/composables/omnichannel/useOmnichannelAdminQrPolling";
import { useOmnichannelAdminTenantOps } from "~/composables/omnichannel/useOmnichannelAdminTenantOps";

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
  const failureWindowDays = ref(7);

  const tenantForm = reactive(createTenantFormState());
  const tenantFieldErrors = reactive<Record<string, string>>({});
  const clientForm = reactive(createClientFormState());
  const clientFieldErrors = reactive<Record<string, string>>({});
  const userForm = reactive(createUserFormState());
  const userFieldErrors = reactive<Record<string, string>>({});
  const whatsappForm = reactive(createWhatsAppFormState());
  const roleItems = ADMIN_ROLE_ITEMS;

  const canManageTenant = computed(() => user.value?.role === "ADMIN");
  const canViewOpsDashboard = computed(() => {
    if (!user.value) {
      return false;
    }

    return user.value.role === "ADMIN" || user.value.role === "SUPERVISOR";
  });

  const {
    connectionState,
    isConnected,
    connectionBadgeColor,
    connectionStateLabel,
    qrImageSrc,
    hasQrCode,
    connectionAlertColor,
    connectionAlertTitle,
    connectionAlertDescription,
    qrUnavailableMessage
  } = useOmnichannelAdminConnectionState({
    statusResult,
    qrResult
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

  function applyTenantState(data: TenantSettings) {
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

  const { stopQrPolling, startQrPolling } = useOmnichannelAdminQrPolling({
    isConnected,
    refreshWhatsAppStatus,
    fetchQrCode
  });

  const {
    bootstrapWhatsApp,
    connectWithQr,
    disconnectWhatsAppSession,
    generatePairingCode,
    loadFailuresDashboard,
    validateEvolutionEndpoints
  } = useOmnichannelAdminOperationalOps({
    canManageTenant,
    canViewOpsDashboard,
    bootstrapping,
    connectingQr,
    connectingPairing,
    disconnectingWhatsApp,
    loadingFailures,
    validatingEndpoints,
    bootstrapResult,
    qrResult,
    failuresDashboard,
    endpointValidation,
    infoMessage,
    pairingCode,
    failureWindowDays,
    whatsappForm,
    hasQrCode,
    qrUnavailableMessage,
    clearMessages,
    setError,
    extractError,
    apiFetch,
    loadTenant: async () => {
      const data = await apiFetch<TenantSettings>("/tenant");
      applyTenantState(data);
    },
    refreshWhatsAppStatus,
    fetchQrCode,
    startQrPolling,
    extractPairingCode
  });

  const {
    loadTenant,
    loadUsers,
    loadInitialData,
    saveTenant,
    createUser
  } = useOmnichannelAdminTenantOps({
    user,
    canManageTenant,
    tenant,
    users,
    loading,
    savingTenant,
    creatingUser,
    infoMessage,
    clearMessages,
    setError,
    extractError,
    clearFieldErrors: clearAdminFieldErrors,
    applyFieldErrors: applyAdminFieldErrors,
    tenantFieldErrors,
    userFieldErrors,
    apiFetch,
    tenantForm,
    userForm,
    whatsappForm,
    refreshWhatsAppStatus,
    loadFailuresDashboard,
    fetchQrCode,
    validateEvolutionEndpoints
  });

  const {
    clients,
    loadingClients,
    savingClient,
    deletingClientId,
    editingClientId,
    selectedClientId,
    selectedClient,
    savingUser,
    deletingUserId,
    editingUserId,
    loadClients,
    resetClientForm,
    startEditClient,
    saveClient,
    deleteClient,
    selectClient,
    resetUserForm,
    startEditUser,
    saveUser,
    deleteUser
  } = useOmnichannelAdminClientOps({
    user,
    canManageTenant,
    tenant,
    users,
    infoMessage,
    clearMessages,
    setError,
    extractError,
    clearFieldErrors: clearAdminFieldErrors,
    applyFieldErrors: applyAdminFieldErrors,
    clientFieldErrors,
    userFieldErrors,
    apiFetch,
    clientForm,
    userForm
  });

  onMounted(async () => {
    if (canViewOpsDashboard.value) {
      await loadInitialData();
      if (canManageTenant.value) {
        await loadClients();
      }
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
    loadingClients,
    savingTenant,
    creatingUser,
    savingUser,
    savingClient,
    bootstrapping,
    connectingQr,
    connectingPairing,
    disconnectingWhatsApp,
    refreshingStatus,
    fetchingQr,
    loadingFailures,
    validatingEndpoints,
    tenant,
    clients,
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
    tenantFieldErrors,
    clientForm,
    clientFieldErrors,
    userForm,
    userFieldErrors,
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
    deletingClientId,
    editingClientId,
    selectedClientId,
    selectedClient,
    deletingUserId,
    editingUserId,
    loadClients,
    resetClientForm,
    startEditClient,
    saveClient,
    deleteClient,
    selectClient,
    resetUserForm,
    startEditUser,
    saveUser,
    deleteUser,
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
