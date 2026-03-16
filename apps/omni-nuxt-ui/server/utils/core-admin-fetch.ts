import { createError, getHeader, type H3Event } from 'h3'
import { sanitizeServerStatusMessage, sanitizeTransportErrorData, sanitizeUpstreamPayload } from '~~/server/utils/safe-error'

interface CoreAdminFetchOptions {
  method?: string
  body?: unknown
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

function extractCoreToken(event: H3Event) {
  const authorization = String(getHeader(event, 'authorization') ?? '').trim()
  if (authorization) return authorization

  const coreToken = String(getHeader(event, 'x-core-token') ?? '').trim()
  if (!coreToken) return ''
  return coreToken.startsWith('Bearer ') ? coreToken : `Bearer ${coreToken}`
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

  const target = `${base}${path}`
  let response: Response

  try {
    response = await fetch(target, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
  } catch (error: unknown) {
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
