export interface CoreAuthUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  tenantId?: string;
  clientId?: number | null;
  clientName?: string;
  level?: string;
  userType?: string;
  moduleCodes?: string[];
  atendimentoAccess?: boolean;
}

interface CoreTenant {
  id: string;
  slug: string;
  name: string;
}

interface CoreLoginResponse {
  accessToken?: string;
  expiresAt?: string | null;
  user?: CoreAuthUser;
}

interface CoreItemsResponse<T> {
  items?: T[];
}

interface ResolvedScriptTenant {
  coreTenant: CoreTenant;
  selectedTenantSlug: string;
}

export interface ScriptAuthSession {
  token: string;
  expiresAt: string | null;
  coreUser: CoreAuthUser;
  tenantId: string;
  tenantSlug: string;
}

const CORE_API_BASE_URL = String(process.env.CORE_API_BASE_URL ?? "http://localhost:4100").replace(/\/+$/, "");
const CORE_API_EMAIL = String(process.env.CORE_API_EMAIL ?? "root@core.local").trim();
const CORE_API_PASSWORD = String(process.env.CORE_API_PASSWORD ?? "123456").trim();
const CORE_REQUEST_TIMEOUT_MS = Number(process.env.CORE_REQUEST_TIMEOUT_MS ?? 15_000);

let cachedServiceToken: string | null = null;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

async function requestCore<T>(path: string, options: {
  method?: "GET" | "POST";
  token?: string | null;
  body?: unknown;
} = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), CORE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${CORE_API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        "Content-Type": "application/json"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    const rawText = await response.text();
    let parsedBody: unknown = null;
    if (rawText.length > 0) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = rawText;
      }
    }

    if (!response.ok) {
      const message =
        parsedBody && typeof parsedBody === "object" && "message" in parsedBody
          ? String((parsedBody as { message?: unknown }).message ?? "")
          : rawText;
      throw new Error(message || `HTTP ${response.status} ${path}`);
    }

    return parsedBody as T;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function ensureServiceToken() {
  if (cachedServiceToken) {
    return cachedServiceToken;
  }

  const response = await requestCore<CoreLoginResponse>("/core/auth/login", {
    method: "POST",
    body: {
      email: CORE_API_EMAIL,
      password: CORE_API_PASSWORD
    }
  });

  const accessToken = normalizeText(response.accessToken);
  if (!accessToken) {
    throw new Error("Falha ao obter token tecnico do plataforma-api.");
  }

  cachedServiceToken = accessToken;
  return accessToken;
}

async function resolveTenantBySlug(tenantSlug: string) {
  const serviceToken = await ensureServiceToken();
  const response = await requestCore<CoreItemsResponse<CoreTenant>>("/core/tenants", {
    token: serviceToken
  });

  const normalizedSlug = normalizeText(tenantSlug).toLowerCase();
  const items = Array.isArray(response.items) ? response.items : [];

  const candidates = [normalizedSlug];
  if (normalizedSlug && !normalizedSlug.endsWith("-core")) {
    candidates.push(`${normalizedSlug}-core`);
  }

  for (const candidate of candidates) {
    const matched = items.find((entry) => normalizeText(entry.slug).toLowerCase() === candidate) ?? null;
    if (matched) {
      return {
        coreTenant: matched,
        selectedTenantSlug: normalizedSlug
      } satisfies ResolvedScriptTenant;
    }
  }

  return null;
}

export async function loginWithCoreSession(options: {
  tenantSlug: string;
  email: string;
  password: string;
}): Promise<ScriptAuthSession> {
  const tenantSlug = normalizeText(options.tenantSlug).toLowerCase();
  const email = normalizeEmail(options.email);
  const password = normalizeText(options.password);

  if (!tenantSlug || !email || !password) {
    throw new Error("tenantSlug, email e password sao obrigatorios para autenticar no plataforma-api.");
  }

  const resolvedTenant = await resolveTenantBySlug(tenantSlug);
  if (!resolvedTenant) {
    throw new Error(`Tenant \"${tenantSlug}\" nao encontrado no plataforma-api.`);
  }

  const coreTenant = resolvedTenant.coreTenant;

  const coreLogin = await requestCore<CoreLoginResponse>("/core/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      tenantId: coreTenant.id
    }
  });

  const accessToken = normalizeText(coreLogin.accessToken);
  if (!accessToken || !coreLogin.user) {
    throw new Error("Resposta invalida do plataforma-api durante o login.");
  }

  if (normalizeEmail(coreLogin.user.email) !== email) {
    throw new Error("Falha ao autenticar usuario no plataforma-api.");
  }

  return {
    token: accessToken,
    expiresAt: coreLogin.expiresAt ?? null,
    coreUser: coreLogin.user,
    tenantId: coreTenant.id,
    tenantSlug: resolvedTenant.selectedTenantSlug
  };
}