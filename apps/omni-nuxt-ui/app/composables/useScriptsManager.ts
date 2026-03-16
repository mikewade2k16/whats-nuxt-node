import type {
  ScriptDocumentItem,
  ScriptsListResponse,
  ScriptMutationResponse,
  ScriptRowItem
} from '~/types/scripts'

interface ScriptsFetchOptions {
  q?: string
  clientId?: number
}

interface ScriptCreatePayload {
  title?: string
  status?: string
  notes?: string
  rows?: ScriptRowItem[]
  clientId?: number
  clientName?: string
}

interface ScriptUpdatePayload {
  title?: string
  status?: string
  notes?: string
  rows?: ScriptRowItem[]
  clientId?: number
  clientName?: string
}

const DEFAULT_FETCH_LIMIT = 240

function normalizeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeRows(value: ScriptRowItem[] | undefined) {
  const rows = Array.isArray(value)
    ? value.map((item, index) => ({
      id: normalizeText(item?.id, 80) || `row-${Date.now()}-${index + 1}`,
      audio: normalizeText(item?.audio, 12000),
      video: normalizeText(item?.video, 12000)
    }))
    : []

  if (rows.length > 0) return rows
  return [{
    id: `row-${Date.now()}-1`,
    audio: '',
    video: ''
  }]
}

export function useScriptsManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const scripts = ref<ScriptDocumentItem[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  function keyFor(id: number, field: 'fetch' | 'create' | 'update' | 'delete') {
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

  function upsertScript(payload: ScriptDocumentItem) {
    const index = scripts.value.findIndex(item => item.id === payload.id)
    if (index < 0) {
      scripts.value.unshift(payload)
      return
    }

    scripts.value[index] = payload
  }

  async function fetchScripts(options: ScriptsFetchOptions = {}) {
    loading.value = true
    setSaving(keyFor(0, 'fetch'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<ScriptsListResponse>('/api/admin/scripts', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT,
          q: normalizeText(options.q, 120),
          clientId: Number(options.clientId ?? 0)
        }
      })

      scripts.value = Array.isArray(response.data) ? response.data : []
    } catch {
      errorMessage.value = 'Falha ao carregar scripts.'
    } finally {
      loading.value = false
      setSaving(keyFor(0, 'fetch'), false)
    }
  }

  async function createScript(payload: ScriptCreatePayload = {}) {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<ScriptMutationResponse>('/api/admin/scripts', {
        method: 'POST',
        body: {
          title: normalizeText(payload.title, 180),
          status: normalizeText(payload.status, 80),
          notes: normalizeText(payload.notes, 12000),
          rows: normalizeRows(payload.rows),
          clientId: Number(payload.clientId ?? 0),
          clientName: normalizeText(payload.clientName, 120)
        }
      })

      upsertScript(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao criar script.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function updateScript(id: number, payload: ScriptUpdatePayload) {
    if (!Number.isFinite(id) || id <= 0) return null

    setSaving(keyFor(id, 'update'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<ScriptMutationResponse>(`/api/admin/scripts/${id}`, {
        method: 'PATCH',
        body: {
          title: Object.prototype.hasOwnProperty.call(payload, 'title')
            ? normalizeText(payload.title, 180)
            : undefined,
          status: Object.prototype.hasOwnProperty.call(payload, 'status')
            ? normalizeText(payload.status, 80)
            : undefined,
          notes: Object.prototype.hasOwnProperty.call(payload, 'notes')
            ? normalizeText(payload.notes, 12000)
            : undefined,
          rows: Object.prototype.hasOwnProperty.call(payload, 'rows')
            ? normalizeRows(payload.rows)
            : undefined,
          clientId: Object.prototype.hasOwnProperty.call(payload, 'clientId')
            ? Number(payload.clientId ?? 0)
            : undefined,
          clientName: Object.prototype.hasOwnProperty.call(payload, 'clientName')
            ? normalizeText(payload.clientName, 120)
            : undefined
        }
      })

      upsertScript(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao salvar script.'
      return null
    } finally {
      setSaving(keyFor(id, 'update'), false)
    }
  }

  async function deleteScript(id: number) {
    if (!Number.isFinite(id) || id <= 0) return false

    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/scripts/${id}`, {
        method: 'DELETE'
      })
      scripts.value = scripts.value.filter(item => item.id !== id)
      return true
    } catch {
      errorMessage.value = 'Falha ao excluir script.'
      return false
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchScripts()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('scripts', () => {
    void fetchScripts()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    scripts,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchScripts,
    createScript,
    updateScript,
    deleteScript
  }
}
