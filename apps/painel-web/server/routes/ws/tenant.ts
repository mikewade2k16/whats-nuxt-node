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

interface TenantRealtimeClientPublishMessage {
  type: 'tenant.event.publish'
  event?: {
    entity?: unknown
    action?: unknown
    clientId?: unknown
    payload?: unknown
    timestamp?: unknown
  }
}

interface TenantRealtimeBroadcastEvent {
  entity: string
  action: 'created' | 'updated' | 'deleted'
  clientId: number
  payload?: unknown
  timestamp: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeBaseUrl(value: unknown) {
  return normalizeText(value).replace(/\/+$/, '')
}

function normalizeAction(value: unknown) {
  const action = normalizeText(value).toLowerCase()
  if (action === 'created' || action === 'updated' || action === 'deleted') {
    return action
  }

  return ''
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(normalizeText(value), 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
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

function parseTenantRealtimePublishMessage(rawText: string) {
  if (!rawText) {
    return null
  }

  try {
    const parsed = JSON.parse(rawText) as TenantRealtimeClientPublishMessage
    if (parsed?.type !== 'tenant.event.publish' || !parsed.event) {
      return null
    }

    const entity = normalizeText(parsed.event.entity).toLowerCase()
    const action = normalizeAction(parsed.event.action)
    if (!entity || !action) {
      return null
    }

    return {
      entity,
      action,
      clientId: normalizeClientId(parsed.event.clientId),
      payload: parsed.event.payload,
      timestamp: normalizeText(parsed.event.timestamp) || new Date().toISOString()
    } satisfies TenantRealtimeBroadcastEvent
  } catch {
    return null
  }
}

const localTenantPeers = new Map<string, Set<TenantRealtimePeer>>()
const peerTenantIds = new WeakMap<object, string>()

function registerLocalPeer(tenantId: string, peer: TenantRealtimePeer) {
  const bucket = localTenantPeers.get(tenantId) ?? new Set<TenantRealtimePeer>()
  bucket.add(peer)
  localTenantPeers.set(tenantId, bucket)
  peerTenantIds.set(peer as object, tenantId)
}

function unregisterLocalPeer(peer: TenantRealtimePeer) {
  const tenantId = peerTenantIds.get(peer as object)
  if (!tenantId) {
    return
  }

  peerTenantIds.delete(peer as object)

  const bucket = localTenantPeers.get(tenantId)
  if (!bucket) {
    return
  }

  bucket.delete(peer)
  if (bucket.size === 0) {
    localTenantPeers.delete(tenantId)
  }
}

function broadcastLocalEvent(tenantId: string, event: TenantRealtimeBroadcastEvent, excludePeer?: TenantRealtimePeer) {
  const bucket = localTenantPeers.get(tenantId)
  if (!bucket || bucket.size === 0) {
    return
  }

  const payload = JSON.stringify(event)
  for (const peer of bucket) {
    if (excludePeer && peer === excludePeer) {
      continue
    }

    safeSend(peer, payload)
  }
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

    if (!accessToken || !tenantId) {
      safeSend(realtimePeer, {
        type: 'bridge.error',
        channel: 'tenant',
        message: 'Bridge realtime do tenant indisponivel para esta sessao.'
      })
      safeClose(realtimePeer, 4401, 'tenant-realtime-unavailable')
      return
    }

    registerLocalPeer(tenantId, realtimePeer)

    if (!apiBase) {
      safeSend(realtimePeer, {
        type: 'connected',
        channel: 'tenant',
        tenantId,
        mode: 'local-only',
        ts: new Date().toISOString()
      })
      return
    }

    let upstreamSocket: WebSocket
    try {
      upstreamSocket = new WebSocket(buildUpstreamUrl(apiBase, accessToken))
    } catch {
      safeSend(realtimePeer, {
        type: 'connected',
        channel: 'tenant',
        tenantId,
        mode: 'local-only',
        ts: new Date().toISOString()
      })
      return
    }

    upstreamSockets.set(realtimePeer as object, upstreamSocket)

    upstreamSocket.on('open', () => {
      safeSend(realtimePeer, {
        type: 'connected',
        channel: 'tenant',
        tenantId,
        mode: 'bridge',
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
    const rawText = normalizeText(message.text())
    const publishedEvent = parseTenantRealtimePublishMessage(rawText)
    if (publishedEvent) {
      const tenantId = peerTenantIds.get(realtimePeer as object)
      if (tenantId) {
        broadcastLocalEvent(tenantId, publishedEvent, realtimePeer)
      }
      return
    }

    const text = rawText.toLowerCase()
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
    unregisterLocalPeer(realtimePeer)

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
