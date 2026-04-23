import { defineWebSocketHandler } from 'h3'
import WebSocket from 'ws'
import { type FilaAtendimentoRealtimeTopic, verifyFilaAtendimentoRealtimeBridgeToken } from '@fila-atendimento/server/utils/fila-atendimento-realtime-bridge'

const FILA_ATENDIMENTO_SESSION_COOKIE = 'omni_fila_atendimento_token'

interface RealtimePeerRequest {
  url?: string
  headers?: Headers | { get?: (name: string) => string | null } | Record<string, unknown>
}

interface RealtimePeer {
  request?: RealtimePeerRequest
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

function readHeader(request: RealtimePeerRequest | undefined, headerName: string) {
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

  const target = `${cookieName}=`
  for (const rawPart of cookieHeader.split(';')) {
    const part = rawPart.trim()
    if (!part.startsWith(target)) {
      continue
    }

    const value = part.slice(target.length)
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

function safeSend(peer: RealtimePeer, payload: unknown) {
  try {
    peer.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
  } catch {
    return
  }
}

function safeClose(peer: RealtimePeer, code?: number, reason?: string) {
  try {
    peer.close?.(code, reason)
  } catch {
    return
  }
}

function buildUpstreamUrl(base: string, topic: FilaAtendimentoRealtimeTopic, scopeValue: string, moduleToken: string) {
  const target = new URL(`./v1/realtime/${topic}`, `${base}/`)
  if (target.protocol === 'http:') {
    target.protocol = 'ws:'
  } else if (target.protocol === 'https:') {
    target.protocol = 'wss:'
  }

  if (topic === 'operations') {
    target.searchParams.set('storeId', scopeValue)
  } else {
    target.searchParams.set('tenantId', scopeValue)
  }
  target.searchParams.set('access_token', moduleToken)
  return target.toString()
}

export function buildFilaAtendimentoRealtimeProxyHandler(topic: FilaAtendimentoRealtimeTopic) {
  const upstreamSockets = new WeakMap<object, WebSocket>()

  return defineWebSocketHandler({
    async open(peer) {
      const realtimePeer = peer as unknown as RealtimePeer
      const runtimeConfig = useRuntimeConfig()
      const bridgeSecret = normalizeText(runtimeConfig.filaAtendimentoShellBridgeSecret)
      const apiBase = normalizeBaseUrl(runtimeConfig.filaAtendimentoApiInternalBase)

      if (!bridgeSecret || !apiBase) {
        safeSend(realtimePeer, {
          type: 'bridge.error',
          topic,
          message: 'Bridge realtime do fila-atendimento indisponivel no host.'
        })
        safeClose(realtimePeer, 1011, 'bridge-unavailable')
        return
      }

      const query = readQueryFromRequestUrl(realtimePeer.request?.url)
      const bridgeToken = normalizeText(query.ticket)
      const bridgePayload = verifyFilaAtendimentoRealtimeBridgeToken(bridgeToken, bridgeSecret)
      const scopeValue = topic === 'operations'
        ? normalizeText(bridgePayload?.storeId)
        : normalizeText(bridgePayload?.tenantId)

      if (!bridgePayload || bridgePayload.topic !== topic || !scopeValue) {
        safeSend(realtimePeer, {
          type: 'bridge.error',
          topic,
          message: 'Ticket realtime invalido ou expirado.'
        })
        safeClose(realtimePeer, 4401, 'invalid-ticket')
        return
      }

      const cookieHeader = readHeader(realtimePeer.request, 'cookie')
      const moduleToken = readCookieValue(cookieHeader, FILA_ATENDIMENTO_SESSION_COOKIE)
      if (!moduleToken) {
        safeSend(realtimePeer, {
          type: 'bridge.error',
          topic,
          message: 'Sessao do modulo ausente para abrir o realtime hospedado.'
        })
        safeClose(realtimePeer, 4409, 'module-session-missing')
        return
      }

      let upstreamSocket: WebSocket
      try {
        upstreamSocket = new WebSocket(buildUpstreamUrl(apiBase, topic, scopeValue, moduleToken))
      } catch {
        safeSend(realtimePeer, {
          type: 'bridge.error',
          topic,
          message: 'Nao foi possivel abrir a conexao realtime hospedada.'
        })
        safeClose(realtimePeer, 1011, 'upstream-creation-failed')
        return
      }

      upstreamSockets.set(realtimePeer as object, upstreamSocket)

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
          topic,
          message: 'Falha na ponte realtime com o backend hospedado.'
        })
      })

      upstreamSocket.on('close', () => {
        upstreamSockets.delete(realtimePeer as object)
        safeClose(realtimePeer, 1011, 'upstream-closed')
      })
    },
    message(peer, message) {
      const realtimePeer = peer as unknown as RealtimePeer
      const text = normalizeText(message.text()).toLowerCase()
      if (text === 'ping') {
        safeSend(realtimePeer, {
          type: 'pong',
          topic,
          ts: new Date().toISOString()
        })
      }
    },
    close(peer) {
      const realtimePeer = peer as unknown as RealtimePeer
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
}