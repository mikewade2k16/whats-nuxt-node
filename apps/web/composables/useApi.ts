export function useApi() {
  const config = useRuntimeConfig();
  const { token } = useAuth();

  async function apiFetch<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    if (token.value) {
      headers.set("Authorization", `Bearer ${token.value}`);
    }

    return $fetch<T>(`${config.public.apiBase}${path}`, {
      ...options,
      headers
    });
  }

  return { apiFetch };
}

