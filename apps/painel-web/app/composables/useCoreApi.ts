export interface CoreApiClientErrorOptions {
  statusCode?: number;
  data?: unknown;
}

export class CoreApiClientError extends Error {
  statusCode: number;
  data: unknown;

  constructor(message: string, options: CoreApiClientErrorOptions = {}) {
    super(message);
    this.name = "CoreApiClientError";
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

export function useCoreApi() {
  const { token } = useCoreAuth();
  const DEFAULT_TIMEOUT_MS = 30_000;

  async function coreApiFetch<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    if (token.value) {
      headers.set("Authorization", `Bearer ${token.value}`);
    }

    const normalizedPath = withLeadingSlash(path);

    try {
      return await $fetch<T>(`/api/core-bff${normalizedPath}`, {
        ...options,
        headers,
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS
      });
    } catch (error: unknown) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode ?? 500)
          : 500;

      throw new CoreApiClientError(toErrorMessage(error), {
        statusCode,
        data: error && typeof error === "object" && "data" in error ? (error as { data?: unknown }).data : null
      });
    }
  }

  return { coreApiFetch };
}
