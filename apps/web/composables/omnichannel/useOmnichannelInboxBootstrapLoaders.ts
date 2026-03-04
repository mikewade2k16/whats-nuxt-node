import type { Ref } from "vue";
import type { Contact, TenantSettings, TenantUser, WhatsAppStatusResponse } from "~/types";
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
  loadingWhatsAppStatus: Ref<boolean>;
  loadingUsers: Ref<boolean>;
  loadingContacts: Ref<boolean>;
  apiFetch: <T = unknown>(path: string, init?: Record<string, unknown>) => Promise<T>;
  sortContacts: () => void;
}) {
  async function loadTenantUploadLimit() {
    try {
      const tenantSettings = await options.apiFetch<TenantSettings>("/tenant");
      options.tenantMaxUploadMb.value = normalizeTenantUploadLimitMb(tenantSettings.maxUploadMb);
    } catch {
      options.tenantMaxUploadMb.value = DEFAULT_MAX_UPLOAD_MB;
    }
  }

  async function loadWhatsAppStatus() {
    options.loadingWhatsAppStatus.value = true;
    try {
      const statusResponse = await options.apiFetch<WhatsAppStatusResponse>("/tenant/whatsapp/status");
      options.whatsappStatus.value = statusResponse;
    } catch {
      options.whatsappStatus.value = {
        configured: false,
        message: "Nao foi possivel consultar status do canal WhatsApp."
      };
    } finally {
      options.loadingWhatsAppStatus.value = false;
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

  return {
    loadTenantUploadLimit,
    loadWhatsAppStatus,
    loadUsers,
    loadContacts
  };
}
