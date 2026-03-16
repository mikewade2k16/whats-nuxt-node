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

export function useApi() {
  const { token } = useAuth();
  const DEFAULT_TIMEOUT_MS = 20_000;

  async function apiFetch<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    if (token.value) {
      headers.set("Authorization", `Bearer ${token.value}`);
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

      throw new ApiClientError(toErrorMessage(error), {
        statusCode,
        data: error && typeof error === "object" && "data" in error ? (error as { data?: unknown }).data : null
      });
    }
  }

  return { apiFetch };
}
