import type {
  QaCapabilityBlock,
  QaFeatureItem,
  QaFieldKey,
  QaItemEffort,
  QaItemPriority,
  QaItemSource,
  QaItemStatus,
  QaListResponse,
  QaMutationResponse
} from '~/types/qa'

interface UpdateFieldOptions {
  immediate?: boolean
}

interface CreateQaItemPayload {
  block?: string
  sprint?: string
  squad?: string
  feature?: string
  status?: QaItemStatus
  priority?: QaItemPriority
  source?: QaItemSource
  owner?: string
  targetPage?: string
  effort?: QaItemEffort
  notes?: string
}

const UPDATE_DELAY_MS = 320
const DEFAULT_FETCH_LIMIT = 300

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeStatus(value: unknown): QaItemStatus {
  const normalized = String(value ?? '').trim() as QaItemStatus
  if (normalized === 'todo' || normalized === 'in_progress' || normalized === 'blocked' || normalized === 'review' || normalized === 'done') {
    return normalized
  }
  return 'todo'
}

function normalizePriority(value: unknown): QaItemPriority {
  const normalized = String(value ?? '').trim() as QaItemPriority
  if (normalized === 'alta' || normalized === 'media' || normalized === 'baixa') {
    return normalized
  }
  return 'media'
}

function normalizeSource(value: unknown): QaItemSource {
  const normalized = String(value ?? '').trim() as QaItemSource
  if (normalized === 'novo' || normalized === 'legado_refatorar' || normalized === 'ja_existe') {
    return normalized
  }
  return 'novo'
}

function normalizeEffort(value: unknown): QaItemEffort {
  const normalized = String(value ?? '').trim().toUpperCase() as QaItemEffort
  if (normalized === 'S' || normalized === 'M' || normalized === 'L' || normalized === 'XL') {
    return normalized
  }
  return 'M'
}

function normalizeOptions(values: string[]) {
  return Array.from(new Set((values || []).map(value => normalizeText(value, 120)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function useQaManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const items = ref<QaFeatureItem[]>([])
  const capabilities = ref<QaCapabilityBlock[]>([])
  const blockOptions = ref<string[]>([])
  const sprintOptions = ref<string[]>([])
  const squadOptions = ref<string[]>([])

  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  const pendingFieldTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function keyFor(id: number, field: QaFieldKey | 'create' | 'delete') {
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

  function syncOptionsFromRows() {
    blockOptions.value = normalizeOptions(items.value.map(item => item.block))
    sprintOptions.value = normalizeOptions(items.value.map(item => item.sprint))
    squadOptions.value = normalizeOptions(items.value.map(item => item.squad))
  }

  function replaceItemRow(payload: QaFeatureItem) {
    const index = items.value.findIndex(item => item.id === payload.id)
    if (index < 0) {
      items.value.unshift(payload)
      syncOptionsFromRows()
      return
    }

    items.value[index] = payload
    syncOptionsFromRows()
  }

  function patchItemLocally(id: number, patch: Partial<QaFeatureItem>) {
    const target = items.value.find(item => item.id === id)
    if (!target) return
    Object.assign(target, patch)
    syncOptionsFromRows()
  }

  async function fetchQaItems() {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<QaListResponse>('/api/admin/qa', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT
        }
      })

      items.value = Array.isArray(response.data) ? response.data : []
      capabilities.value = Array.isArray(response.capabilities) ? response.capabilities : []
      blockOptions.value = Array.isArray(response.filters?.blocks) ? normalizeOptions(response.filters.blocks) : []
      sprintOptions.value = Array.isArray(response.filters?.sprints) ? normalizeOptions(response.filters.sprints) : []
      squadOptions.value = Array.isArray(response.filters?.squads) ? normalizeOptions(response.filters.squads) : []

      if (!blockOptions.value.length || !sprintOptions.value.length || !squadOptions.value.length) {
        syncOptionsFromRows()
      }
    } catch {
      errorMessage.value = 'Falha ao carregar itens de QA.'
    } finally {
      loading.value = false
    }
  }

  async function persistField(id: number, field: QaFieldKey, value: unknown) {
    const savingKey = keyFor(id, field)
    setSaving(savingKey, true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<QaMutationResponse>(`/api/admin/qa/${id}`, {
        method: 'PATCH',
        body: {
          field,
          value
        }
      })

      replaceItemRow(response.data)
    } catch {
      errorMessage.value = 'Falha ao salvar item de QA.'
      await fetchQaItems()
    } finally {
      setSaving(savingKey, false)
    }
  }

  function queueFieldPersist(id: number, field: QaFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
    const timerKey = keyFor(id, field)
    const existingTimer = pendingFieldTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
      pendingFieldTimers.delete(timerKey)
    }

    const run = () => {
      pendingFieldTimers.delete(timerKey)
      void persistField(id, field, value)
    }

    if (options.immediate) {
      run()
      return
    }

    const timer = setTimeout(run, UPDATE_DELAY_MS)
    pendingFieldTimers.set(timerKey, timer)
  }

  function updateField(id: number, field: QaFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
    if (field === 'block') {
      patchItemLocally(id, { block: normalizeText(value, 160) })
    }

    if (field === 'sprint') {
      patchItemLocally(id, { sprint: normalizeText(value, 80) })
    }

    if (field === 'squad') {
      patchItemLocally(id, { squad: normalizeText(value, 80) })
    }

    if (field === 'feature') {
      patchItemLocally(id, { feature: normalizeText(value, 280) })
    }

    if (field === 'status') {
      patchItemLocally(id, { status: normalizeStatus(value) })
    }

    if (field === 'priority') {
      patchItemLocally(id, { priority: normalizePriority(value) })
    }

    if (field === 'source') {
      patchItemLocally(id, { source: normalizeSource(value) })
    }

    if (field === 'owner') {
      patchItemLocally(id, { owner: normalizeText(value, 120) })
    }

    if (field === 'targetPage') {
      patchItemLocally(id, { targetPage: normalizeText(value, 240) })
    }

    if (field === 'effort') {
      patchItemLocally(id, { effort: normalizeEffort(value) })
    }

    if (field === 'notes') {
      patchItemLocally(id, { notes: normalizeText(value, 4000) })
    }

    queueFieldPersist(id, field, value, options)
  }

  function saveNotes(id: number, notes: string) {
    updateField(id, 'notes', notes, { immediate: true })
  }

  async function createQaItem(payload?: Partial<CreateQaItemPayload>) {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<QaMutationResponse>('/api/admin/qa', {
        method: 'POST',
        body: {
          block: normalizeText(payload?.block ?? '', 160),
          sprint: normalizeText(payload?.sprint ?? '', 80),
          squad: normalizeText(payload?.squad ?? '', 80),
          feature: normalizeText(payload?.feature ?? 'Nova funcionalidade', 280),
          status: normalizeStatus(payload?.status),
          priority: normalizePriority(payload?.priority),
          source: normalizeSource(payload?.source),
          owner: normalizeText(payload?.owner ?? '', 120),
          targetPage: normalizeText(payload?.targetPage ?? '/admin', 240),
          effort: normalizeEffort(payload?.effort),
          notes: normalizeText(payload?.notes ?? '', 4000)
        }
      })

      items.value.unshift(response.data)
      syncOptionsFromRows()
      return response.data.id
    } catch {
      errorMessage.value = 'Falha ao criar item de QA.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function deleteQaItem(id: number) {
    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/qa/${id}`, {
        method: 'DELETE'
      })

      items.value = items.value.filter(item => item.id !== id)
      syncOptionsFromRows()
    } catch {
      errorMessage.value = 'Falha ao excluir item de QA.'
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchQaItems()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('qa', () => {
    void fetchQaItems()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  onBeforeUnmount(() => {
    for (const timer of pendingFieldTimers.values()) {
      clearTimeout(timer)
    }
    pendingFieldTimers.clear()
  })

  return {
    items,
    capabilities,
    blockOptions,
    sprintOptions,
    squadOptions,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchQaItems,
    updateField,
    saveNotes,
    createQaItem,
    deleteQaItem
  }
}
