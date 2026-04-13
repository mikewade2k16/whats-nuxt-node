export type TenantRealtimeAction = 'created' | 'updated' | 'deleted'

export interface TenantRealtimeEvent {
  entity: string
  action: TenantRealtimeAction
  clientId: number
  payload?: unknown
  timestamp: string
}

export interface TenantRealtimePublishInput {
  entity: string
  action: TenantRealtimeAction
  clientId?: number
  payload?: unknown
  timestamp?: string
}

type TenantRealtimeHandler = (event: TenantRealtimeEvent) => void

const REALTIME_RECONNECT_BASE_DELAY_MS = 1500
const REALTIME_RECONNECT_MAX_DELAY_MS = 15000
const REALTIME_RECONNECT_MAX_ATTEMPTS = 6
let tenantRealtimeStarted = false
let tenantRealtimeWatchersBound = false
let tenantRealtimeSocket: WebSocket | null = null
let tenantRealtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null
let tenantRealtimeReconnectAttempts = 0
const tenantRealtimeHandlers = new Map<string, Set<TenantRealtimeHandler>>()

function normalizeEntity(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeAction(value: unknown): TenantRealtimeAction | null {
  const action = String(value ?? '').trim().toLowerCase()
  if (action === 'created' || action === 'updated' || action === 'deleted') {
    return action
  }

  return null
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function normalizeEvent(raw: unknown): TenantRealtimeEvent | null {
  if (!raw || typeof raw !== 'object') return null

  const source = raw as Record<string, unknown>
  const entity = normalizeEntity(source.entity)
  const action = normalizeAction(source.action)
  if (!entity || !action) return null

  return {
    entity,
    action,
    clientId: normalizeClientId(source.clientId),
    payload: source.payload,
    timestamp: String(source.timestamp ?? new Date().toISOString())
  }
}

function parseMessagePayload(raw: unknown) {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  if (raw && typeof raw === 'object') {
    return raw
  }

  return null
}

export function useTenantRealtime() {
  const sessionSimulation = useSessionSimulationStore()
  const runtimeConfig = useRuntimeConfig()

  const connected = useState<boolean>('tenant-realtime:connected', () => false)
  const lastMessageAt = useState<string>('tenant-realtime:last-message-at', () => '')

  const websocketUrl = computed(() => String(runtimeConfig.public.websocketUrl ?? '').trim())
  const websocketEnabled = computed(() => {
    const raw = runtimeConfig.public.websocketEnabled
    if (typeof raw === 'boolean') return raw
    return String(raw ?? '').trim().toLowerCase() === 'true'
  })
  const activeClientId = computed(() => Number(sessionSimulation.effectiveClientId || 0))
  const activeClientCoreTenantId = computed(() => String(sessionSimulation.activeClientCoreTenantId || '').trim())
  const enabled = computed(() => websocketEnabled.value && websocketUrl.value !== '' && activeClientCoreTenantId.value !== '')

  function resolveReconnectDelayMs() {
    if (tenantRealtimeReconnectAttempts <= 1) {
      return REALTIME_RECONNECT_BASE_DELAY_MS
    }

    const factor = 2 ** (tenantRealtimeReconnectAttempts - 1)
    return Math.min(REALTIME_RECONNECT_BASE_DELAY_MS * factor, REALTIME_RECONNECT_MAX_DELAY_MS)
  }

  function resetReconnectAttempts() {
    tenantRealtimeReconnectAttempts = 0
  }

  function clearReconnectTimer() {
    if (!tenantRealtimeReconnectTimer) return
    clearTimeout(tenantRealtimeReconnectTimer)
    tenantRealtimeReconnectTimer = null
  }

  function clearSocket() {
    const current = tenantRealtimeSocket
    if (!current) return

    current.onopen = null
    current.onmessage = null
    current.onerror = null
    current.onclose = null
    if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
      current.close()
    }
    tenantRealtimeSocket = null
  }

  function notifyHandlers(event: TenantRealtimeEvent) {
    const specific = tenantRealtimeHandlers.get(event.entity)
    if (specific && specific.size > 0) {
      for (const handler of specific.values()) {
        handler(event)
      }
    }

    const wildcard = tenantRealtimeHandlers.get('*')
    if (wildcard && wildcard.size > 0) {
      for (const handler of wildcard.values()) {
        handler(event)
      }
    }
  }

  function shouldDeliverEvent(event: TenantRealtimeEvent) {
    if (event.clientId <= 0) return true
    return event.clientId === activeClientId.value
  }

  function handleIncoming(raw: unknown) {
    const parsedPayload = parseMessagePayload(raw)
    const event = normalizeEvent(parsedPayload)
    if (!event) return
    if (!shouldDeliverEvent(event)) return

    lastMessageAt.value = new Date().toISOString()
    notifyHandlers(event)
  }

  function scheduleReconnect() {
    if (!import.meta.client) return
    if (!enabled.value) return
    if (tenantRealtimeReconnectAttempts >= REALTIME_RECONNECT_MAX_ATTEMPTS) return

    clearReconnectTimer()
    tenantRealtimeReconnectTimer = setTimeout(() => {
      connect()
    }, resolveReconnectDelayMs())
  }

  function connect() {
    if (!import.meta.client) return
    if (!enabled.value) return

    const current = tenantRealtimeSocket
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return
    }

    clearReconnectTimer()
    clearSocket()

    let connectionUrl: URL
    try {
      connectionUrl = new URL(websocketUrl.value, window.location.origin)
      if (connectionUrl.protocol === 'http:') {
        connectionUrl.protocol = 'ws:'
      } else if (connectionUrl.protocol === 'https:') {
        connectionUrl.protocol = 'wss:'
      }
    } catch {
      return
    }

    connectionUrl.searchParams.set('clientId', String(activeClientId.value))
    connectionUrl.searchParams.set('tenantId', activeClientCoreTenantId.value)

    const socket = new WebSocket(connectionUrl.toString())
    tenantRealtimeSocket = socket

    socket.onopen = () => {
      resetReconnectAttempts()
      connected.value = true
    }

    socket.onmessage = (message) => {
      handleIncoming(message.data)
    }

    socket.onerror = () => {
      connected.value = false
    }

    socket.onclose = () => {
      connected.value = false
      if (tenantRealtimeSocket === socket) {
        tenantRealtimeSocket = null
      }
      tenantRealtimeReconnectAttempts += 1
      scheduleReconnect()
    }
  }

  function disconnect() {
    clearReconnectTimer()
    resetReconnectAttempts()
    connected.value = false
    clearSocket()
  }

  function publish(input: TenantRealtimePublishInput) {
    if (!import.meta.client) return false
    if (!enabled.value) return false

    const socket = tenantRealtimeSocket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    const entity = normalizeEntity(input.entity)
    const action = normalizeAction(input.action)
    if (!entity || !action) {
      return false
    }

    try {
      socket.send(JSON.stringify({
        type: 'tenant.event.publish',
        event: {
          entity,
          action,
          clientId: normalizeClientId(input.clientId ?? activeClientId.value),
          payload: input.payload,
          timestamp: String(input.timestamp ?? new Date().toISOString())
        }
      }))

      return true
    } catch {
      return false
    }
  }

  function start() {
    if (!import.meta.client) return
    if (tenantRealtimeStarted) return

    tenantRealtimeStarted = true
    if (enabled.value) {
      connect()
    }
  }

  function subscribeEntity(entity: string, handler: TenantRealtimeHandler) {
    if (!import.meta.client) {
      return () => {}
    }

    const normalizedEntity = normalizeEntity(entity) || '*'
    const bucket = tenantRealtimeHandlers.get(normalizedEntity) ?? new Set<TenantRealtimeHandler>()
    bucket.add(handler)
    tenantRealtimeHandlers.set(normalizedEntity, bucket)

    return () => {
      const current = tenantRealtimeHandlers.get(normalizedEntity)
      if (!current) return

      current.delete(handler)
      if (current.size === 0) {
        tenantRealtimeHandlers.delete(normalizedEntity)
      }
    }
  }

  if (import.meta.client && !tenantRealtimeWatchersBound) {
    tenantRealtimeWatchersBound = true

    watch(
      () => [activeClientId.value, activeClientCoreTenantId.value, enabled.value],
      () => {
        if (!tenantRealtimeStarted) return
        if (!enabled.value) {
          disconnect()
          return
        }
        disconnect()
        connect()
      }
    )

    watch(
      () => websocketUrl.value,
      (nextUrl) => {
        if (!tenantRealtimeStarted) return
        if (!nextUrl) {
          disconnect()
          return
        }

        disconnect()
        connect()
      }
    )
  }

  return {
    enabled,
    connected: readonly(connected),
    lastMessageAt: readonly(lastMessageAt),
    start,
    connect,
    disconnect,
    publish,
    subscribeEntity
  }
}
