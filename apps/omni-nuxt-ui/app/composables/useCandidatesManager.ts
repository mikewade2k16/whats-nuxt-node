import type {
  CandidateFieldKey,
  CandidateItem,
  CandidateMutationResponse,
  CandidatesListResponse
} from '~/types/candidates'
import { CANDIDATE_STATUS_OPTIONS } from '~/types/candidates'

interface UpdateFieldOptions {
  immediate?: boolean
}

const UPDATE_DELAY_MS = 360
const DEFAULT_FETCH_LIMIT = 120

const statusLabelMap = CANDIDATE_STATUS_OPTIONS.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const statusValueSet = new Set(CANDIDATE_STATUS_OPTIONS.map(item => item.value))

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizePoints(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

function normalizeStatus(value: unknown) {
  const normalized = String(value ?? '').trim() as CandidateItem['status']
  if (statusValueSet.has(normalized)) {
    return normalized
  }

  return 'nao_iniciado'
}

export function useCandidatesManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const candidates = ref<CandidateItem[]>([])
  const vagaOptions = ref<string[]>([])
  const lojaOptions = ref<string[]>([])
  const clientIdOptions = ref<number[]>([])

  const loading = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | null>(null)
  const errorMessage = ref('')
  const savingMap = ref<Record<string, boolean>>({})

  const pendingFieldTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function keyFor(id: number, field: CandidateFieldKey | 'create' | 'delete') {
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

  function replaceCandidateRow(payload: CandidateItem) {
    const index = candidates.value.findIndex(candidate => candidate.id === payload.id)
    if (index < 0) {
      candidates.value.unshift(payload)
      return
    }

    candidates.value[index] = payload
  }

  function patchCandidateLocally(id: number, patch: Partial<CandidateItem>) {
    const target = candidates.value.find(candidate => candidate.id === id)
    if (!target) return

    Object.assign(target, patch)
  }

  async function fetchCandidates() {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<CandidatesListResponse>('/api/admin/candidates', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT
        }
      })

      candidates.value = Array.isArray(response.data) ? response.data : []
      vagaOptions.value = Array.isArray(response.filters?.vagas) ? response.filters.vagas : []
      lojaOptions.value = Array.isArray(response.filters?.lojas) ? response.filters.lojas : []
      clientIdOptions.value = Array.isArray(response.filters?.clientIds) ? response.filters.clientIds : []
    } catch {
      errorMessage.value = 'Falha ao carregar candidatos.'
    } finally {
      loading.value = false
    }
  }

  async function persistField(id: number, field: CandidateFieldKey, value: unknown) {
    const savingKey = keyFor(id, field)
    setSaving(savingKey, true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<CandidateMutationResponse>(`/api/admin/candidates/${id}`, {
        method: 'PATCH',
        body: {
          field,
          value
        }
      })

      replaceCandidateRow(response.data)
    } catch {
      errorMessage.value = 'Falha ao salvar alteracao do candidato.'
      await fetchCandidates()
    } finally {
      setSaving(savingKey, false)
    }
  }

  function queueFieldPersist(id: number, field: CandidateFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
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

  function updateField(id: number, field: CandidateFieldKey, value: unknown, options: UpdateFieldOptions = {}) {
    if (field === 'nome') {
      patchCandidateLocally(id, { nome: normalizeText(value, 255) })
    }

    if (field === 'vaga') {
      patchCandidateLocally(id, { vaga: normalizeText(value, 120) })
    }

    if (field === 'pontos') {
      patchCandidateLocally(id, { pontos: normalizePoints(value) })
    }

    if (field === 'status') {
      const normalized = normalizeStatus(value)
      patchCandidateLocally(id, {
        status: normalized,
        statusLabel: statusLabelMap[normalized] || normalized
      })
    }

    if (field === 'loja') {
      patchCandidateLocally(id, { loja: normalizeText(value, 120) })
    }

    if (field === 'comment') {
      patchCandidateLocally(id, { comment: normalizeText(value, 4000) })
    }

    queueFieldPersist(id, field, value, options)
  }

  async function saveComment(id: number, comment: string) {
    updateField(id, 'comment', comment, { immediate: true })
  }

  async function createCandidate() {
    creating.value = true
    setSaving(keyFor(0, 'create'), true)
    errorMessage.value = ''

    try {
      const response = await bffFetch<CandidateMutationResponse>('/api/admin/candidates', {
        method: 'POST',
        body: {
          nome: 'Novo candidato'
        }
      })

      candidates.value.unshift(response.data)
      if (response.data.vaga && !vagaOptions.value.includes(response.data.vaga)) {
        vagaOptions.value = [...vagaOptions.value, response.data.vaga].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      }
      if (response.data.loja && !lojaOptions.value.includes(response.data.loja)) {
        lojaOptions.value = [...lojaOptions.value, response.data.loja].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      }
      if (response.data.clientId > 0 && !clientIdOptions.value.includes(response.data.clientId)) {
        clientIdOptions.value = [...clientIdOptions.value, response.data.clientId].sort((a, b) => a - b)
      }

      return response.data.id
    } catch {
      errorMessage.value = 'Falha ao criar candidato.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function deleteCandidate(id: number) {
    deletingId.value = id
    setSaving(keyFor(id, 'delete'), true)
    errorMessage.value = ''

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/candidates/${id}`, {
        method: 'DELETE'
      })

      candidates.value = candidates.value.filter(candidate => candidate.id !== id)
    } catch {
      errorMessage.value = 'Falha ao excluir candidato.'
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  onBeforeUnmount(() => {
    for (const timer of pendingFieldTimers.values()) {
      clearTimeout(timer)
    }

    pendingFieldTimers.clear()
  })

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchCandidates()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('candidates', () => {
    void fetchCandidates()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    candidates,
    vagaOptions,
    lojaOptions,
    clientIdOptions,
    statusOptions: CANDIDATE_STATUS_OPTIONS,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchCandidates,
    updateField,
    saveComment,
    createCandidate,
    deleteCandidate
  }
}
