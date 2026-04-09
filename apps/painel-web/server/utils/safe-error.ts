import type { H3Event } from 'h3'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function isProductionRuntime(event?: H3Event) {
  if (event) {
    const config = useRuntimeConfig(event)
    const runtimeValue = normalizeText((config as Record<string, unknown>).appEnv ?? process.env.NODE_ENV)
    return runtimeValue.toLowerCase() === 'production'
  }

  return normalizeText(process.env.NODE_ENV).toLowerCase() === 'production'
}

export function sanitizeServerStatusMessage(
  event: H3Event,
  statusCode: number,
  rawMessage: unknown,
  serverFallback: string
) {
  const fallback = normalizeText(serverFallback) || 'Erro interno do servidor.'
  const message = normalizeText(rawMessage) || fallback

  if (!isProductionRuntime(event)) {
    return message
  }

  if (statusCode >= 500) {
    return fallback
  }

  return message
}

export function sanitizeTransportErrorData(event: H3Event, message: string) {
  if (isProductionRuntime(event)) {
    return undefined
  }

  return {
    message: normalizeText(message) || 'Transport error'
  }
}

export function sanitizeUpstreamPayload(
  event: H3Event,
  statusCode: number,
  payload: unknown,
  fallbackMessage: string
) {
  if (!isProductionRuntime(event)) {
    return payload
  }

  const fallback = normalizeText(fallbackMessage) || 'Erro interno do servidor.'

  if (statusCode >= 500) {
    return {
      message: fallback
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      message: fallback
    }
  }

  const raw = payload as Record<string, unknown>
  const safePayload: Record<string, unknown> = {
    message: normalizeText(raw.message ?? raw.statusMessage) || fallback
  }

  if (statusCode === 400 && raw.errors && typeof raw.errors === 'object') {
    safePayload.errors = raw.errors
  }

  return safePayload
}
