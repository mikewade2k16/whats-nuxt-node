import { useAdminSession } from "~/composables/useAdminSession";
import { isAdminSessionInvalidError } from "~/utils/admin-session";

interface ApiClientErrorOptions {
  statusCode?: number;
  data?: unknown;
}

export class ApiClientError extends Error {
  statusCode: number;
  data: unknown;

  constructor(message: string, options: ApiClientErrorOptions = {}) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = options.statusCode ?? 500;
    this.data = options.data ?? null;
  }
}

function toErrorMessage(error: unknown, fallback = "Operacao falhou") {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: Record<string, unknown> }).data;
    if (data && typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function withLeadingSlash(path: string) {
  if (path.startsWith("/")) {
    return path;
  }

  return `/${path}`;
}

function normalizeHeaders(input: HeadersInit | undefined) {
  if (!input) {
    return {} as Record<string, string>;
  }

  if (input instanceof Headers) {
    return Object.fromEntries(input.entries());
  }

  if (Array.isArray(input)) {
    return Object.fromEntries(input.map(([key, value]) => [String(key), String(value)]));
  }

  return Object.entries(input).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (value === undefined || value === null) {
      return accumulator;
    }

    accumulator[String(key)] = String(value);
    return accumulator;
  }, {});
}

export function useApi() {
  const sessionSimulation = useSessionSimulationStore();
  const { token, coreToken, tenantSlug, invalidateSession } = useAdminSession();
  const DEFAULT_TIMEOUT_MS = 30_000;

  async function apiFetch<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) {
    const headers = new Headers(normalizeHeaders(options.headers as HeadersInit | undefined));
    const accessToken = coreToken.value || token.value;
    const shellContextHeaders = normalizeHeaders(sessionSimulation.requestHeaders as HeadersInit | undefined);

    for (const [key, value] of Object.entries(shellContextHeaders)) {
      headers.set(key, value);
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    if (coreToken.value) {
      headers.set("x-core-token", coreToken.value);
    }

    if (tenantSlug.value) {
      headers.set("x-selected-tenant-slug", tenantSlug.value);
    }

    const normalizedPath = withLeadingSlash(path);

    try {
      return await $fetch<T>(`/api/bff${normalizedPath}`, {
        ...options,
        headers,
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS
      });
    } catch (error: unknown) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode ?? 500)
          : 500;

      if (isAdminSessionInvalidError(error)) {
        void invalidateSession({ redirectToLogin: true });
      }

      throw new ApiClientError(toErrorMessage(error), {
        statusCode,
        data: error && typeof error === "object" && "data" in error ? (error as { data?: unknown }).data : null
      });
    }
  }

  return { apiFetch };
}
