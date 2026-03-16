import type { Ref } from "vue";
import type {
  Contact,
  TenantSettings,
  TenantUser,
  WhatsAppInstanceAccessResponse,
  WhatsAppInstanceRecord,
  WhatsAppStatusResponse
} from "~/types";
import {
  DEFAULT_MAX_UPLOAD_MB,
  normalizeTenantUploadLimitMb,
  toArrayOrEmpty
} from "~/composables/omnichannel/useOmnichannelInboxShared";

export function useOmnichannelInboxBootstrapLoaders(options: {
  tenantMaxUploadMb: Ref<number>;
  whatsappStatus: Ref<WhatsAppStatusResponse | null>;
  users: Ref<TenantUser[]>;
  contacts: Ref<Contact[]>;
  whatsappInstances: Ref<WhatsAppInstanceRecord[]>;
  selectedInstanceId: Ref<string>;
  loadingWhatsAppStatus: Ref<boolean>;
  loadingUsers: Ref<boolean>;
  loadingContacts: Ref<boolean>;
  apiFetch: <T = unknown>(path: string, init?: Record<string, unknown>) => Promise<T>;
  sortContacts: () => void;
}) {
  const STATUS_CACHE_TTL_MS = 12_000;
  let statusRequestInFlight: Promise<void> | null = null;
  let lastStatusFetchedAt = 0;

  async function loadTenantUploadLimit() {
    try {
      const tenantSettings = await options.apiFetch<TenantSettings>("/tenant");
      options.tenantMaxUploadMb.value = normalizeTenantUploadLimitMb(tenantSettings.maxUploadMb);
    } catch {
      options.tenantMaxUploadMb.value = DEFAULT_MAX_UPLOAD_MB;
    }
  }

  async function loadWhatsAppStatus(optionsArg: { force?: boolean } = {}) {
    const force = optionsArg.force ?? false;
    const now = Date.now();

    if (statusRequestInFlight) {
      await statusRequestInFlight;
      return;
    }

    if (
      !force &&
      options.whatsappStatus.value &&
      now - lastStatusFetchedAt < STATUS_CACHE_TTL_MS
    ) {
      return;
    }

    const request = (async () => {
      options.loadingWhatsAppStatus.value = true;
      try {
        const query = new URLSearchParams();
        if (options.selectedInstanceId.value && options.selectedInstanceId.value !== "all") {
          query.set("instanceId", options.selectedInstanceId.value);
        }
        const statusResponse = await options.apiFetch<WhatsAppStatusResponse>(
          `/tenant/whatsapp/status${query.size ? `?${query.toString()}` : ""}`
        );
        options.whatsappStatus.value = statusResponse;
      } catch {
        if (options.whatsappStatus.value) {
          options.whatsappStatus.value = {
            ...options.whatsappStatus.value,
            message: "Status temporariamente indisponivel. Mantendo ultimo estado conhecido."
          };
        } else {
          options.whatsappStatus.value = {
            configured: false,
            message: "Nao foi possivel consultar status do canal WhatsApp."
          };
        }
      } finally {
        lastStatusFetchedAt = Date.now();
        options.loadingWhatsAppStatus.value = false;
      }
    })();

    statusRequestInFlight = request;
    try {
      await request;
    } finally {
      if (statusRequestInFlight === request) {
        statusRequestInFlight = null;
      }
    }
  }

  async function loadUsers() {
    options.loadingUsers.value = true;
    try {
      const response = await options.apiFetch<unknown>("/users");
      options.users.value = toArrayOrEmpty<TenantUser>(response);
    } finally {
      options.loadingUsers.value = false;
    }
  }

  async function loadContacts() {
    options.loadingContacts.value = true;
    try {
      const response = await options.apiFetch<unknown>("/contacts");
      options.contacts.value = toArrayOrEmpty<Contact>(response);
      options.sortContacts();
    } finally {
      options.loadingContacts.value = false;
    }
  }

  async function loadAccessibleWhatsAppInstances() {
    const response = await options.apiFetch<WhatsAppInstanceAccessResponse>("/tenant/whatsapp/instances/access");
    options.whatsappInstances.value = Array.isArray(response.instances) ? response.instances : [];
  }

  return {
    loadTenantUploadLimit,
    loadWhatsAppStatus,
    loadUsers,
    loadContacts,
    loadAccessibleWhatsAppInstances
  };
}
