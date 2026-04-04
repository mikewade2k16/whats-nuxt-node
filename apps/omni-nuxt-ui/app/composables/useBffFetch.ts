type BffHeadersInput = HeadersInit | Record<string, string> | undefined

function extractFetchStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return 0

  if ('statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode)
    return Number.isFinite(statusCode) ? statusCode : 0
  }

  if ('status' in error) {
    const statusCode = Number((error as { status?: unknown }).status)
    return Number.isFinite(statusCode) ? statusCode : 0
  }

  return 0
}

function normalizeHeaders(input: BffHeadersInput) {
  if (!input) return {} as Record<string, string>

  if (input instanceof Headers) {
    return Object.fromEntries(input.entries())
  }

  if (Array.isArray(input)) {
    return Object.fromEntries(input.map(([key, value]) => [String(key), String(value)]))
  }

  return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value === undefined || value === null) return acc
    acc[String(key)] = String(value)
    return acc
  }, {})
}

export function useBffFetch() {
  const sessionSimulation = useSessionSimulationStore()
  const { token: coreToken } = useCoreAuth()
  const { clearSession } = useAuth()
  const { clearSession: clearCoreSession } = useCoreAuth()

  async function bffFetch<T>(url: string, options: Parameters<typeof $fetch>[1] = {}) {
    const baseHeaders = normalizeHeaders(options?.headers as BffHeadersInput)
    const accessHeaders = normalizeHeaders(sessionSimulation.requestHeaders)
    const authHeaders = coreToken.value
      ? { 'x-core-token': coreToken.value }
      : {}

    try {
      return await $fetch<T>(url, {
        ...options,
        headers: {
          ...baseHeaders,
          ...accessHeaders,
          ...authHeaders
        }
      })
    } catch (error) {
      const statusCode = extractFetchStatusCode(error)
      if (statusCode === 401) {
        clearSession()
        clearCoreSession()
        sessionSimulation.reset()
        if (import.meta.client) {
          void navigateTo('/admin/login')
        }
      }

      throw error
    }
  }

  return {
    bffFetch
  }
}
