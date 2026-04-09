import { createError, getHeader, type H3Event } from 'h3'
import { getCoreSessionToken } from '~~/server/utils/core-session-cookie'
import { fetchInternalUpstream, resolveInternalTargetUrl } from '~~/server/utils/internal-upstream'
import { sanitizeServerStatusMessage, sanitizeTransportErrorData, sanitizeUpstreamPayload } from '~~/server/utils/safe-error'

interface CoreAdminFetchOptions {
  method?: string
  body?: unknown
}

type CoreAuthEventContext = H3Event['context'] & {
  normalizedCoreAuthorization?: string
}

function getCoreAuthContext(event: H3Event) {
  return event.context as CoreAuthEventContext
}

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    const normalized = String(value).trim()
    if (!normalized) continue
    params.set(key, normalized)
  }
  const built = params.toString()
  return built ? `?${built}` : ''
}

export function normalizeCoreAuthorizationHeader(event: H3Event) {
  const context = getCoreAuthContext(event)
  const cached = String(context.normalizedCoreAuthorization ?? '').trim()
  if (cached) {
    event.node.req.headers.authorization = cached
    return cached
  }

  const authorization = String(getHeader(event, 'authorization') ?? '').trim()
  if (authorization) {
    context.normalizedCoreAuthorization = authorization
    event.node.req.headers.authorization = authorization
    return authorization
  }

  const coreToken = String(getHeader(event, 'x-core-token') ?? '').trim()
  if (coreToken) {
    const normalized = coreToken.startsWith('Bearer ') ? coreToken : `Bearer ${coreToken}`
    context.normalizedCoreAuthorization = normalized
    event.node.req.headers.authorization = normalized
    return normalized
  }

  const cookieToken = getCoreSessionToken(event)
  if (!cookieToken) return ''

  const normalized = cookieToken.startsWith('Bearer ') ? cookieToken : `Bearer ${cookieToken}`
  context.normalizedCoreAuthorization = normalized
  event.node.req.headers.authorization = normalized
  return normalized
}

function extractCoreToken(event: H3Event) {
  return normalizeCoreAuthorizationHeader(event)
}

export async function coreAdminFetch<T>(event: H3Event, path: string, options: CoreAdminFetchOptions = {}) {
  const config = useRuntimeConfig(event)
  const base = String(config.coreApiInternalBase ?? '').replace(/\/+$/, '')
  if (!base) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CORE API internal base nao configurada.'
    })
  }

  const token = extractCoreToken(event)
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sessao core ausente. Faca login novamente.'
    })
  }

  let response: Response

  try {
    response = await fetchInternalUpstream({
      event,
      targetUrl: resolveInternalTargetUrl(base, path),
      fetchInit: {
        method: options.method ?? 'GET',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      },
      statusMessage: 'Falha ao conectar no backend core.',
      fallbackMessage: 'Erro de rede no core'
    })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 502,
      statusMessage: 'Falha ao conectar no backend core.',
      data: sanitizeTransportErrorData(event, error instanceof Error ? error.message : 'Erro de rede no core')
    })
  }

  const raw = await response.text()
  const payload = raw ? safeParseJSON(raw) : null

  if (!response.ok) {
    const fallbackMessage = response.statusText || 'Falha no backend core'
      const payloadMessage = typeof payload === 'object' && payload !== null
      ? String((payload as Record<string, unknown>).message ?? '').trim()
      : ''

    throw createError({
      statusCode: response.status,
      statusMessage: sanitizeServerStatusMessage(event, response.status, payloadMessage || fallbackMessage, 'Falha no backend core.'),
      data: sanitizeUpstreamPayload(event, response.status, payload, 'Falha no backend core.')
    })
  }

  return payload as T
}

export function buildCoreQuery(query: Record<string, string | number | undefined>) {
  return toQueryString(query)
}

function safeParseJSON(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
