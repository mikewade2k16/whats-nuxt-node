import { createError, deleteCookie, getCookie, type H3Event, setCookie } from 'h3'
import { fetchInternalUpstream, resolveInternalTargetUrl } from '~~/server/utils/internal-upstream'
import { sanitizeServerStatusMessage, sanitizeTransportErrorData, sanitizeUpstreamPayload } from '~~/server/utils/safe-error'

const FILA_ATENDIMENTO_SESSION_COOKIE = 'omni_fila_atendimento_token'

interface FilaAtendimentoFetchOptions {
  method?: string
  body?: unknown
  token?: string
  allowAnonymous?: boolean
}

function normalizeBaseUrl(value: unknown) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

function safeParseJSON(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function getFilaAtendimentoSessionToken(event: H3Event) {
  return String(getCookie(event, FILA_ATENDIMENTO_SESSION_COOKIE) ?? '').trim()
}

export function setFilaAtendimentoSessionToken(event: H3Event, accessToken: string, expiresInSeconds: number) {
  const maxAge = Math.max(60, Number(expiresInSeconds || 0) || 60)

  setCookie(event, FILA_ATENDIMENTO_SESSION_COOKIE, String(accessToken || '').trim(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge
  })
}

export function clearFilaAtendimentoSessionToken(event: H3Event) {
  deleteCookie(event, FILA_ATENDIMENTO_SESSION_COOKIE, {
    path: '/'
  })
}

export function getFilaAtendimentoApiInternalBase(event: H3Event) {
  const config = useRuntimeConfig(event)
  const base = normalizeBaseUrl(config.filaAtendimentoApiInternalBase)
  if (!base) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Base interna da API do fila-atendimento nao configurada.'
    })
  }

  return base
}

export async function filaAtendimentoFetch<T>(event: H3Event, path: string, options: FilaAtendimentoFetchOptions = {}) {
  const token = String(options.token || getFilaAtendimentoSessionToken(event)).trim()
  if (!options.allowAnonymous && !token) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Sessao do modulo fila-atendimento ausente.'
    })
  }

  let response: Response

  try {
    response = await fetchInternalUpstream({
      event,
      targetUrl: resolveInternalTargetUrl(getFilaAtendimentoApiInternalBase(event), path),
      fetchInit: {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      },
      statusMessage: 'Falha ao conectar na API do fila-atendimento.',
      fallbackMessage: 'Erro de rede no fila-atendimento'
    })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 502,
      statusMessage: 'Falha ao conectar na API do fila-atendimento.',
      data: sanitizeTransportErrorData(event, error instanceof Error ? error.message : 'Erro de rede no fila-atendimento')
    })
  }

  const raw = await response.text()
  const payload = raw ? safeParseJSON(raw) : null

  if (!response.ok) {
    if (response.status === 401) {
      clearFilaAtendimentoSessionToken(event)

      throw createError({
        statusCode: 409,
        statusMessage: 'Sessao do modulo fila-atendimento expirou. Reconecte o modulo.',
        data: sanitizeUpstreamPayload(event, response.status, payload, 'Sessao do modulo expirada.')
      })
    }

    const fallbackMessage = response.statusText || 'Falha na API do fila-atendimento'
    const payloadMessage = typeof payload === 'object' && payload !== null
      ? String((payload as Record<string, unknown>).message ?? '').trim()
      : ''

    throw createError({
      statusCode: response.status,
      statusMessage: sanitizeServerStatusMessage(
        event,
        response.status,
        payloadMessage || fallbackMessage,
        'Falha na API do fila-atendimento.'
      ),
      data: sanitizeUpstreamPayload(event, response.status, payload, 'Falha na API do fila-atendimento.')
    })
  }

  return payload as T
}
