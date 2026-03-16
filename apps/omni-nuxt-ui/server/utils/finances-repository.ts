import { listClients } from '~~/server/utils/clients-repository'

export interface ServerFinanceLineAdjustment {
  id: string
  amount: number
  note: string
  date: string
}

export interface ServerFinanceLineItem {
  id: string
  description: string
  category: string
  effective: boolean
  effectiveDate: string
  amount: number
  adjustmentAmount: number
  adjustments: ServerFinanceLineAdjustment[]
  fixedAccountId: string
  details: string
}

export interface ServerFinanceSheetItem {
  id: number
  title: string
  period: string
  status: string
  notes: string
  clientId: number
  clientName: string
  entradas: ServerFinanceLineItem[]
  saidas: ServerFinanceLineItem[]
  createdAt: string
  updatedAt: string
}

interface FinancesRepositoryState {
  nextId: number
  items: ServerFinanceSheetItem[]
}

interface FinancesOwnershipOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

interface ListFinancesOptions extends FinancesOwnershipOptions {
  page: number
  limit: number
  q?: string
  clientId?: number
  period?: string
}

interface FinanceCreateInput {
  title?: string
  period?: string
  status?: string
  notes?: string
  entradas?: unknown
  saidas?: unknown
  clientId?: number
  clientName?: string
}

interface FinanceUpdateInput {
  title?: string
  period?: string
  status?: string
  notes?: string
  entradas?: unknown
  saidas?: unknown
  clientId?: number
  clientName?: string
}

const globalKey = '__omni_finances_repo__'

function nowIso() {
  return new Date().toISOString()
}

function currentPeriod() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function previousPeriod() {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function normalizeText(value: unknown, max = 6000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function normalizePeriod(value: unknown) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  return currentPeriod()
}

function normalizeStatus(value: unknown) {
  const normalized = normalizeText(value, 120)
  return normalized || 'aberta'
}

function normalizeDueDay(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 2)
  if (!digits) return ''
  const parsed = Number.parseInt(digits, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return ''
  return String(Math.min(parsed, 31)).padStart(2, '0')
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`
  }

  const isoWithTime = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/)
  if (isoWithTime && isoWithTime[1]) {
    return isoWithTime[1]
  }

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

function normalizeBoolean(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'on', 'sim', 'yes'].includes(normalized)
}

function buildLineId(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index + 1}`
}

function normalizeLineAdjustments(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.map((item, index) => {
    const source = item && typeof item === 'object'
      ? item as Partial<ServerFinanceLineAdjustment>
      : {}

    return {
      id: normalizeText(source.id, 80) || buildLineId('adj', index),
      amount: normalizeAmount(source.amount, true),
      note: normalizeText(source.note, 240),
      date: normalizeDate(source.date)
    } satisfies ServerFinanceLineAdjustment
  })
}

function normalizeLineItems(value: unknown, kind: 'entrada' | 'saida') {
  const rawList = Array.isArray(value) ? value : []
  return rawList
    .map((item, index) => {
      const source = item && typeof item === 'object'
        ? item as Partial<ServerFinanceLineItem>
        : {}
      const adjustments = normalizeLineAdjustments((source as { adjustments?: unknown }).adjustments)
      const adjustmentAmount = adjustments.length > 0
        ? Number(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0).toFixed(2))
        : normalizeAmount(source.adjustmentAmount, true)

      return {
        id: normalizeText(source.id, 80) || buildLineId(kind, index),
        description: normalizeText(source.description, 260),
        category: normalizeText(source.category, 120),
        effective: normalizeBoolean(source.effective),
        effectiveDate: normalizeDate(source.effectiveDate),
        amount: normalizeAmount(source.amount, false),
        adjustmentAmount,
        adjustments,
        fixedAccountId: normalizeText((source as { fixedAccountId?: unknown }).fixedAccountId, 80),
        details: normalizeText((source as { details?: unknown }).details, 600)
      } satisfies ServerFinanceLineItem
    })
}

function emptyLine(kind: 'entrada' | 'saida') {
  return {
    id: buildLineId(kind, 0),
    description: '',
    category: '',
    effective: false,
    effectiveDate: '',
    amount: 0,
    adjustmentAmount: 0,
    adjustments: [],
    fixedAccountId: '',
    details: ''
  } satisfies ServerFinanceLineItem
}

function lineTotal(item: ServerFinanceLineItem) {
  return Number((item.amount + item.adjustmentAmount).toFixed(2))
}

function sheetSummary(item: Pick<ServerFinanceSheetItem, 'entradas' | 'saidas'>) {
  const expectedIn = Number(item.entradas.reduce((sum, row) => sum + lineTotal(row), 0).toFixed(2))
  const effectiveIn = Number(item.entradas.reduce((sum, row) => {
    if (!row.effective) return sum
    return sum + lineTotal(row)
  }, 0).toFixed(2))

  const expectedOut = Number(item.saidas.reduce((sum, row) => sum + lineTotal(row), 0).toFixed(2))
  const effectiveOut = Number(item.saidas.reduce((sum, row) => {
    if (!row.effective) return sum
    return sum + lineTotal(row)
  }, 0).toFixed(2))

  return {
    expectedIn,
    effectiveIn,
    expectedOut,
    effectiveOut,
    expectedBalance: Number((expectedIn - expectedOut).toFixed(2)),
    effectiveBalance: Number((effectiveIn - effectiveOut).toFixed(2))
  }
}

function canAccessSheet(item: ServerFinanceSheetItem, options?: FinancesOwnershipOptions) {
  const userType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  if (userType !== 'client') return true

  const viewerClientId = normalizeClientId(options?.viewerClientId)
  if (viewerClientId <= 0) return false
  return item.clientId === viewerClientId
}

function resolveClientName(clientId: number, explicitName?: unknown) {
  const normalizedExplicit = normalizeText(explicitName, 120)
  if (normalizedExplicit) return normalizedExplicit

  const listed = listClients({
    page: 1,
    limit: 100,
    q: '',
    status: '',
    viewerUserType: 'admin',
    viewerClientId: 0
  }).items

  const found = listed.find(client => Number(client.id) === clientId)
  if (found) return normalizeText(found.name, 120) || `Cliente #${clientId}`
  if (clientId > 0) return `Cliente #${clientId}`
  return 'Sem cliente'
}

function buildDefaultIncomeRows(period: string, options?: FinancesOwnershipOptions) {
  const listed = listClients({
    page: 1,
    limit: 100,
    q: '',
    status: 'active',
    viewerUserType: options?.viewerUserType ?? 'admin',
    viewerClientId: options?.viewerClientId ?? 0
  }).items

  const rows = listed
    .filter(client => normalizeAmount(client.monthlyPaymentAmount, false) > 0)
    .map((client, index) => {
      const amount = normalizeAmount(client.monthlyPaymentAmount, false)
      const dueDay = normalizeDueDay(client.paymentDueDay)
      const effectiveDate = dueDay ? `${period}-${dueDay}` : ''

      return {
        id: buildLineId('entrada', index),
        description: `Mensalidade ${normalizeText(client.name, 120) || `Cliente #${client.id}`}`,
        category: 'Mensalidade',
        effective: false,
        effectiveDate,
        amount,
        adjustmentAmount: 0,
        adjustments: [],
        fixedAccountId: '',
        details: ''
      } satisfies ServerFinanceLineItem
    })

  if (rows.length > 0) return rows
  return [emptyLine('entrada')]
}

function toPreview(item: ServerFinanceSheetItem) {
  const firstEntrada = item.entradas.find(row => normalizeText(row.description))
  const firstSaida = item.saidas.find(row => normalizeText(row.description))
  const summary = sheetSummary(item)

  const pieces = [
    firstEntrada?.description ? `Entrada: ${firstEntrada.description}` : '',
    firstSaida?.description ? `Saida: ${firstSaida.description}` : '',
    `Saldo: ${summary.effectiveBalance.toFixed(2)}`
  ].filter(Boolean)

  return pieces.join(' | ')
}

function toDto(item: ServerFinanceSheetItem) {
  return {
    id: item.id,
    title: item.title,
    period: item.period,
    status: item.status,
    notes: item.notes,
    clientId: item.clientId,
    clientName: item.clientName,
    entradas: item.entradas.map(row => ({ ...row })),
    saidas: item.saidas.map(row => ({ ...row })),
    summary: sheetSummary(item),
    preview: toPreview(item),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

function seedSheets() {
  const now = nowIso()
  const current = currentPeriod()
  const prev = previousPeriod()
  return [
    {
      id: 1,
      title: `Finance ${current}`,
      period: current,
      status: 'aberta',
      notes: '',
      clientId: 106,
      clientName: 'crow',
      entradas: buildDefaultIncomeRows(current, { viewerUserType: 'admin', viewerClientId: 0 }),
      saidas: [
        {
          id: buildLineId('saida', 0),
          description: 'Folha time interno',
          category: 'Folha',
          effective: false,
          effectiveDate: '',
          amount: 4200,
          adjustmentAmount: 0,
          adjustments: [],
          fixedAccountId: '',
          details: ''
        },
        {
          id: buildLineId('saida', 1),
          description: 'Ferramentas e software',
          category: 'Software',
          effective: false,
          effectiveDate: '',
          amount: 850,
          adjustmentAmount: 0,
          adjustments: [],
          fixedAccountId: '',
          details: ''
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: 2,
      title: `Finance ${prev}`,
      period: prev,
      status: 'fechada',
      notes: 'Mes fechado para conferencia.',
      clientId: 106,
      clientName: 'crow',
      entradas: buildDefaultIncomeRows(prev, { viewerUserType: 'admin', viewerClientId: 0 }),
      saidas: [
        {
          id: buildLineId('saida', 0),
          description: 'Marketing de performance',
          category: 'Variavel',
          effective: true,
          effectiveDate: `${prev}-15`,
          amount: 1700,
          adjustmentAmount: 0,
          adjustments: [],
          fixedAccountId: '',
          details: ''
        }
      ],
      createdAt: now,
      updatedAt: now
    }
  ] satisfies ServerFinanceSheetItem[]
}

function getState() {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: FinancesRepositoryState }
  if (!globalRef[globalKey]) {
    const seeded = seedSheets()
    globalRef[globalKey] = {
      nextId: Math.max(...seeded.map(item => item.id)) + 1,
      items: seeded
    }
  }
  return globalRef[globalKey] as FinancesRepositoryState
}

export function listFinances(options: ListFinancesOptions) {
  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 300) : 120
  const q = normalizeSearch(options.q)
  const filterClientId = normalizeClientId(options.clientId)
  const filterPeriod = normalizeText(options.period, 20)

  const filtered = state.items.filter((item) => {
    if (!canAccessSheet(item, options)) return false
    if (filterClientId > 0 && item.clientId !== filterClientId) return false
    if (filterPeriod && item.period !== filterPeriod) return false

    if (!q) return true
    const haystack = normalizeSearch([
      item.title,
      item.period,
      item.status,
      item.notes,
      item.clientName,
      toPreview(item)
    ].join(' '))

    return haystack.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return b.id - a.id
    return a.updatedAt < b.updatedAt ? 1 : -1
  })

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const items = sorted.slice(start, start + limit).map(toDto)

  return {
    items,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasMore: safePage < totalPages
    }
  }
}

export function createFinanceSheet(input: FinanceCreateInput, options?: FinancesOwnershipOptions) {
  const state = getState()
  const id = state.nextId
  const period = normalizePeriod(input.period)
  const now = nowIso()
  const clientId = normalizeClientId(input.clientId)
  const hasEntradasPayload = Object.prototype.hasOwnProperty.call(input, 'entradas')
  const hasSaidasPayload = Object.prototype.hasOwnProperty.call(input, 'saidas')

  const entradas = hasEntradasPayload
    ? normalizeLineItems(input.entradas, 'entrada')
    : buildDefaultIncomeRows(period, options)
  const saidas = hasSaidasPayload
    ? normalizeLineItems(input.saidas, 'saida')
    : []

  const next: ServerFinanceSheetItem = {
    id,
    title: normalizeText(input.title, 180) || `Finance ${period}`,
    period,
    status: normalizeStatus(input.status),
    notes: normalizeText(input.notes, 12000),
    clientId,
    clientName: resolveClientName(clientId, input.clientName),
    entradas,
    saidas,
    createdAt: now,
    updatedAt: now
  }

  state.nextId += 1
  state.items.unshift(next)
  return toDto(next)
}

export function updateFinanceSheetById(id: number, input: FinanceUpdateInput, options?: FinancesOwnershipOptions) {
  const state = getState()
  const target = state.items.find(item => item.id === id)
  if (!target) return null
  if (!canAccessSheet(target, options)) return null

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    target.title = normalizeText(input.title, 180) || target.title
  }

  if (Object.prototype.hasOwnProperty.call(input, 'period')) {
    target.period = normalizePeriod(input.period)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    target.status = normalizeStatus(input.status)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    target.notes = normalizeText(input.notes, 12000)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'entradas')) {
    target.entradas = normalizeLineItems(input.entradas, 'entrada')
  }

  if (Object.prototype.hasOwnProperty.call(input, 'saidas')) {
    target.saidas = normalizeLineItems(input.saidas, 'saida')
  }

  if (Object.prototype.hasOwnProperty.call(input, 'clientId')) {
    const nextClientId = normalizeClientId(input.clientId)
    if (nextClientId > 0) {
      target.clientId = nextClientId
      target.clientName = resolveClientName(nextClientId, input.clientName)
    }
  }

  target.updatedAt = nowIso()
  return toDto(target)
}

export function deleteFinanceSheetById(id: number, options?: FinancesOwnershipOptions) {
  const state = getState()
  const index = state.items.findIndex(item => item.id === id)
  if (index < 0) return false

  const target = state.items[index]
  if (!target) return false
  if (!canAccessSheet(target, options)) return false

  state.items.splice(index, 1)
  return true
}
