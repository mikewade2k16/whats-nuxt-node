import { onBeforeUnmount, ref, watch } from 'vue'
import type {
  FilaAtendimentoRealtimeEvent,
  FilaAtendimentoRealtimeStatus,
  FilaAtendimentoRealtimeTicketResponse
} from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const serverMessage = normalizeText((error as { statusMessage?: unknown }).statusMessage)
    if (serverMessage) {
      return serverMessage
    }

    const rawMessage = normalizeText((error as { message?: unknown }).message)
    if (rawMessage) {
      return rawMessage
    }
  }

  return fallback
}

function parseRealtimeEvent(raw: unknown) {
  if (typeof raw === 'string') {
    const normalized = raw.trim()
    if (!normalized) {
      return null
    }

    try {
      return JSON.parse(normalized) as FilaAtendimentoRealtimeEvent
    } catch {
      return null
    }
  }

  if (raw && typeof raw === 'object') {
    return raw as FilaAtendimentoRealtimeEvent
  }

  return null
}

export function useFilaAtendimentoOperationsRealtime(store = useFilaAtendimentoOperationsStore()) {
  const { bffFetch } = useBffFetch()

  const realtimeStatus = ref<FilaAtendimentoRealtimeStatus>('idle')
  const realtimeErrorMessage = ref('')
  const lastRealtimeEventAt = ref('')

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let connectionKey = ''
  let intentionalClose = false
  let refreshPromise: Promise<unknown> | null = null
  let refreshQueued = false

  function buildRealtimeSocketUrl(path: string, ticket: string) {
    const target = new URL(path, window.location.origin)
    if (target.protocol === 'http:') {
      target.protocol = 'ws:'
    } else if (target.protocol === 'https:') {
      target.protocol = 'wss:'
    }

    target.searchParams.set('ticket', ticket)
    return target.toString()
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function disconnect(resetStatus = true, resetAttempts = true) {
    clearReconnectTimer()
    if (resetAttempts) {
      reconnectAttempts = 0
    }
    connectionKey = ''

    if (socket) {
      const currentSocket = socket
      socket = null
      intentionalClose = true
      currentSocket.close()
    }

    if (resetStatus) {
      realtimeStatus.value = 'idle'
    }
  }

  async function queueWorkspaceRefresh(storeId = store.state.activeStoreId) {
    const normalizedStoreId = normalizeText(storeId)
    if (!normalizedStoreId || !store.sessionReady) {
      return
    }

    if (store.consumeSuppressedRealtimeRefresh(normalizedStoreId)) {
      return
    }

    if (refreshPromise) {
      refreshQueued = true
      return refreshPromise
    }

    refreshPromise = store.refreshOperationSnapshot(normalizedStoreId)
      .catch(() => undefined)
      .finally(async () => {
        refreshPromise = null

        if (refreshQueued) {
          refreshQueued = false
          await queueWorkspaceRefresh(store.state.activeStoreId)
        }
      })

    return refreshPromise
  }

  function scheduleReconnect() {
    clearReconnectTimer()

    const normalizedStoreId = normalizeText(store.state.activeStoreId)
    if (!store.sessionReady || !normalizedStoreId) {
      realtimeStatus.value = 'idle'
      return
    }

    realtimeStatus.value = 'reconnecting'
    const delayMs = Math.min(10000, 1000 * Math.max(1, 2 ** reconnectAttempts))
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delayMs)
  }

  async function connect() {
    if (import.meta.server) {
      return
    }

    const normalizedStoreId = normalizeText(store.state.activeStoreId)
    if (!store.sessionReady || !normalizedStoreId) {
      disconnect()
      return
    }

    if (socket && connectionKey === normalizedStoreId && socket.readyState <= WebSocket.OPEN) {
      return
    }

    disconnect(false, false)
    intentionalClose = false
    realtimeStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    realtimeErrorMessage.value = ''

    try {
      const response = await bffFetch<FilaAtendimentoRealtimeTicketResponse>('/api/admin/modules/fila-atendimento/realtime-ticket', {
        method: 'POST',
        body: {
          topic: 'operations',
          storeId: normalizedStoreId
        }
      })

      if (!store.sessionReady || normalizeText(store.state.activeStoreId) !== normalizedStoreId) {
        return
      }

      const nextSocket = new WebSocket(buildRealtimeSocketUrl('/ws/fila-atendimento/operations', response.ticket))
      socket = nextSocket
      connectionKey = normalizedStoreId

      nextSocket.addEventListener('open', () => {
        if (socket !== nextSocket) {
          return
        }

        reconnectAttempts = 0
        realtimeStatus.value = 'connected'
      })

      nextSocket.addEventListener('message', (message) => {
        const payload = parseRealtimeEvent(message.data)
        if (!payload) {
          return
        }

        lastRealtimeEventAt.value = new Date().toISOString()

        if (payload.type === 'bridge.error') {
          realtimeErrorMessage.value = normalizeText(payload.message) || 'Falha no bridge realtime da operacao.'
          realtimeStatus.value = 'error'
          return
        }

        if (payload.type !== 'operation.updated') {
          return
        }

        const payloadStoreId = normalizeText(payload.storeId)
        if (payloadStoreId && payloadStoreId !== normalizeText(store.state.activeStoreId)) {
          return
        }

        void queueWorkspaceRefresh(payloadStoreId || normalizedStoreId)
      })

      nextSocket.addEventListener('close', () => {
        if (socket !== nextSocket) {
          return
        }

        socket = null
        connectionKey = ''

        if (intentionalClose) {
          intentionalClose = false
          realtimeStatus.value = 'idle'
          return
        }

        reconnectAttempts += 1
        scheduleReconnect()
      })

      nextSocket.addEventListener('error', () => {
        if (socket !== nextSocket) {
          return
        }

        realtimeStatus.value = 'error'
      })
    } catch (error) {
      realtimeErrorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel iniciar o bridge realtime da operacao.')
      realtimeStatus.value = 'error'
      reconnectAttempts += 1
      scheduleReconnect()
    }
  }

  watch(
    () => [store.sessionReady, store.state.activeStoreId] as const,
    () => {
      void connect()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    realtimeStatus,
    realtimeErrorMessage,
    lastRealtimeEventAt,
    reconnect: connect,
    disconnect
  }
}