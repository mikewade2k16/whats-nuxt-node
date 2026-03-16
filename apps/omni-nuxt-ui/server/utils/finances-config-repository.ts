import type {
  FinanceCategoryConfig,
  FinanceConfigData,
  FinanceConfigKind,
  FinanceRecurringEntryConfig,
  FinanceFixedAccountConfig,
  FinanceFixedAccountMember
} from '~~/app/types/finances'

interface ServerFinancesConfigState {
  byClientId: Record<number, FinanceConfigData>
}

const globalKey = '__omni_finances_config_repo__'

function nowIso() {
  return new Date().toISOString()
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function normalizeText(value: unknown, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeKind(value: unknown): FinanceConfigKind {
  const normalized = normalizeText(value, 20).toLowerCase()
  if (normalized === 'entrada') return 'entrada'
  if (normalized === 'saida') return 'saida'
  return 'ambas'
}

function normalizeAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2))
  }

  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return Number(parsed.toFixed(2))
}

function makeId(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index + 1}`
}

function normalizeMembers(value: unknown) {
  if (!Array.isArray(value)) return []
  const output: FinanceFixedAccountMember[] = []

  value.forEach((item, index) => {
    const source = item && typeof item === 'object' ? item as Partial<FinanceFixedAccountMember> : {}
    const id = normalizeText(source.id, 80) || makeId('member', index)
    const name = normalizeText(source.name, 120)
    if (!name) return
    output.push({
      id,
      name,
      amount: normalizeAmount(source.amount)
    })
  })

  return output
}

function normalizeCategories(value: unknown) {
  if (!Array.isArray(value)) return []
  const output: FinanceCategoryConfig[] = []
  const seen = new Set<string>()

  value.forEach((item, index) => {
    const source = item && typeof item === 'object' ? item as Partial<FinanceCategoryConfig> : {}
    const id = normalizeText(source.id, 80) || makeId('cat', index)
    const name = normalizeText(source.name, 120)
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    output.push({
      id,
      name,
      kind: normalizeKind(source.kind),
      description: normalizeText(source.description, 400)
    })
  })

  return output
}

function normalizeFixedAccounts(value: unknown, validCategoryIds: Set<string>) {
  if (!Array.isArray(value)) return []
  const output: FinanceFixedAccountConfig[] = []

  value.forEach((item, index) => {
    const source = item && typeof item === 'object' ? item as Partial<FinanceFixedAccountConfig> : {}
    const id = normalizeText(source.id, 80) || makeId('fixed', index)
    const name = normalizeText(source.name, 120)
    if (!name) return

    const members = normalizeMembers(source.members)
    const defaultAmountFromMembers = Number(members.reduce((sum, member) => sum + member.amount, 0).toFixed(2))
    const baseAmount = normalizeAmount(source.defaultAmount)
    const amount = baseAmount > 0 ? baseAmount : defaultAmountFromMembers
    const categoryId = normalizeText(source.categoryId, 80)

    output.push({
      id,
      name,
      kind: normalizeKind(source.kind),
      categoryId: validCategoryIds.has(categoryId) ? categoryId : '',
      defaultAmount: amount,
      notes: normalizeText(source.notes, 500),
      members
    })
  })

  return output
}

function normalizeRecurringEntries(value: unknown) {
  if (!Array.isArray(value)) return []
  const output: FinanceRecurringEntryConfig[] = []
  const seen = new Set<number>()

  value.forEach((item) => {
    const source = item && typeof item === 'object'
      ? item as Partial<FinanceRecurringEntryConfig>
      : {}
    const sourceClientId = normalizeClientId(source.sourceClientId)
    if (sourceClientId <= 0) return
    if (seen.has(sourceClientId)) return
    seen.add(sourceClientId)

    output.push({
      sourceClientId,
      adjustmentAmount: normalizeAmount(source.adjustmentAmount),
      notes: normalizeText(source.notes, 240)
    })
  })

  return output
}

function seedConfig(clientId: number): FinanceConfigData {
  const categories: FinanceCategoryConfig[] = [
    { id: 'cat-rec-mensalidade', name: 'Receita mensalidade', kind: 'entrada', description: 'Receitas recorrentes dos clientes.' },
    { id: 'cat-aluguel', name: 'Aluguel', kind: 'saida', description: 'Custos fixos de aluguel.' },
    { id: 'cat-folha', name: 'Folha salarial', kind: 'saida', description: 'Salarios e encargos da equipe.' },
    { id: 'cat-software', name: 'Software', kind: 'saida', description: 'Ferramentas recorrentes e assinaturas.' }
  ]

  const fixedAccounts: FinanceFixedAccountConfig[] = [
    {
      id: 'fixed-aluguel-sede',
      name: 'Aluguel sede',
      kind: 'saida',
      categoryId: 'cat-aluguel',
      defaultAmount: 3500,
      notes: 'Contrato fixo mensal.',
      members: []
    },
    {
      id: 'fixed-folha-time-core',
      name: 'Folha time core',
      kind: 'saida',
      categoryId: 'cat-folha',
      defaultAmount: 12000,
      notes: 'Folha mensal base.',
      members: [
        { id: 'member-1', name: 'Designer', amount: 4000 },
        { id: 'member-2', name: 'Gestor de trafego', amount: 4500 },
        { id: 'member-3', name: 'Editor de video', amount: 3500 }
      ]
    },
    {
      id: 'fixed-assinaturas-core',
      name: 'Assinaturas core',
      kind: 'saida',
      categoryId: 'cat-software',
      defaultAmount: 980,
      notes: 'Pacote de softwares fixos.',
      members: []
    }
  ]

  return {
    clientId,
    categories,
    fixedAccounts,
    recurringEntries: [],
    updatedAt: nowIso()
  }
}

function cloneConfig(config: FinanceConfigData): FinanceConfigData {
  return {
    clientId: config.clientId,
    categories: config.categories.map(item => ({ ...item })),
    fixedAccounts: config.fixedAccounts.map(item => ({
      ...item,
      members: item.members.map(member => ({ ...member }))
    })),
    recurringEntries: config.recurringEntries.map(item => ({ ...item })),
    updatedAt: config.updatedAt
  }
}

function getState() {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: ServerFinancesConfigState }
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = { byClientId: {} }
  }
  return globalRef[globalKey] as ServerFinancesConfigState
}

function ensureConfig(clientId: number) {
  const state = getState()
  const normalizedClientId = normalizeClientId(clientId)
  if (normalizedClientId <= 0) {
    return seedConfig(106)
  }

  if (!state.byClientId[normalizedClientId]) {
    state.byClientId[normalizedClientId] = seedConfig(normalizedClientId)
  }

  return state.byClientId[normalizedClientId]!
}

export function getFinancesConfigByClientId(clientId: number) {
  return cloneConfig(ensureConfig(clientId))
}

export function updateFinancesConfigByClientId(
  clientId: number,
  input: {
    categories?: unknown
    fixedAccounts?: unknown
    recurringEntries?: unknown
  }
) {
  const target = ensureConfig(clientId)
  const next = cloneConfig(target)

  if (Object.prototype.hasOwnProperty.call(input, 'categories')) {
    const normalizedCategories = normalizeCategories(input.categories)
    next.categories = normalizedCategories.length > 0 ? normalizedCategories : next.categories
  }

  const categoryIds = new Set(next.categories.map(item => item.id))
  if (Object.prototype.hasOwnProperty.call(input, 'fixedAccounts')) {
    next.fixedAccounts = normalizeFixedAccounts(input.fixedAccounts, categoryIds)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'recurringEntries')) {
    next.recurringEntries = normalizeRecurringEntries(input.recurringEntries)
  }

  next.updatedAt = nowIso()

  const state = getState()
  state.byClientId[next.clientId] = next
  return cloneConfig(next)
}
