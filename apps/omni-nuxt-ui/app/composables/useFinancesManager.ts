import type {
  FinanceLineItem,
  FinanceSheetItem,
  FinancesListResponse,
  FinanceMutationResponse
} from '~/types/finances'

interface FinancesFetchOptions {
  q?: string
  clientId?: number
  period?: string
}

interface FinanceCreatePayload {
  title?: string
  period?: string
  status?: string
  notes?: string
  entradas?: FinanceLineItem[]
  saidas?: FinanceLineItem[]
  clientId?: number
  clientName?: string
}

interface FinanceUpdatePayload {
  title?: string
  period?: string
  status?: string
  notes?: string
  entradas?: FinanceLineItem[]
  saidas?: FinanceLineItem[]
  clientId?: number
  clientName?: string
}

const DEFAULT_FETCH_LIMIT = 240

function normalizeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizePeriod(value: unknown) {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}$/.test(raw) ? raw : ''
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return ''
}

function normalizeAmount(value: unknown, allowNegative = false) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Number(value.toFixed(2))
    return allowNegative ? rounded : Math.max(0, rounded)
  }

  const raw = String(value ?? '').trim()
  if (!raw) return 0

  let normalized = raw
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/[^\d,.-]/g, '')

  const hasComma = normalized.includes(',')
  const hasDot = normalized.includes('.')
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  const rounded = Number(parsed.toFixed(2))
  return allowNegative ? rounded : Math.max(0, rounded)
}

function normalizeAdjustments(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.map((item, index) => {
    const source = item && typeof item === 'object'
      ? item as {
        id?: unknown
        amount?: unknown
        note?: unknown
        date?: unknown
      }
      : {}

    return {
      id: normalizeText(source.id, 80) || `adj-${Date.now()}-${index + 1}`,
      amount: normalizeAmount(source.amount, true),
      note: normalizeText(source.note, 240),
      date: normalizeDate(source.date)
    }
  })
}

function normalizeRows(value: FinanceLineItem[] | undefined, kind: 'entrada' | 'saida') {
  if (!Array.isArray(value)) return undefined

  return value.map((item, index) => {
    const adjustments = normalizeAdjustments(item?.adjustments)
    const adjustmentAmount = adjustments.length > 0
      ? Number(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0).toFixed(2))
      : normalizeAmount(item?.adjustmentAmount, true)

    return {
      adjustments,
      id: normalizeText(item?.id, 80) || `${kind}-${Date.now()}-${index + 1}`,
      description: normalizeText(item?.description, 260),
      category: normalizeText(item?.category, 120),
      effective: Boolean(item?.effective),
      effectiveDate: normalizeDate(item?.effectiveDate),
      amount: normalizeAmount(item?.amount, false),
      adjustmentAmount,
      fixedAccountId: normalizeText(item?.fixedAccountId, 80),
      details: normalizeText(item?.details, 600)
    }
  })
}

export function useFinancesManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const sheets = ref<FinanceSheetItem[]>([])
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

  function upsertSheet(payload: FinanceSheetItem) {
    const index = sheets.value.findIndex(item => item.id === payload.id)
    if (index < 0) {
      sheets.value.unshift(payload)
      return
    }
    sheets.value[index] = payload
  }

  async function fetchSheets(options: FinancesFetchOptions = {}) {
    loading.value = true
    errorMessage.value = ''
    setSaving(keyFor(0, 'fetch'), true)

    try {
      const response = await bffFetch<FinancesListResponse>('/api/admin/finances', {
        query: {
          page: 1,
          limit: DEFAULT_FETCH_LIMIT,
          q: normalizeText(options.q, 120),
          clientId: normalizeClientId(options.clientId),
          period: normalizePeriod(options.period)
        }
      })
      sheets.value = Array.isArray(response.data) ? response.data : []
    } catch {
      errorMessage.value = 'Falha ao carregar planilhas financeiras.'
    } finally {
      loading.value = false
      setSaving(keyFor(0, 'fetch'), false)
    }
  }

  async function createSheet(payload: FinanceCreatePayload = {}) {
    creating.value = true
    errorMessage.value = ''
    setSaving(keyFor(0, 'create'), true)

    try {
      const response = await bffFetch<FinanceMutationResponse>('/api/admin/finances', {
        method: 'POST',
        body: {
          title: normalizeText(payload.title, 180),
          period: normalizePeriod(payload.period),
          status: normalizeText(payload.status, 120),
          notes: normalizeText(payload.notes, 12000),
          entradas: normalizeRows(payload.entradas, 'entrada'),
          saidas: normalizeRows(payload.saidas, 'saida'),
          clientId: normalizeClientId(payload.clientId),
          clientName: normalizeText(payload.clientName, 120)
        }
      })

      upsertSheet(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao criar planilha financeira.'
      return null
    } finally {
      creating.value = false
      setSaving(keyFor(0, 'create'), false)
    }
  }

  async function updateSheet(id: number, payload: FinanceUpdatePayload) {
    if (!Number.isFinite(id) || id <= 0) return null

    errorMessage.value = ''
    setSaving(keyFor(id, 'update'), true)

    try {
      const response = await bffFetch<FinanceMutationResponse>(`/api/admin/finances/${id}`, {
        method: 'PATCH',
        body: {
          title: Object.prototype.hasOwnProperty.call(payload, 'title')
            ? normalizeText(payload.title, 180)
            : undefined,
          period: Object.prototype.hasOwnProperty.call(payload, 'period')
            ? normalizePeriod(payload.period)
            : undefined,
          status: Object.prototype.hasOwnProperty.call(payload, 'status')
            ? normalizeText(payload.status, 120)
            : undefined,
          notes: Object.prototype.hasOwnProperty.call(payload, 'notes')
            ? normalizeText(payload.notes, 12000)
            : undefined,
          entradas: Object.prototype.hasOwnProperty.call(payload, 'entradas')
            ? normalizeRows(payload.entradas, 'entrada')
            : undefined,
          saidas: Object.prototype.hasOwnProperty.call(payload, 'saidas')
            ? normalizeRows(payload.saidas, 'saida')
            : undefined,
          clientId: Object.prototype.hasOwnProperty.call(payload, 'clientId')
            ? normalizeClientId(payload.clientId)
            : undefined,
          clientName: Object.prototype.hasOwnProperty.call(payload, 'clientName')
            ? normalizeText(payload.clientName, 120)
            : undefined
        }
      })

      upsertSheet(response.data)
      return response.data
    } catch {
      errorMessage.value = 'Falha ao salvar planilha financeira.'
      return null
    } finally {
      setSaving(keyFor(id, 'update'), false)
    }
  }

  async function deleteSheet(id: number) {
    if (!Number.isFinite(id) || id <= 0) return false

    deletingId.value = id
    errorMessage.value = ''
    setSaving(keyFor(id, 'delete'), true)

    try {
      await bffFetch<{ status: 'success' }>(`/api/admin/finances/${id}`, {
        method: 'DELETE'
      })

      sheets.value = sheets.value.filter(item => item.id !== id)
      return true
    } catch {
      errorMessage.value = 'Falha ao excluir planilha financeira.'
      return false
    } finally {
      deletingId.value = null
      setSaving(keyFor(id, 'delete'), false)
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void fetchSheets()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('finances', () => {
    void fetchSheets()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    sheets,
    loading,
    creating,
    deletingId,
    errorMessage,
    savingMap,
    fetchSheets,
    createSheet,
    updateSheet,
    deleteSheet
  }
}
