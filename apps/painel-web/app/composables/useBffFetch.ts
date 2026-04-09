import { useAdminSession } from "~/composables/useAdminSession";
import { extractFetchStatusCode, isAdminSessionInvalidError } from "~/utils/admin-session";

type BffHeadersInput = HeadersInit | Record<string, string> | undefined

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
  const { coreToken, invalidateSession } = useAdminSession()

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
      if (isAdminSessionInvalidError(error)) {
        void invalidateSession({ redirectToLogin: true })
      }

      throw error
    }
  }

  return {
    bffFetch
  }
}
