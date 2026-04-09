import type {
  QrCodeItem,
  QrCodesListResponse,
  QrCodeMutationResponse
} from '~/types/qrcodes'

interface CreateQrCodePayload {
  slug: string
  targetUrl: string
  fillColor: string
  backColor: string
  size: number
  isActive: boolean
  clientId?: number
  clientName?: string
}

interface UpdateQrCodePayload {
  slug?: string
  targetUrl?: string
  fillColor?: string
  backColor?: string
  size?: number
  isActive?: boolean
  clientId?: number
  clientName?: string
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeColor(value: unknown, fallback: string) {
  const raw = String(value ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }

  return fallback
}

function normalizeSize(value: unknown, fallback = 220) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < 120) return 120
  if (parsed > 1000) return 1000
  return parsed
}

export function useQrcodesManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const qrcodes = ref<QrCodeItem[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  function keyFor(id: number, field: 'create' | 'delete' | 'update' | 'toggle') {
    return `${id}:${field}`
  }

  function setSaving(key: string, value: boolean) {
    const next = { ...savingMap.value }
    if (value) {
      next[key] = true
    } else {
      delete next[key]
    }

    savingMap.value = next
  }

  function replaceRow(payload: QrCodeItem) {
    const index = qrcodes.value.findIndex(item => item.id === payload.id)
    if (index < 0) {
      qrcodes.value.unshift(payload)
      return
    }

    qrcodes.value[index] = payload
  }

  async function fetchQrCodes() {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<QrCodesListResponse>('/api/admin/qrcodes', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT
        }
      })

      qrcodes.value = Array.isArray(response.data) ? response.data : []
    } catch {
      errorMessage.value = 'Falha ao carregar QR Codes.'
    } finally {
      loading.value = false
    }
  }

  async function createQrCode(payload: CreateQrCodePayload) {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<QrCodeMutationResponse>('/api/admin/qrcodes', {
        method: 'POST',
        body: {
          slug: normalizeText(payload.slug, 120),
          targetUrl: normalizeText(payload.targetUrl, 2000),
          fillColor: normalizeColor(payload.fillColor, '#000000'),
          backColor: normalizeColor(payload.backColor, '#ffffff'),
          size: normalizeSize(payload.size, 220),
          isActive: Boolean(payload.isActive),
          clientId: Number(payload.clientId ?? 0),
          clientName: normalizeText(payload.clientName ?? '', 120)
        }
      })

      qrcodes.value.unshift(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao criar QR Code.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function updateQrCode(id: number, payload: UpdateQrCodePayload, field: 'update' | 'toggle' = 'update') {
    setSaving(keyFor(id, field), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<QrCodeMutationResponse>(`/api/admin/qrcodes/${id}`, {
        method: 'PATCH',
        body: {
          ...(Object.prototype.hasOwnProperty.call(payload, 'slug') ? { slug: normalizeText(payload.slug, 120) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'targetUrl') ? { targetUrl: normalizeText(payload.targetUrl, 2000) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'fillColor') ? { fillColor: normalizeColor(payload.fillColor, '#000000') } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'backColor') ? { backColor: normalizeColor(payload.backColor, '#ffffff') } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'size') ? { size: normalizeSize(payload.size, 220) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'isActive') ? { isActive: Boolean(payload.isActive) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'clientId') ? { clientId: Number(payload.clientId ?? 0) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'clientName') ? { clientName: normalizeText(payload.clientName, 120) } : {})
        }
      })

      replaceRow(response.data)
      return response.data
    } catch {
      errorMessage.value = field === 'toggle'
        ? 'Falha ao atualizar status do QR Code.'
        : 'Falha ao atualizar QR Code.'
      return null
    } finally {
      setSaving(keyFor(id, field), false)
    }
  }

  async function deleteQrCode(id: number) {
    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/qrcodes/${id}`, {
        method: 'DELETE'
      })

      qrcodes.value = qrcodes.value.filter(item => item.id !== id)
    } catch {
      errorMessage.value = 'Falha ao excluir QR Code.'
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchQrCodes()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('qrcodes', () => {
    void fetchQrCodes()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    qrcodes,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchQrCodes,
    createQrCode,
    updateQrCode,
    deleteQrCode
  }
}
  const DEFAULT_FETCH_LIMIT = 120
