import type {
  ShortLinkItem,
  ShortLinksListResponse,
  ShortLinkMutationResponse
} from '~/types/short-links'

interface CreateShortLinkPayload {
  targetUrl: string
  slug?: string
  clientId?: number
  clientName?: string
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function useShortLinksManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const shortLinks = ref<ShortLinkItem[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  function keyFor(id: number, field: 'create' | 'delete') {
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

  async function fetchShortLinks() {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<ShortLinksListResponse>('/api/admin/short-links', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT
        }
      })

      shortLinks.value = Array.isArray(response.data) ? response.data : []
    } catch {
      errorMessage.value = 'Falha ao carregar links curtos.'
    } finally {
      loading.value = false
    }
  }

  async function createShortLink(payload: CreateShortLinkPayload) {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<ShortLinkMutationResponse>('/api/admin/short-links', {
        method: 'POST',
        body: {
          targetUrl: normalizeText(payload.targetUrl, 2000),
          slug: normalizeText(payload.slug, 120),
          clientId: Number(payload.clientId ?? 0),
          clientName: normalizeText(payload.clientName, 120)
        }
      })

      shortLinks.value.unshift(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao criar link curto.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function deleteShortLink(id: number) {
    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/short-links/${id}`, {
        method: 'DELETE'
      })

      shortLinks.value = shortLinks.value.filter(item => item.id !== id)
    } catch {
      errorMessage.value = 'Falha ao excluir link curto.'
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchShortLinks()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('short-links', () => {
    void fetchShortLinks()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    shortLinks,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchShortLinks,
    createShortLink,
    deleteShortLink
  }
}
  const DEFAULT_FETCH_LIMIT = 120
