import { defineWebSocketHandler } from 'h3'
import WebSocket from 'ws'

const CORE_SESSION_COOKIE = 'omni_core_session'

interface TenantRealtimePeerRequest {
  url?: string
  headers?: Headers | { get?: (name: string) => string | null } | Record<string, unknown>
}

interface TenantRealtimePeer {
  request?: TenantRealtimePeerRequest
  send: (data: string) => void
  close?: (code?: number, reason?: string) => void
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeBaseUrl(value: unknown) {
  return normalizeText(value).replace(/\/+$/, '')
}

function readQueryFromRequestUrl(requestUrl: string | undefined) {
  if (!requestUrl) {
    return {} as Record<string, string>
  }

  try {
    const parsed = new URL(requestUrl, 'http://localhost')
    return Object.fromEntries(parsed.searchParams.entries())
  } catch {
    return {} as Record<string, string>
  }
}

function readHeader(request: TenantRealtimePeerRequest | undefined, headerName: string) {
  const headers = request?.headers
  if (!headers) {
    return ''
  }

  if (typeof (headers as Headers).get === 'function') {
    return normalizeText((headers as Headers).get(headerName))
  }

  const raw = (headers as Record<string, unknown>)[headerName] ?? (headers as Record<string, unknown>)[headerName.toLowerCase()]
  return normalizeText(raw)
}

function readCookieValue(cookieHeader: string, cookieName: string) {
  if (!cookieHeader || !cookieName) {
    return ''
  }

  const prefix = `${cookieName}=`
  for (const rawPart of cookieHeader.split(';')) {
    const part = rawPart.trim()
    if (!part.startsWith(prefix)) {
      continue
    }

    const value = part.slice(prefix.length)
    if (!value) {
      return ''
    }

    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return ''
}

function toMessageText(data: unknown) {
  if (typeof data === 'string') {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }

  if (data instanceof Blob) {
    return null
  }

  return normalizeText(data)
}

function safeSend(peer: TenantRealtimePeer, payload: unknown) {
  try {
    peer.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
  } catch {
    return
  }
}

function safeClose(peer: TenantRealtimePeer, code?: number, reason?: string) {
  try {
    peer.close?.(code, reason)
  } catch {
    return
  }
}

function buildUpstreamUrl(baseUrl: string, accessToken: string) {
  const target = new URL('./core/ws', `${baseUrl}/`)
  if (target.protocol === 'http:') {
    target.protocol = 'ws:'
  } else if (target.protocol === 'https:') {
    target.protocol = 'wss:'
  }

  target.searchParams.set('token', accessToken)
  return target.toString()
}

function buildJoinMessage(tenantId: string) {
  return JSON.stringify({
    type: 'presence.join',
    tenantId
  })
}

const upstreamSockets = new WeakMap<object, WebSocket>()

export default defineWebSocketHandler({
  open(peer) {
    const realtimePeer = peer as unknown as TenantRealtimePeer
    const runtimeConfig = useRuntimeConfig()
    const apiBase = normalizeBaseUrl(runtimeConfig.coreApiInternalBase)
    const query = readQueryFromRequestUrl(realtimePeer.request?.url)
    const tenantId = normalizeText(query.tenantId)
    const cookieHeader = readHeader(realtimePeer.request, 'cookie')
    const accessToken = readCookieValue(cookieHeader, CORE_SESSION_COOKIE)

    if (!apiBase || !accessToken || !tenantId) {
      safeSend(realtimePeer, {
        type: 'bridge.error',
        channel: 'tenant',
        message: 'Bridge realtime do tenant indisponivel para esta sessao.'
      })
      safeClose(realtimePeer, 4401, 'tenant-realtime-unavailable')
      return
    }

    let upstreamSocket: WebSocket
    try {
      upstreamSocket = new WebSocket(buildUpstreamUrl(apiBase, accessToken))
    } catch {
      safeSend(realtimePeer, {
        type: 'bridge.error',
        channel: 'tenant',
        message: 'Nao foi possivel abrir a conexao realtime do tenant.'
      })
      safeClose(realtimePeer, 1011, 'tenant-realtime-upstream-failed')
      return
    }

    upstreamSockets.set(realtimePeer as object, upstreamSocket)

    upstreamSocket.on('open', () => {
      safeSend(realtimePeer, {
        type: 'connected',
        channel: 'tenant',
        tenantId,
        ts: new Date().toISOString()
      })
      upstreamSocket.send(buildJoinMessage(tenantId))
    })

    upstreamSocket.on('message', (data) => {
      const messageText = toMessageText(data)
      if (!messageText) {
        return
      }

      safeSend(realtimePeer, messageText)
    })

    upstreamSocket.on('error', () => {
      safeSend(realtimePeer, {
        type: 'bridge.error',
        channel: 'tenant',
        message: 'Falha na ponte realtime com o backend core.'
      })
    })

    upstreamSocket.on('close', () => {
      upstreamSockets.delete(realtimePeer as object)
      safeClose(realtimePeer, 1011, 'tenant-realtime-upstream-closed')
    })
  },
  message(peer, message) {
    const realtimePeer = peer as unknown as TenantRealtimePeer
    const text = normalizeText(message.text()).toLowerCase()
    if (text === 'ping') {
      safeSend(realtimePeer, {
        type: 'pong',
        channel: 'tenant',
        ts: new Date().toISOString()
      })
    }
  },
  close(peer) {
    const realtimePeer = peer as unknown as TenantRealtimePeer
    const upstreamSocket = upstreamSockets.get(realtimePeer as object)
    if (!upstreamSocket) {
      return
    }

    upstreamSockets.delete(realtimePeer as object)
    if (upstreamSocket.readyState === WebSocket.OPEN || upstreamSocket.readyState === WebSocket.CONNECTING) {
      upstreamSocket.close()
    }
  }
})
