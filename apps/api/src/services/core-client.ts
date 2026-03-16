import axios, { AxiosError, type AxiosRequestConfig, type Method } from "axios";
import { env } from "../config.js";

export interface CoreTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  contactEmail?: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoreAdminClient {
  id: number;
  coreTenantId: string;
  name: string;
  status: string;
  modules?: Array<{
    code?: string;
    name?: string;
    status?: string;
  }>;
}

export interface CoreAdminUser {
  id: number;
  coreUserId: string;
  isPlatformAdmin: boolean;
  level: string;
  clientId: number | null;
  clientName: string;
  name: string;
  nick: string;
  email: string;
  phone: string;
  status: string;
  profileImage: string;
  userType: string;
  preferences?: unknown;
  moduleCodes?: string[];
  atendimentoAccess?: boolean;
}

export interface CoreTenantUser {
  tenantUserId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  isOwner: boolean;
  joinedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface CoreTenantUserRole {
  tenantUserRoleId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  assignedAt: string;
}

export interface CoreAuthUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  tenantId?: string;
}

interface CoreAuthLoginResponse {
  accessToken: string;
  expiresAt?: string;
  user?: CoreAuthUser;
}

interface CoreItemsResponse<T> {
  items: T[];
  meta?: unknown;
}

interface InviteTenantUserPayload {
  email: string;
  name: string;
  password?: string;
  isOwner?: boolean;
  roleCodes?: string[];
}

export interface InviteTenantUserResponse {
  tenantUserId: string;
  userId: string;
  createdUser: boolean;
}

interface CoreResolvedLimitPayload {
  tenantId?: string;
  moduleCode?: string;
  limitKey?: string;
  resolved?: {
    isUnlimited?: boolean;
    value?: number | null;
    source?: string;
  };
}

export class CoreApiError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode = 500, details: unknown = null) {
    super(message);
    this.name = "CoreApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function removeTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

type CoreRequestOptions = {
  params?: Record<string, unknown>;
  data?: unknown;
  timeoutMs?: number;
};

export class PlatformCoreClient {
  private readonly baseUrl: string;
  private readonly loginEmail: string;
  private readonly loginPassword: string;
  private readonly timeoutMs: number;
  private accessToken: string | null = null;
  private accessTokenExpiresAtMs = 0;

  constructor(config: {
    baseUrl: string;
    loginEmail: string;
    loginPassword: string;
    timeoutMs: number;
  }) {
    this.baseUrl = removeTrailingSlash(config.baseUrl);
    this.loginEmail = config.loginEmail;
    this.loginPassword = config.loginPassword;
    this.timeoutMs = config.timeoutMs;
  }

  private isTokenValidNow() {
    if (!this.accessToken) {
      return false;
    }

    if (this.accessTokenExpiresAtMs <= 0) {
      return true;
    }

    const now = Date.now();
    // Refresh a few seconds before expiry to avoid edge race.
    return now + 10_000 < this.accessTokenExpiresAtMs;
  }

  private clearToken() {
    this.accessToken = null;
    this.accessTokenExpiresAtMs = 0;
  }

  private async ensureAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.isTokenValidNow()) {
      return this.accessToken as string;
    }

    const payload = {
      email: this.loginEmail,
      password: this.loginPassword
    };

    try {
      const response = await axios.request<CoreAuthLoginResponse>({
        method: "POST",
        url: `${this.baseUrl}/core/auth/login`,
        data: payload,
        timeout: this.timeoutMs
      });

      const accessToken = response.data.accessToken?.trim();
      if (!accessToken) {
        throw new CoreApiError("Resposta invalida do platform-core (token ausente).", 500, response.data);
      }

      this.accessToken = accessToken;

      const expiresAtRaw = response.data.expiresAt;
      const expiresAtMs = expiresAtRaw ? Date.parse(expiresAtRaw) : Number.NaN;
      this.accessTokenExpiresAtMs = Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
      return accessToken;
    } catch (error) {
      if (error instanceof CoreApiError) {
        throw error;
      }

      if (error instanceof AxiosError) {
        const statusCode = error.response?.status ?? 500;
        const details = error.response?.data ?? null;
        const message =
          (typeof details === "object" &&
            details !== null &&
            "message" in details &&
            typeof (details as { message?: unknown }).message === "string" &&
            String((details as { message: string }).message).trim()) ||
          error.message ||
          "Falha ao autenticar no platform-core.";
        throw new CoreApiError(message, statusCode, details);
      }

      throw new CoreApiError("Falha ao autenticar no platform-core.", 500, null);
    }
  }

  async loginUser(credentials: { email: string; password: string; tenantId?: string }) {
    const payload: Record<string, string> = {
      email: credentials.email,
      password: credentials.password
    };

    if (credentials.tenantId?.trim()) {
      payload.tenantId = credentials.tenantId.trim();
    }

    try {
      const response = await axios.request<CoreAuthLoginResponse>({
        method: "POST",
        url: `${this.baseUrl}/core/auth/login`,
        data: payload,
        timeout: this.timeoutMs
      });

      const accessToken = response.data.accessToken?.trim();
      if (!accessToken) {
        throw new CoreApiError("Resposta invalida do platform-core (token ausente).", 500, response.data);
      }

      const user = response.data.user;
      if (!user) {
        throw new CoreApiError("Resposta invalida do platform-core (usuario ausente).", 500, response.data);
      }

      return {
        accessToken,
        expiresAt: response.data.expiresAt ?? null,
        user
      };
    } catch (error) {
      if (error instanceof CoreApiError) {
        throw error;
      }

      if (error instanceof AxiosError) {
        const statusCode = error.response?.status ?? 500;
        const details = error.response?.data ?? null;
        const message =
          (typeof details === "object" &&
            details !== null &&
            "message" in details &&
            typeof (details as { message?: unknown }).message === "string" &&
            String((details as { message: string }).message).trim()) ||
          error.message ||
          "Falha ao autenticar usuario no platform-core.";
        throw new CoreApiError(message, statusCode, details);
      }

      throw new CoreApiError("Falha ao autenticar usuario no platform-core.", 500, null);
    }
  }

  private async request<T>(
    method: Method,
    path: string,
    options: CoreRequestOptions = {},
    allowRetry = true
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    const requestConfig: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${normalizedPath}`,
      timeout: options.timeoutMs ?? this.timeoutMs,
      params: options.params,
      data: options.data,
      headers: {
        Authorization: `Bearer ${token}`
      }
    };

    try {
      const response = await axios.request<T>(requestConfig);
      return response.data;
    } catch (error) {
      if (!(error instanceof AxiosError)) {
        throw new CoreApiError("Erro inesperado no platform-core.", 500, null);
      }

      const statusCode = error.response?.status ?? 500;
      const details = error.response?.data ?? null;

      if (statusCode === 401 && allowRetry) {
        this.clearToken();
        return this.request<T>(method, path, options, false);
      }

      const message =
        (typeof details === "object" &&
          details !== null &&
          "message" in details &&
          typeof (details as { message?: unknown }).message === "string" &&
          String((details as { message: string }).message).trim()) ||
        error.message ||
        "Falha na chamada ao platform-core.";

      throw new CoreApiError(message, statusCode, details);
    }
  }

  async listTenants() {
    const response = await this.request<CoreItemsResponse<CoreTenant>>("GET", "/core/tenants");
    return Array.isArray(response.items) ? response.items : [];
  }

  async listAdminClients(options: { page?: number; limit?: number; status?: string; q?: string } = {}) {
    const response = await this.request<CoreItemsResponse<CoreAdminClient>>("GET", "/core/admin/clients", {
      params: {
        page: options.page ?? 1,
        limit: options.limit ?? 200,
        status: options.status,
        q: options.q
      }
    });
    return Array.isArray(response.items) ? response.items : [];
  }

  async findTenantBySlug(slug: string) {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) {
      return null;
    }

    const tenants = await this.listTenants();
    return tenants.find((entry) => entry.slug.trim().toLowerCase() === normalizedSlug) ?? null;
  }

  async findTenantById(tenantId: string) {
    const normalizedId = tenantId.trim();
    if (!normalizedId) {
      return null;
    }

    const tenants = await this.listTenants();
    return tenants.find((entry) => entry.id === normalizedId) ?? null;
  }

  async listTenantUsers(tenantId: string) {
    const response = await this.request<CoreItemsResponse<CoreTenantUser>>(
      "GET",
      `/core/tenants/${encodeURIComponent(tenantId)}/users`
    );
    return Array.isArray(response.items) ? response.items : [];
  }

  async listTenantUserRoles(tenantId: string, tenantUserId: string) {
    const response = await this.request<CoreItemsResponse<CoreTenantUserRole>>(
      "GET",
      `/core/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(tenantUserId)}/roles`
    );
    return Array.isArray(response.items) ? response.items : [];
  }

  inviteTenantUser(tenantId: string, payload: InviteTenantUserPayload) {
    return this.request<InviteTenantUserResponse>(
      "POST",
      `/core/tenants/${encodeURIComponent(tenantId)}/users/invite`,
      {
        data: payload
      }
    );
  }

  assignTenantUserToModule(tenantId: string, moduleCode: string, tenantUserId: string) {
    return this.request<Record<string, unknown>>(
      "POST",
      `/core/tenants/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(moduleCode)}/users/${encodeURIComponent(tenantUserId)}/assign`
    );
  }

  unassignTenantUserFromModule(tenantId: string, moduleCode: string, tenantUserId: string) {
    return this.request<Record<string, unknown>>(
      "DELETE",
      `/core/tenants/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(moduleCode)}/users/${encodeURIComponent(tenantUserId)}/assign`
    );
  }

  async listAdminUsers(options: { page?: number; limit?: number; q?: string; clientId?: number | string | null } = {}) {
    const response = await this.request<CoreItemsResponse<CoreAdminUser>>("GET", "/core/admin/users", {
      params: {
        page: options.page ?? 1,
        limit: options.limit ?? 200,
        q: options.q,
        clientId: options.clientId ?? undefined
      }
    });
    return Array.isArray(response.items) ? response.items : [];
  }

  async resolveModuleLimit(tenantId: string, moduleCode: string, limitKey: string) {
    const response = await this.request<CoreResolvedLimitPayload>(
      "GET",
      `/core/tenants/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(moduleCode)}/limits/${encodeURIComponent(limitKey)}`
    );

    return {
      isUnlimited: Boolean(response?.resolved?.isUnlimited),
      value: typeof response?.resolved?.value === "number" ? response.resolved.value : null,
      source: String(response?.resolved?.source ?? "").trim() || "default"
    };
  }

  upsertModuleLimit(
    tenantId: string,
    moduleCode: string,
    limitKey: string,
    payload: { valueInt?: number | null; isUnlimited?: boolean; source?: string; notes?: string | null }
  ) {
    return this.request<Record<string, unknown>>(
      "PUT",
      `/core/tenants/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(moduleCode)}/limits/${encodeURIComponent(limitKey)}`,
      {
        data: {
          valueInt: payload.valueInt ?? null,
          isUnlimited: Boolean(payload.isUnlimited),
          source: payload.source,
          notes: payload.notes ?? undefined
        }
      }
    );
  }
}

export const platformCoreClient = new PlatformCoreClient({
  baseUrl: env.CORE_API_BASE_URL,
  loginEmail: env.CORE_API_EMAIL,
  loginPassword: env.CORE_API_PASSWORD,
  timeoutMs: env.CORE_REQUEST_TIMEOUT_MS
});
