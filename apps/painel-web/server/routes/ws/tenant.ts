interface TenantWsWelcomeMessage {
  type: 'connected'
  channel: 'tenant'
  userType: 'admin' | 'client'
  clientId: number
  ts: string
}

function normalizeUserType(value: unknown): 'admin' | 'client' {
  return String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'client'
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function readQueryFromRequestUrl(requestUrl: string | undefined) {
  if (!requestUrl) return {} as Record<string, string>

  try {
    const parsed = new URL(requestUrl, 'http://localhost')
    return Object.fromEntries(parsed.searchParams.entries())
  } catch {
    return {} as Record<string, string>
  }
}

function buildWelcomeMessage(query: Record<string, unknown>): TenantWsWelcomeMessage {
  return {
    type: 'connected',
    channel: 'tenant',
    userType: normalizeUserType(query.userType),
    clientId: normalizeClientId(query.clientId),
    ts: new Date().toISOString()
  }
}

export default defineWebSocketHandler({
  open(peer) {
    const query = readQueryFromRequestUrl(peer.request?.url)
    const payload = buildWelcomeMessage(query)
    peer.send(JSON.stringify(payload))
  },
  message(peer, message) {
    const text = String(message.text() ?? '').trim().toLowerCase()
    if (text === 'ping') {
      peer.send(JSON.stringify({
        type: 'pong',
        channel: 'tenant',
        ts: new Date().toISOString()
      }))
    }
  },
  close() {
    // endpoint preparado para futuros eventos de create/update/delete por tenant
  }
})
