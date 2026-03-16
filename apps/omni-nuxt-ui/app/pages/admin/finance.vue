<script setup lang="ts">
import OmniSelectMenuInput from '~/components/inputs/OmniSelectMenuInput.vue'
import OmniMoneyInput from '~/components/omni/inputs/OmniMoneyInput.vue'
import FinanceLineCard from '~/components/admin/finance/FinanceLineCard.vue'
import type {
  FinanceCategoryConfig,
  FinanceConfigKind,
  FinanceRecurringEntryConfig,
  FinanceFixedAccountConfig,
  FinanceLineAdjustment,
  FinanceLineItem,
  FinanceSheetItem
} from '~/types/finances'

definePageMeta({
  layout: 'admin'
})

const DEFAULT_ADMIN_CLIENT_ID = 106
const STATUS_OPTIONS = [
  { label: 'Aberta', value: 'aberta' },
  { label: 'Conferencia', value: 'conferencia' },
  { label: 'Fechada', value: 'fechada' }
]
const LINE_CARD_INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '[role="button"]',
  '[role="switch"]'
].join(', ')
const KIND_OPTIONS = [
  { label: 'Entrada', value: 'entrada' },
  { label: 'Saida', value: 'saida' },
  { label: 'Ambas', value: 'ambas' }
]

const sessionSimulation = useSessionSimulationStore()
const { bffFetch } = useBffFetch()
const { createSheet, deleteSheet, fetchSheets, creating, deletingId, errorMessage, savingMap, sheets, updateSheet } = useFinancesManager()
const {
  config,
  loading: configLoading,
  saving: configSaving,
  errorMessage: configErrorMessage,
  fetchConfig,
  saveConfig
} = useFinancesConfigManager()

const selectedSheetId = ref<number | null>(null)
const configOpen = ref(false)
const lineDetailsOpen = reactive<Record<string, boolean>>({})
const lineAdjustmentHistoryOpen = reactive<Record<string, boolean>>({})
const effectiveDateModalOpen = reactive<Record<string, boolean>>({})
const adjustmentModalOpen = reactive<Record<string, boolean>>({})
const adjustmentDraftByKey = reactive<Record<string, {
  amountInput: string
  note: string
  date: string
}>>({})
const saveConfigTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const editingCategoryId = ref<string | null>(null)
const editingFixedId = ref<string | null>(null)
const categoryEditDraft = reactive<{
  id: string
  name: string
  kind: FinanceConfigKind
}>({
  id: '',
  name: '',
  kind: 'ambas'
})
const fixedEditDraft = reactive<{
  id: string
  name: string
  kind: FinanceConfigKind
  categoryId: string
}>({
  id: '',
  name: '',
  kind: 'saida',
  categoryId: ''
})
const clientRecurringEntries = ref<Array<{
  id: number
  name: string
  amount: number
  dueDay: string
}>>([])

const draft = reactive<{
  title: string
  period: string
  status: string
  notes: string
  clientId: number
  entradas: FinanceLineItem[]
  saidas: FinanceLineItem[]
}>({
  title: '',
  period: '',
  status: 'aberta',
  notes: '',
  clientId: DEFAULT_ADMIN_CLIENT_ID,
  entradas: [],
  saidas: []
})

const configDraft = reactive<{
  categories: FinanceCategoryConfig[]
  fixedAccounts: FinanceFixedAccountConfig[]
  recurringEntries: FinanceRecurringEntryConfig[]
}>({
  categories: [],
  fixedAccounts: [],
  recurringEntries: []
})

const newCategory = reactive<{
  name: string
  kind: FinanceConfigKind
  description: string
}>({
  name: '',
  kind: 'ambas',
  description: ''
})

const newFixed = reactive<{
  name: string
  kind: FinanceConfigKind
  categoryId: string
  defaultAmount: number
  notes: string
}>({
  name: '',
  kind: 'saida',
  categoryId: '',
  defaultAmount: 0,
  notes: ''
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMoney(value: unknown) {
  const parsed = Number(value || 0)
  return moneyFormatter.format(Number.isFinite(parsed) ? parsed : 0)
}

function normalizeText(value: unknown, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function makeId(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index + 1}`
}

function makeLine(kind: 'entrada' | 'saida', index = 0): FinanceLineItem {
  return {
    id: `${kind}-${Date.now()}-${index + 1}`,
    description: '',
    category: '',
    effective: false,
    effectiveDate: '',
    amount: 0,
    adjustmentAmount: 0,
    adjustments: [],
    fixedAccountId: '',
    details: ''
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeAdjustmentDate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return ''
}

function normalizeAdjustmentEntry(value: unknown, index = 0): FinanceLineAdjustment {
  const source = value && typeof value === 'object'
    ? value as Partial<FinanceLineAdjustment>
    : {}

  return {
    id: normalizeText(source.id, 80) || makeId('adj', index),
    amount: Number(Number(source.amount || 0).toFixed(2)),
    note: normalizeText(source.note, 240),
    date: normalizeAdjustmentDate(source.date)
  }
}

function ensureLineAdjustments(row: FinanceLineItem) {
  if (!Array.isArray(row.adjustments)) {
    row.adjustments = []
  }

  if (row.adjustments.length === 0 && Number(row.adjustmentAmount || 0) !== 0) {
    row.adjustments.push({
      id: makeId('adj', 0),
      amount: Number(Number(row.adjustmentAmount || 0).toFixed(2)),
      note: 'Ajuste legado',
      date: todayIsoDate()
    })
  }
}

function recalcLineAdjustmentTotal(row: FinanceLineItem) {
  ensureLineAdjustments(row)
  row.adjustmentAmount = Number(
    row.adjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0).toFixed(2)
  )
}

function ensureRows() {
  if (draft.entradas.length === 0) draft.entradas = [makeLine('entrada')]
  if (draft.saidas.length === 0) draft.saidas = [makeLine('saida')]
  draft.entradas.forEach((row) => {
    ensureLineAdjustments(row)
    recalcLineAdjustmentTotal(row)
  })
  draft.saidas.forEach((row) => {
    ensureLineAdjustments(row)
    recalcLineAdjustmentTotal(row)
  })
}

function resolveCategoryNameById(categoryId: string) {
  if (!categoryId) return ''
  return configDraft.categories.find(category => category.id === categoryId)?.name || ''
}

function fixedAccountsByKind(kind: 'entrada' | 'saida') {
  return configDraft.fixedAccounts.filter(account => account.kind === 'ambas' || account.kind === kind)
}

function recurringRowId(clientId: number) {
  return `recurring-client-${clientId}`
}

function isRecurringFixedRowId(value: string) {
  return value.startsWith('recurring-client-')
}

function recurringEntryForClient(clientId: number) {
  return configDraft.recurringEntries.find(item => Number(item.sourceClientId) === Number(clientId))
}

function syncFixedRowsWithDraft(kind: 'entrada' | 'saida', shouldPersist = false) {
  const list = kind === 'entrada' ? draft.entradas : draft.saidas
  const fixedAccounts = fixedAccountsByKind(kind)
  const fixedById = new Map(fixedAccounts.map(account => [account.id, account] as const))

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const row = list[index]
    if (!row?.fixedAccountId) continue
    if (isRecurringFixedRowId(row.fixedAccountId)) continue
    if (!fixedById.has(row.fixedAccountId)) {
      list.splice(index, 1)
    }
  }

  fixedAccounts.forEach((account) => {
    let row = list.find(item => item.fixedAccountId === account.id)
    const categoryName = resolveCategoryNameById(account.categoryId)

    if (!row) {
      row = makeLine(kind, list.length)
      row.fixedAccountId = account.id
      row.description = account.name
      row.amount = Number(account.defaultAmount || 0)
      row.category = categoryName
      row.details = account.notes || ''
      list.unshift(row)
      return
    }

    row.description = account.name
    row.amount = Number(account.defaultAmount || 0)
    if (categoryName) row.category = categoryName
    if (!normalizeText(row.details, 600)) {
      row.details = account.notes || ''
    }
  })

  const fixedRows = fixedAccounts
    .map(account => list.find(item => item.fixedAccountId === account.id))
    .filter((item): item is FinanceLineItem => Boolean(item))
  const customRows = list.filter(row => !fixedById.has(row.fixedAccountId))
  list.splice(0, list.length, ...fixedRows, ...customRows)

  ensureRows()
  if (shouldPersist) queuePersist()
}

function syncRecurringRowsWithDraft(shouldPersist = false) {
  const list = draft.entradas
  const recurringMap = new Map(clientRecurringEntries.value.map(entry => [entry.id, entry] as const))

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const row = list[index]
    if (!row?.fixedAccountId || !isRecurringFixedRowId(row.fixedAccountId)) continue
    const clientId = Number.parseInt(row.fixedAccountId.replace('recurring-client-', ''), 10)
    if (!Number.isFinite(clientId) || !recurringMap.has(clientId)) {
      list.splice(index, 1)
    }
  }

  const defaultCategory = configDraft.categories.find(category => category.kind === 'entrada' || category.kind === 'ambas')?.name || 'Receita mensalidade'

  clientRecurringEntries.value.forEach((entry, index) => {
    const recurringConfig = recurringEntryForClient(entry.id)
    const adjustment = Number(recurringConfig?.adjustmentAmount || 0)
    const recurringId = recurringRowId(entry.id)
    const detailsText = [
      recurringConfig?.notes ? `Ajuste: ${recurringConfig.notes}` : '',
      entry.dueDay ? `Vencimento: ${entry.dueDay}` : ''
    ].filter(Boolean).join(' | ')

    let row = list.find(item => item.fixedAccountId === recurringId)
    if (!row) {
      row = makeLine('entrada', index)
      row.fixedAccountId = recurringId
      row.effective = false
      list.unshift(row)
    }

    row.description = `Mensalidade ${entry.name}`
    row.category = defaultCategory
    row.amount = Number((entry.amount + adjustment).toFixed(2))
    row.details = detailsText
  })

  const recurringRows = clientRecurringEntries.value
    .map(entry => list.find(item => item.fixedAccountId === recurringRowId(entry.id)))
    .filter((item): item is FinanceLineItem => Boolean(item))
  const otherRows = list.filter(row => !isRecurringFixedRowId(row.fixedAccountId))
  list.splice(0, list.length, ...recurringRows, ...otherRows)

  ensureRows()
  if (shouldPersist) queuePersist()
}

function syncAllFixedRows(shouldPersist = false) {
  syncFixedRowsWithDraft('entrada', shouldPersist)
  syncFixedRowsWithDraft('saida', shouldPersist)
  syncRecurringRowsWithDraft(shouldPersist)
}

function hydrate(sheet: FinanceSheetItem | null) {
  if (!sheet) {
    draft.title = ''
    draft.period = currentPeriod()
    draft.status = 'aberta'
    draft.notes = ''
    draft.clientId = Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
    draft.entradas = [makeLine('entrada')]
    draft.saidas = [makeLine('saida')]
    return
  }
  draft.title = sheet.title || ''
  draft.period = sheet.period || currentPeriod()
  draft.status = sheet.status || 'aberta'
  draft.notes = sheet.notes || ''
  draft.clientId = sheet.clientId || Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  draft.entradas = (sheet.entradas || []).map(row => ({
    ...row,
    adjustments: Array.isArray(row.adjustments)
      ? row.adjustments.map((adjustment, index) => normalizeAdjustmentEntry(adjustment, index))
      : [],
    fixedAccountId: row.fixedAccountId || '',
    details: row.details || ''
  }))
  draft.saidas = (sheet.saidas || []).map(row => ({
    ...row,
    adjustments: Array.isArray(row.adjustments)
      ? row.adjustments.map((adjustment, index) => normalizeAdjustmentEntry(adjustment, index))
      : [],
    fixedAccountId: row.fixedAccountId || '',
    details: row.details || ''
  }))
  ensureRows()
  syncAllFixedRows(false)
}

function syncConfigDraft() {
  const source = config.value
  if (!source) return
  configDraft.categories = (source.categories || []).map(item => ({ ...item }))
  configDraft.fixedAccounts = (source.fixedAccounts || []).map(item => ({
    ...item,
    members: (item.members || []).map(member => ({ ...member }))
  }))
  configDraft.recurringEntries = (source.recurringEntries || []).map(item => ({ ...item }))
}

function lineKey(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return `${kind}:${row.id || index}`
}

function toggleLineDetails(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  const key = lineKey(kind, row, index)
  lineDetailsOpen[key] = !lineDetailsOpen[key]
}

function isInteractiveLineTarget(eventTarget: EventTarget | null) {
  if (!(eventTarget instanceof Element)) return false
  return Boolean(eventTarget.closest(LINE_CARD_INTERACTIVE_SELECTOR))
}

function onLineCardClick(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, event: MouseEvent) {
  if (isInteractiveLineTarget(event.target)) return
  toggleLineDetails(kind, row, index)
}

function isLineDetailsOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return Boolean(lineDetailsOpen[lineKey(kind, row, index)])
}

function lineScopedKey(prefix: string, kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return `${prefix}:${lineKey(kind, row, index)}`
}

function lineTotal(row: FinanceLineItem) {
  return Number((Number(row.amount || 0) + Number(row.adjustmentAmount || 0)).toFixed(2))
}

function onLineTotalInput(row: FinanceLineItem, value: unknown) {
  const parsed = Number(value || 0)
  const safeTotal = Number.isFinite(parsed) ? parsed : 0
  const nextBase = safeTotal - Number(row.adjustmentAmount || 0)
  row.amount = Number(Math.max(0, nextBase).toFixed(2))
  queuePersist()
}

function formatSignedMoney(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return formatMoney(0)
  if (parsed === 0) return formatMoney(0)
  return `${parsed > 0 ? '+' : '-'} ${formatMoney(Math.abs(parsed))}`
}

function isAdjustmentHistoryOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return Boolean(lineAdjustmentHistoryOpen[lineScopedKey('line-history', kind, row, index)])
}

function toggleAdjustmentHistory(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  const key = lineScopedKey('line-history', kind, row, index)
  lineAdjustmentHistoryOpen[key] = !lineAdjustmentHistoryOpen[key]
}

function parseDraftAdjustmentAmount(rawValue: string, _kind: 'entrada' | 'saida') {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return 0

  const clean = raw
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')

  const explicitMinus = clean.startsWith('-')

  let normalized = clean.replace(/[^\d,.-]/g, '')
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
  if (!Number.isFinite(parsed) || parsed === 0) return 0

  const absolute = Math.abs(parsed)
  const sign = explicitMinus ? -1 : 1

  return Number((absolute * sign).toFixed(2))
}

function formatAdjustmentInputHint(_kind: 'entrada' | 'saida') {
  return '100 = +100 | -100 para subtrair'
}

function isEffectiveDateModalOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return Boolean(effectiveDateModalOpen[lineScopedKey('effective-date', kind, row, index)])
}

function setEffectiveDateModalOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, open: boolean) {
  effectiveDateModalOpen[lineScopedKey('effective-date', kind, row, index)] = Boolean(open)
}

function setEffectiveToday(row: FinanceLineItem) {
  row.effectiveDate = todayIsoDate()
  queuePersist()
}

function clearEffectiveDate(row: FinanceLineItem) {
  row.effectiveDate = ''
  queuePersist()
}

function closeEffectiveDateModal(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  setEffectiveDateModalOpen(kind, row, index, false)
}

function onEffectiveDateSubmitShortcut(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, event: KeyboardEvent) {
  event.preventDefault()

  const normalized = normalizeAdjustmentDate(row.effectiveDate)
  if (normalized) {
    row.effectiveDate = normalized
  } else {
    row.effectiveDate = todayIsoDate()
  }

  queuePersist()
  closeEffectiveDateModal(kind, row, index)
}

function onEffectiveDateCancelShortcut(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  closeEffectiveDateModal(kind, row, index)
}

function onEffectiveToggle(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, next: boolean) {
  row.effective = Boolean(next)
  if (!row.effective) {
    row.effectiveDate = ''
    closeEffectiveDateModal(kind, row, index)
    queuePersist()
    return
  }

  if (!normalizeAdjustmentDate(row.effectiveDate)) {
    row.effectiveDate = ''
  }
  setEffectiveDateModalOpen(kind, row, index, true)
  queuePersist()
}

function isAdjustmentModalOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  return Boolean(adjustmentModalOpen[lineScopedKey('line-adjustment', kind, row, index)])
}

function setAdjustmentModalOpen(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, open: boolean) {
  adjustmentModalOpen[lineScopedKey('line-adjustment', kind, row, index)] = Boolean(open)

  if (!open) return
  const draftEntry = ensureAdjustmentDraft(kind, row, index)
  draftEntry.amountInput = ''
  draftEntry.date = normalizeAdjustmentDate(draftEntry.date) || todayIsoDate()
}

function ensureAdjustmentDraft(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  const key = lineScopedKey('line-adjustment', kind, row, index)
  if (!adjustmentDraftByKey[key]) {
    adjustmentDraftByKey[key] = {
      amountInput: '',
      note: '',
      date: todayIsoDate()
    }
  }
  return adjustmentDraftByKey[key]!
}

function closeAdjustmentModal(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  setAdjustmentModalOpen(kind, row, index, false)
}

function addLineAdjustment(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  const draftEntry = ensureAdjustmentDraft(kind, row, index)
  const amount = parseDraftAdjustmentAmount(draftEntry.amountInput, kind)
  if (!Number.isFinite(amount) || amount === 0) return false

  ensureLineAdjustments(row)
  row.adjustments.push({
    id: makeId('adj', row.adjustments.length),
    amount,
    note: normalizeText(draftEntry.note, 240),
    date: normalizeAdjustmentDate(draftEntry.date) || todayIsoDate()
  })
  recalcLineAdjustmentTotal(row)

  draftEntry.amountInput = ''
  draftEntry.note = ''
  draftEntry.date = todayIsoDate()
  closeAdjustmentModal(kind, row, index)
  queuePersist()
  return true
}

function onAdjustmentSubmitShortcut(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number, event: KeyboardEvent) {
  event.preventDefault()
  addLineAdjustment(kind, row, index)
}

function onAdjustmentCancelShortcut(kind: 'entrada' | 'saida', row: FinanceLineItem, index: number) {
  closeAdjustmentModal(kind, row, index)
}

function removeLineAdjustment(row: FinanceLineItem, adjustmentId: string) {
  ensureLineAdjustments(row)
  row.adjustments = row.adjustments.filter(adjustment => adjustment.id !== adjustmentId)
  recalcLineAdjustmentTotal(row)
  queuePersist()
}

function onAdjustmentHistoryChanged(row: FinanceLineItem) {
  ensureLineAdjustments(row)
  row.adjustments = row.adjustments.map((adjustment, index) => normalizeAdjustmentEntry(adjustment, index))
  recalcLineAdjustmentTotal(row)
  queuePersist()
}

function setAdjustmentSign(row: FinanceLineItem, adjustment: FinanceLineAdjustment, sign: '+' | '-') {
  const absolute = Math.abs(Number(adjustment.amount || 0))
  adjustment.amount = Number((sign === '-' ? -absolute : absolute).toFixed(2))
  onAdjustmentHistoryChanged(row)
}

function setAdjustmentAbsoluteAmount(row: FinanceLineItem, adjustment: FinanceLineAdjustment, value: number) {
  const absolute = Math.abs(Number(value || 0))
  const sign = Number(adjustment.amount || 0) < 0 ? -1 : 1
  adjustment.amount = Number((absolute * sign).toFixed(2))
  onAdjustmentHistoryChanged(row)
}

function categoryOptions(kind: 'entrada' | 'saida') {
  return configDraft.categories
    .filter(category => category.kind === 'ambas' || category.kind === kind)
    .map(category => ({
      label: category.name,
      value: category.name
    }))
}

function resolveFixedById(id: string) {
  return configDraft.fixedAccounts.find(account => account.id === id) || null
}

const filteredSheets = computed(() => sheets.value)

const categoryConfigOptions = computed(() => configDraft.categories.map(category => ({
  label: category.name,
  value: category.id
})))

const entriesExpected = computed(() => draft.entradas.reduce((sum, row) => sum + Number(row.amount || 0) + Number(row.adjustmentAmount || 0), 0))
const entriesEffective = computed(() => draft.entradas.reduce((sum, row) => row.effective ? sum + Number(row.amount || 0) + Number(row.adjustmentAmount || 0) : sum, 0))
const exitsExpected = computed(() => draft.saidas.reduce((sum, row) => sum + Number(row.amount || 0) + Number(row.adjustmentAmount || 0), 0))
const exitsEffective = computed(() => draft.saidas.reduce((sum, row) => row.effective ? sum + Number(row.amount || 0) + Number(row.adjustmentAmount || 0) : sum, 0))
const balanceExpected = computed(() => entriesExpected.value - exitsExpected.value)
const balanceEffective = computed(() => entriesEffective.value - exitsEffective.value)
const activeSheetSaving = computed(() => {
  const id = Number(selectedSheetId.value || 0)
  if (!id) return false
  return Boolean(savingMap.value[`${id}:update`])
})

async function persist() {
  const id = Number(selectedSheetId.value || 0)
  if (!id) return
  await updateSheet(id, { ...draft, clientId: Number(sessionSimulation.clientId || draft.clientId || DEFAULT_ADMIN_CLIENT_ID) })
}

function queuePersist() {
  if (!selectedSheetId.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void persist() }, 380)
}

async function persistConfig() {
  const targetClientId = Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  await saveConfig({
    clientId: targetClientId,
    categories: configDraft.categories,
    fixedAccounts: configDraft.fixedAccounts,
    recurringEntries: configDraft.recurringEntries
  })
}

function queueConfigPersist() {
  if (saveConfigTimer.value) clearTimeout(saveConfigTimer.value)
  saveConfigTimer.value = setTimeout(() => {
    void persistConfig()
  }, 380)
}

function addCategory() {
  const name = normalizeText(newCategory.name, 120)
  if (!name) return

  const alreadyExists = configDraft.categories.some(category => category.name.toLowerCase() === name.toLowerCase())
  if (alreadyExists) return

  configDraft.categories.push({
    id: makeId('cat', configDraft.categories.length),
    name,
    kind: newCategory.kind,
    description: normalizeText(newCategory.description, 400)
  })

  newCategory.name = ''
  newCategory.kind = 'ambas'
  newCategory.description = ''
  queueConfigPersist()
}

function startEditCategory(id: string) {
  const target = configDraft.categories.find(category => category.id === id)
  if (!target) return
  categoryEditDraft.id = target.id
  categoryEditDraft.name = target.name
  categoryEditDraft.kind = target.kind
  editingCategoryId.value = id
}

function finishEditCategory() {
  const id = editingCategoryId.value
  if (!id) return
  const target = configDraft.categories.find(category => category.id === id)
  if (!target) return

  const nextName = normalizeText(categoryEditDraft.name, 120)
  if (!nextName) return

  target.name = nextName
  target.kind = categoryEditDraft.kind
  editingCategoryId.value = null
  categoryEditDraft.id = ''
  categoryEditDraft.name = ''
  categoryEditDraft.kind = 'ambas'
  queueConfigPersist()
  syncAllFixedRows(true)
}

function cancelEditCategory() {
  editingCategoryId.value = null
  categoryEditDraft.id = ''
  categoryEditDraft.name = ''
  categoryEditDraft.kind = 'ambas'
}

function removeCategory(categoryId: string) {
  configDraft.categories = configDraft.categories.filter(category => category.id !== categoryId)
  configDraft.fixedAccounts = configDraft.fixedAccounts.map(account => ({
    ...account,
    categoryId: account.categoryId === categoryId ? '' : account.categoryId
  }))
  queueConfigPersist()
  syncAllFixedRows(true)
}

function addFixedAccount() {
  const name = normalizeText(newFixed.name, 120)
  if (!name) return

  configDraft.fixedAccounts.push({
    id: makeId('fixed', configDraft.fixedAccounts.length),
    name,
    kind: newFixed.kind,
    categoryId: normalizeText(newFixed.categoryId, 90),
    defaultAmount: Number(newFixed.defaultAmount || 0),
    notes: normalizeText(newFixed.notes, 500),
    members: []
  })

  newFixed.name = ''
  newFixed.kind = 'saida'
  newFixed.categoryId = ''
  newFixed.defaultAmount = 0
  newFixed.notes = ''
  queueConfigPersist()
  syncAllFixedRows(true)
}

function startEditFixed(id: string) {
  const target = configDraft.fixedAccounts.find(account => account.id === id)
  if (!target) return
  fixedEditDraft.id = target.id
  fixedEditDraft.name = target.name
  fixedEditDraft.kind = target.kind
  fixedEditDraft.categoryId = target.categoryId
  editingFixedId.value = id
}

function finishEditFixed() {
  const id = editingFixedId.value
  if (!id) return
  const target = configDraft.fixedAccounts.find(account => account.id === id)
  if (!target) return

  const nextName = normalizeText(fixedEditDraft.name, 120)
  if (!nextName) return

  target.name = nextName
  target.kind = fixedEditDraft.kind
  target.categoryId = normalizeText(fixedEditDraft.categoryId, 90)
  editingFixedId.value = null
  fixedEditDraft.id = ''
  fixedEditDraft.name = ''
  fixedEditDraft.kind = 'saida'
  fixedEditDraft.categoryId = ''
  queueConfigPersist()
  syncAllFixedRows(true)
}

function cancelEditFixed() {
  editingFixedId.value = null
  fixedEditDraft.id = ''
  fixedEditDraft.name = ''
  fixedEditDraft.kind = 'saida'
  fixedEditDraft.categoryId = ''
}

function removeFixedAccount(id: string) {
  configDraft.fixedAccounts = configDraft.fixedAccounts.filter(account => account.id !== id)
  draft.entradas.forEach((row) => {
    if (row.fixedAccountId === id) row.fixedAccountId = ''
  })
  draft.saidas.forEach((row) => {
    if (row.fixedAccountId === id) row.fixedAccountId = ''
  })
  queueConfigPersist()
  syncAllFixedRows(true)
  queuePersist()
}

function addFixedMember(account: FinanceFixedAccountConfig) {
  account.members.push({
    id: makeId('member', account.members.length),
    name: `Item ${account.members.length + 1}`,
    amount: 0
  })
  queueConfigPersist()
}

function removeFixedMember(account: FinanceFixedAccountConfig, memberId: string) {
  account.members = account.members.filter(member => member.id !== memberId)
  updateFixedAmountFromMembers(account, { preserveWhenEmpty: true, persist: true })
}

function updateFixedAmountFromMembers(
  account: FinanceFixedAccountConfig,
  options: { preserveWhenEmpty?: boolean, persist?: boolean } = {}
) {
  const preserveWhenEmpty = options.preserveWhenEmpty !== false
  const hasAnyMember = account.members.length > 0
  if (!hasAnyMember && preserveWhenEmpty) return

  const sum = account.members.reduce((total, member) => total + Number(member.amount || 0), 0)
  if (hasAnyMember || !preserveWhenEmpty) {
    account.defaultAmount = Number(sum.toFixed(2))
  }

  if (options.persist !== false) {
    queueConfigPersist()
  }
  syncAllFixedRows(true)
}

function setRecurringAdjustment(clientId: number, rawValue: number) {
  const nextValue = Number(rawValue || 0)
  const index = configDraft.recurringEntries.findIndex(item => Number(item.sourceClientId) === Number(clientId))
  if (index < 0) {
    configDraft.recurringEntries.push({
      sourceClientId: clientId,
      adjustmentAmount: nextValue,
      notes: ''
    })
  } else {
    configDraft.recurringEntries[index]!.adjustmentAmount = nextValue
  }
  queueConfigPersist()
  syncAllFixedRows(true)
}

function setRecurringNotes(clientId: number, notes: string) {
  const normalized = normalizeText(notes, 240)
  const index = configDraft.recurringEntries.findIndex(item => Number(item.sourceClientId) === Number(clientId))
  if (index < 0) {
    configDraft.recurringEntries.push({
      sourceClientId: clientId,
      adjustmentAmount: 0,
      notes: normalized
    })
  } else {
    configDraft.recurringEntries[index]!.notes = normalized
  }
  queueConfigPersist()
  syncAllFixedRows(true)
}

async function fetchClientRecurringEntries() {
  try {
    const response = await bffFetch<{
      status: 'success'
      data: Array<{
        id: number
        name: string
        monthlyPaymentAmount: number
        paymentDueDay: string
      }>
    }>('/api/admin/finances/recurring-clients', {
      query: {
        limit: 300
      }
    })

    clientRecurringEntries.value = (response.data || [])
      .filter(client => Number(client.monthlyPaymentAmount || 0) > 0)
      .map(client => ({
        id: Number(client.id),
        name: String(client.name || `Cliente #${client.id}`),
        amount: Number(client.monthlyPaymentAmount || 0),
        dueDay: String(client.paymentDueDay || '')
      }))
  } catch {
    clientRecurringEntries.value = []
  }
}

async function openConfigPanel() {
  const targetClientId = Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  await Promise.all([
    fetchConfig(targetClientId),
    fetchClientRecurringEntries()
  ])
  syncConfigDraft()
  configOpen.value = true
}

async function onCreateSheet() {
  const created = await createSheet({
    title: `Finance ${currentPeriod()}`,
    period: currentPeriod(),
    status: 'aberta',
    clientId: Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  })
  if (!created) return
  selectedSheetId.value = created.id
  hydrate(created)
}

async function onDeleteSheet(id: number) {
  if (!import.meta.client || !window.confirm('Excluir esta planilha?')) return
  const deleted = await deleteSheet(id)
  if (!deleted) return
  if (selectedSheetId.value === id) {
    selectedSheetId.value = filteredSheets.value[0]?.id ?? null
  }
}

function removeRow(kind: 'entrada' | 'saida', index: number) {
  const list = kind === 'entrada' ? draft.entradas : draft.saidas
  if (index < 0 || index >= list.length) return
  list.splice(index, 1)
  if (list.length === 0) list.push(makeLine(kind))
  queuePersist()
}

watch(filteredSheets, () => {
  if (filteredSheets.value.length === 0) {
    selectedSheetId.value = null
    hydrate(null)
    return
  }
  if (!filteredSheets.value.some(sheet => sheet.id === selectedSheetId.value)) {
    selectedSheetId.value = filteredSheets.value[0]?.id ?? null
  }
}, { immediate: true, deep: true })

watch(selectedSheetId, (id) => {
  const found = sheets.value.find(sheet => sheet.id === id) ?? null
  hydrate(found)
}, { immediate: true })

watch(
  () => config.value,
  () => {
    syncConfigDraft()
    syncAllFixedRows(false)
  },
  { deep: true }
)

watch(
  () => configDraft.fixedAccounts,
  () => {
    syncAllFixedRows(true)
  },
  { deep: true }
)

watch(
  () => configDraft.categories,
  () => {
    syncAllFixedRows(true)
  },
  { deep: true }
)

watch(
  () => configDraft.recurringEntries,
  () => {
    syncAllFixedRows(true)
  },
  { deep: true }
)

watch(
  () => clientRecurringEntries.value,
  () => {
    syncAllFixedRows(true)
  },
  { deep: true }
)

watch(() => sessionSimulation.requestContextHash, () => {
  const targetClientId = Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  void fetchSheets()
  void fetchConfig(targetClientId)
  void fetchClientRecurringEntries()
})

onMounted(async () => {
  sessionSimulation.initialize()
  const targetClientId = Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
  await Promise.all([
    fetchSheets(),
    fetchConfig(targetClientId),
    fetchClientRecurringEntries()
  ])
  syncConfigDraft()
})
</script>

<template>
  <section class="finances-page space-y-4">
    <AdminPageHeader eyebrow="Finance" title="Finance v2" description="Planilhas mensais com entradas e saidas." />

    <UAlert v-if="errorMessage" class="finances-page__alert finances-page__alert--error" color="error" variant="soft" icon="i-lucide-alert-triangle" title="Erro" :description="errorMessage" />

    <UDashboardGroup class="finances-page__group !static !inset-auto !h-auto !w-full">
      <UDashboardSidebar class="finances-page__sidebar" resizable collapsible :min-size="12" :default-size="12" :max-size="20" :collapsed-size="12">
        <template #header="{ collapsed }">
          <div class="finances-page__sidebar-header flex items-center justify-between gap-2">
            <h2 class="finances-page__sidebar-title font-semibold text-[rgb(var(--text))]" :class="collapsed ? 'text-[11px]' : 'text-sm'">Planilhas</h2>
            <div class="finances-page__sidebar-actions flex items-center gap-1">
              <UButton class="finances-page__sidebar-action finances-page__sidebar-action--create" icon="i-lucide-plus" size="sm" color="neutral" variant="soft" :square="collapsed" :loading="creating" @click="onCreateSheet" />
              <UDashboardSidebarCollapse class="finances-page__sidebar-action finances-page__sidebar-action--collapse" color="neutral" variant="ghost" size="sm" />
            </div>
          </div>
        </template>

        <div class="finances-page__sidebar-list space-y-2">
          <button v-for="sheet in filteredSheets" :key="sheet.id" type="button" class="finances-page__sheet-card w-full rounded-[var(--radius-sm)] border p-3 text-left"
            :class="sheet.id === selectedSheetId ? 'border-primary bg-[rgb(var(--surface))]' : 'border-[rgb(var(--border))] bg-transparent'"
            @click="selectedSheetId = sheet.id">
            <div class="finances-page__sheet-card-header mb-1 flex items-start justify-between gap-2">
              <p class="finances-page__sheet-card-title line-clamp-1 text-sm font-semibold text-[rgb(var(--text))]">{{ sheet.title || 'Sem titulo' }}</p>
              <UButton class="finances-page__sheet-card-delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" :loading="deletingId === sheet.id" @click.stop="onDeleteSheet(sheet.id)" />
            </div>
            <p class="finances-page__sheet-card-meta text-xs text-[rgb(var(--muted))]">{{ sheet.period }} | {{ sheet.clientName }}</p>
            <p class="finances-page__sheet-card-balance text-xs text-[rgb(var(--muted))]">Saldo: {{ formatMoney(sheet.summary.effectiveBalance) }}</p>
          </button>
        </div>
      </UDashboardSidebar>

      <UDashboardPanel class="finances-page__panel">
        <section class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
          <div v-if="!selectedSheetId" class="py-14 text-center text-sm text-[rgb(var(--muted))]">
            Selecione uma planilha ou crie uma nova.
          </div>

          <template v-else>
            <div class="finances-page__editor-header mb-4 flex flex-wrap items-start justify-between gap-3">
              <input v-model="draft.title" class="finances-page__title finances-page__title-input w-full max-w-[620px]" placeholder="Titulo da planilha" @input="queuePersist">
              <div class="finances-page__editor-actions flex items-center gap-2">
                <UInput v-model="draft.period" class="finances-page__period-input" type="month" @update:model-value="queuePersist" />
                <OmniSelectMenuInput
                  v-model="draft.status"
                  class="finances-page__status-select"
                  :items="STATUS_OPTIONS"
                  item-display-mode="text"
                  :searchable="false"
                  :creatable="false"
                  :clear="false"
                  :badge-mode="true"
                  option-edit-mode="none"
                  color="neutral"
                  variant="none"
                  :highlight="false"
                  @update:model-value="queuePersist"
                />
                <UButton class="finances-page__editor-action finances-page__editor-action--config" icon="i-lucide-settings-2" color="neutral" variant="soft" :loading="configLoading" @click="openConfigPanel">
                  Configuracao
                </UButton>
                <UButton class="finances-page__editor-action finances-page__editor-action--delete" icon="i-lucide-trash-2" color="error" variant="soft" :loading="deletingId === selectedSheetId" @click="onDeleteSheet(Number(selectedSheetId))" />
              </div>
            </div>

            <div class="finances-page__tables grid gap-3 lg:grid-cols-2">
              <UCard class="finances-page__table-card finances-page__table-card--entrada">
                <template #header><div class="finances-page__table-header flex items-center justify-between"><h3 class="finances-page__table-title text-sm font-semibold">Entradas</h3><UButton class="finances-page__table-add-line finances-page__table-add-line--entrada" icon="i-lucide-plus" size="xs" label="Linha" @click="draft.entradas.push(makeLine('entrada', draft.entradas.length)); queuePersist()" /></div></template>
                <div class="space-y-2">
                  <FinanceLineCard
                    v-for="(row, index) in draft.entradas"
                    :key="row.id"
                    kind="entrada"
                    :row="row"
                    :index="index"
                    :category-options="categoryOptions('entrada')"
                    :details-open="isLineDetailsOpen('entrada', row, index)"
                    :effective-date-modal-open="isEffectiveDateModalOpen('entrada', row, index)"
                    :adjustment-modal-open="isAdjustmentModalOpen('entrada', row, index)"
                    :adjustment-history-open="isAdjustmentHistoryOpen('entrada', row, index)"
                    :adjustment-draft="ensureAdjustmentDraft('entrada', row, index)"
                    :adjustment-input-hint="formatAdjustmentInputHint('entrada')"
                    :line-total="lineTotal(row)"
                    :fixed-account="resolveFixedById(row.fixedAccountId)"
                    :format-money="formatMoney"
                    :format-signed-money="formatSignedMoney"
                    @line-card-click="onLineCardClick('entrada', row, index, $event)"
                    @persist="queuePersist"
                    @effective-toggle="onEffectiveToggle('entrada', row, index, $event)"
                    @effective-date-open="setEffectiveDateModalOpen('entrada', row, index, $event)"
                    @effective-date-submit-shortcut="onEffectiveDateSubmitShortcut('entrada', row, index, $event)"
                    @effective-date-cancel-shortcut="onEffectiveDateCancelShortcut('entrada', row, index)"
                    @effective-today="setEffectiveToday(row)"
                    @effective-clear="clearEffectiveDate(row)"
                    @effective-close="closeEffectiveDateModal('entrada', row, index)"
                    @line-total-input="onLineTotalInput(row, $event)"
                    @adjustment-open="setAdjustmentModalOpen('entrada', row, index, $event)"
                    @adjustment-submit-shortcut="onAdjustmentSubmitShortcut('entrada', row, index, $event)"
                    @adjustment-cancel-shortcut="onAdjustmentCancelShortcut('entrada', row, index)"
                    @adjustment-add="addLineAdjustment('entrada', row, index)"
                    @adjustment-close="closeAdjustmentModal('entrada', row, index)"
                    @toggle-details="toggleLineDetails('entrada', row, index)"
                    @remove-line="removeRow('entrada', index)"
                    @toggle-adjustment-history="toggleAdjustmentHistory('entrada', row, index)"
                    @set-adjustment-sign="setAdjustmentSign(row, $event.adjustment, $event.sign)"
                    @set-adjustment-absolute="setAdjustmentAbsoluteAmount(row, $event.adjustment, $event.value)"
                    @adjustment-history-changed="onAdjustmentHistoryChanged(row)"
                    @remove-adjustment="removeLineAdjustment(row, $event)"
                  />
                </div>
                <template #footer>
                  <div class="finances-page__table-footer text-xs text-[rgb(var(--muted))]">Esperado: {{ formatMoney(entriesExpected) }} | Efetivado: {{ formatMoney(entriesEffective) }}</div>
                </template>
              </UCard>

              <UCard class="finances-page__table-card finances-page__table-card--saida">
                <template #header><div class="finances-page__table-header flex items-center justify-between"><h3 class="finances-page__table-title text-sm font-semibold">Saidas</h3><UButton class="finances-page__table-add-line finances-page__table-add-line--saida" icon="i-lucide-plus" size="xs" label="Linha" @click="draft.saidas.push(makeLine('saida', draft.saidas.length)); queuePersist()" /></div></template>
                <div class="space-y-2">
                  <FinanceLineCard
                    v-for="(row, index) in draft.saidas"
                    :key="row.id"
                    kind="saida"
                    :row="row"
                    :index="index"
                    :category-options="categoryOptions('saida')"
                    :details-open="isLineDetailsOpen('saida', row, index)"
                    :effective-date-modal-open="isEffectiveDateModalOpen('saida', row, index)"
                    :adjustment-modal-open="isAdjustmentModalOpen('saida', row, index)"
                    :adjustment-history-open="isAdjustmentHistoryOpen('saida', row, index)"
                    :adjustment-draft="ensureAdjustmentDraft('saida', row, index)"
                    :adjustment-input-hint="formatAdjustmentInputHint('saida')"
                    :line-total="lineTotal(row)"
                    :fixed-account="resolveFixedById(row.fixedAccountId)"
                    :format-money="formatMoney"
                    :format-signed-money="formatSignedMoney"
                    @line-card-click="onLineCardClick('saida', row, index, $event)"
                    @persist="queuePersist"
                    @effective-toggle="onEffectiveToggle('saida', row, index, $event)"
                    @effective-date-open="setEffectiveDateModalOpen('saida', row, index, $event)"
                    @effective-date-submit-shortcut="onEffectiveDateSubmitShortcut('saida', row, index, $event)"
                    @effective-date-cancel-shortcut="onEffectiveDateCancelShortcut('saida', row, index)"
                    @effective-today="setEffectiveToday(row)"
                    @effective-clear="clearEffectiveDate(row)"
                    @effective-close="closeEffectiveDateModal('saida', row, index)"
                    @line-total-input="onLineTotalInput(row, $event)"
                    @adjustment-open="setAdjustmentModalOpen('saida', row, index, $event)"
                    @adjustment-submit-shortcut="onAdjustmentSubmitShortcut('saida', row, index, $event)"
                    @adjustment-cancel-shortcut="onAdjustmentCancelShortcut('saida', row, index)"
                    @adjustment-add="addLineAdjustment('saida', row, index)"
                    @adjustment-close="closeAdjustmentModal('saida', row, index)"
                    @toggle-details="toggleLineDetails('saida', row, index)"
                    @remove-line="removeRow('saida', index)"
                    @toggle-adjustment-history="toggleAdjustmentHistory('saida', row, index)"
                    @set-adjustment-sign="setAdjustmentSign(row, $event.adjustment, $event.sign)"
                    @set-adjustment-absolute="setAdjustmentAbsoluteAmount(row, $event.adjustment, $event.value)"
                    @adjustment-history-changed="onAdjustmentHistoryChanged(row)"
                    @remove-adjustment="removeLineAdjustment(row, $event)"
                  />
                </div>
                <template #footer>
                  <div class="finances-page__table-footer text-xs text-[rgb(var(--muted))]">Esperado: {{ formatMoney(exitsExpected) }} | Efetivado: {{ formatMoney(exitsEffective) }}</div>
                </template>
              </UCard>
            </div>

            <div class="finances-page__balance mt-4 rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p class="finances-page__balance-label text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Saldo</p>
              <p class="finances-page__balance-value text-2xl font-semibold" :class="balanceEffective >= 0 ? 'text-[rgb(var(--success))]' : 'text-[rgb(var(--danger))]'">{{ formatMoney(balanceEffective) }}</p>
              <p class="finances-page__balance-expected text-xs text-[rgb(var(--muted))]">Esperado: {{ formatMoney(balanceExpected) }}</p>
              <UBadge color="neutral" variant="soft" class="finances-page__balance-status mt-2">{{ activeSheetSaving ? 'Salvando...' : 'Salvo automaticamente' }}</UBadge>
            </div>
          </template>
        </section>
      </UDashboardPanel>
    </UDashboardGroup>

    <USlideover
      v-model:open="configOpen"
      class="finances-config__slideover"
      side="right"
      title="Configuracao financeira"
      description="Cadastre categorias e contas fixas para acelerar o preenchimento das linhas."
      :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="finances-config space-y-4">
          <UAlert
            v-if="configErrorMessage"
            class="finances-config__alert finances-config__alert--error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            title="Erro"
            :description="configErrorMessage" />

          <UCollapsible :default-open="true" class="finances-config__collapsible">
            <template #default="{ open }">
              <div class="finances-config__collapsible-trigger">
                <div class="min-w-0">
                  <p class="text-sm font-semibold">Entradas de clientes</p>
                  <p class="text-xs text-[rgb(var(--muted))]">Mensalidades ativas que alimentam as entradas.</p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge class="finances-config__counter-badge" color="neutral" variant="soft">{{ clientRecurringEntries.length }} itens</UBadge>
                  <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
                </div>
              </div>
            </template>

            <template #content>
              <div class="finances-config__collapsible-content space-y-2">
                <div v-if="clientRecurringEntries.length === 0" class="rounded-[var(--radius-sm)] border border-dashed border-[rgb(var(--border))] p-3 text-xs text-[rgb(var(--muted))]">
                  Nenhuma mensalidade ativa encontrada para o cliente atual.
                </div>
                <div
                  v-for="entry in clientRecurringEntries"
                  :key="entry.id"
                  class="finances-config__item-row">
                  <div class="min-w-0 w-full space-y-1">
                    <div class="flex items-center justify-between gap-2">
                      <p class="truncate text-sm font-medium">{{ entry.name }}</p>
                      <UBadge class="finances-config__item-total-badge" color="success" variant="soft">
                        {{ formatMoney(entry.amount + Number(recurringEntryForClient(entry.id)?.adjustmentAmount || 0)) }}
                      </UBadge>
                    </div>
                    <p class="text-xs text-[rgb(var(--muted))]">Base: {{ formatMoney(entry.amount) }} | Vencimento: {{ entry.dueDay || '--' }}</p>
                    <div class="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)]">
                      <UInput
                        class="finances-config__input finances-config__input--recurring-adjustment"
                        :model-value="Number(recurringEntryForClient(entry.id)?.adjustmentAmount || 0)"
                        type="number"
                        step="0.01"
                        placeholder="+500 ou -1000"
                        @update:model-value="setRecurringAdjustment(entry.id, Number($event || 0))" />
                      <UInput
                        class="finances-config__input finances-config__input--recurring-notes"
                        :model-value="recurringEntryForClient(entry.id)?.notes || ''"
                        placeholder="Motivo do ajuste do mes"
                        @update:model-value="setRecurringNotes(entry.id, String($event || ''))" />
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </UCollapsible>

          <UCollapsible :default-open="true" class="finances-config__collapsible">
            <template #default="{ open }">
              <div class="finances-config__collapsible-trigger">
                <div class="min-w-0">
                  <p class="text-sm font-semibold">Categorias</p>
                  <p class="text-xs text-[rgb(var(--muted))]">Defina categorias para entradas e saidas.</p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge class="finances-config__counter-badge" color="neutral" variant="soft">{{ configDraft.categories.length }} itens</UBadge>
                  <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
                </div>
              </div>
            </template>

            <template #content>
              <div class="finances-config__collapsible-content space-y-2">
                <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                  <UInput v-model="newCategory.name" class="finances-config__input finances-config__input--category-name" placeholder="Nome da categoria" />
                  <OmniSelectMenuInput
                    v-model="newCategory.kind"
                    class="finances-config__input finances-config__input--category-kind"
                    :items="KIND_OPTIONS"
                    item-display-mode="text"
                    :searchable="false"
                    :creatable="false"
                    :clear="false"
                    :badge-mode="true"
                    option-edit-mode="none"
                    color="neutral"
                    variant="none"
                    :highlight="false"
                  />
                </div>
                <UTextarea v-model="newCategory.description" class="finances-config__input finances-config__input--category-description" :rows="2" placeholder="Descricao (opcional)" />
                <div class="flex justify-end">
                  <UButton class="finances-config__action finances-config__action--add-category" icon="i-lucide-plus" size="sm" @click="addCategory">Adicionar categoria</UButton>
                </div>

                <div class="mt-3 space-y-2">
                  <div
                    v-for="category in configDraft.categories"
                    :key="category.id"
                    class="finances-config__item-row">
                    <div class="min-w-0 w-full">
                      <template v-if="editingCategoryId === category.id">
                        <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                          <UInput v-model="categoryEditDraft.name" class="finances-config__input finances-config__input--category-edit-name" placeholder="Nome da categoria" />
                          <OmniSelectMenuInput
                            v-model="categoryEditDraft.kind"
                            class="finances-config__input finances-config__input--category-edit-kind"
                            :items="KIND_OPTIONS"
                            item-display-mode="text"
                            :searchable="false"
                            :creatable="false"
                            :clear="false"
                            :badge-mode="true"
                            option-edit-mode="none"
                            color="neutral"
                            variant="none"
                            :highlight="false"
                          />
                        </div>
                        <div class="mt-2 flex justify-end gap-1">
                          <UButton size="xs" color="neutral" variant="soft" class="finances-config__action finances-config__action--save-category" @click="finishEditCategory">Salvar</UButton>
                          <UButton size="xs" color="neutral" variant="ghost" class="finances-config__action finances-config__action--cancel-category" @click="cancelEditCategory">Cancelar</UButton>
                        </div>
                      </template>
                      <template v-else>
                        <p class="truncate text-sm font-medium">{{ category.name }}</p>
                        <p class="text-xs text-[rgb(var(--muted))]">{{ category.kind }} | {{ category.description || 'Sem descricao' }}</p>
                      </template>
                    </div>
                    <div class="flex items-center gap-1">
                      <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" class="finances-config__action finances-config__action--edit-category" @click="startEditCategory(category.id)" />
                      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" class="finances-config__action finances-config__action--remove-category" @click="removeCategory(category.id)" />
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </UCollapsible>

          <UCollapsible :default-open="true" class="finances-config__collapsible">
            <template #default="{ open }">
              <div class="finances-config__collapsible-trigger">
                <div class="min-w-0">
                  <p class="text-sm font-semibold">Contas fixas</p>
                  <p class="text-xs text-[rgb(var(--muted))]">Cadastre custos/receitas recorrentes e composicao detalhada.</p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge class="finances-config__counter-badge" color="neutral" variant="soft">{{ configDraft.fixedAccounts.length }} itens</UBadge>
                  <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
                </div>
              </div>
            </template>

            <template #content>
              <div class="finances-config__collapsible-content space-y-2">
                <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_170px]">
                  <UInput v-model="newFixed.name" class="finances-config__input finances-config__input--fixed-name" placeholder="Nome da conta fixa" />
                  <OmniSelectMenuInput
                    v-model="newFixed.kind"
                    class="finances-config__input finances-config__input--fixed-kind"
                    :items="KIND_OPTIONS"
                    item-display-mode="text"
                    :searchable="false"
                    :creatable="false"
                    :clear="false"
                    :badge-mode="true"
                    option-edit-mode="none"
                    color="neutral"
                    variant="none"
                    :highlight="false"
                  />
                  <OmniSelectMenuInput
                    v-model="newFixed.categoryId"
                    :items="categoryConfigOptions"
                    placeholder="Categoria"
                    searchable
                    clear
                    item-display-mode="text"
                    :badge-mode="true"
                    option-edit-mode="color"
                    color="neutral"
                    variant="none"
                    :highlight="false" />
                </div>
                <div class="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                  <OmniMoneyInput v-model="newFixed.defaultAmount" />
                  <UInput v-model="newFixed.notes" class="finances-config__input finances-config__input--fixed-notes" placeholder="Observacao (opcional)" />
                </div>
                <div class="flex justify-end">
                  <UButton class="finances-config__action finances-config__action--add-fixed" icon="i-lucide-plus" size="sm" @click="addFixedAccount">Adicionar conta fixa</UButton>
                </div>
              </div>

              <div class="mt-3 space-y-3">
                <UCollapsible
                  class="finances-config__fixed-collapsible"
                  v-for="account in configDraft.fixedAccounts"
                  :key="account.id"
                  :default-open="true"
                  >
                  <template #default="{ open }">
                    <div class="finances-config__collapsible-trigger">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold">{{ account.name }}</p>
                        <p class="text-xs text-[rgb(var(--muted))]">
                          {{ formatMoney(account.defaultAmount) }}
                        </p>
                      </div>
                      <div class="flex items-center gap-1">
                        <UBadge class="finances-config__fixed-badge finances-config__fixed-badge--count" color="neutral" variant="soft" size="xs">{{ account.members.length }} itens</UBadge>
                        <UBadge class="finances-config__fixed-badge finances-config__fixed-badge--kind" color="neutral" variant="soft" size="xs">{{ account.kind }}</UBadge>
                        <UBadge class="finances-config__fixed-badge finances-config__fixed-badge--category" color="neutral" variant="soft" size="xs">{{ resolveCategoryNameById(account.categoryId) || 'Sem categoria' }}</UBadge>
                        <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" class="finances-config__action finances-config__action--edit-fixed" @click.stop="startEditFixed(account.id)" />
                        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" class="finances-config__action finances-config__action--remove-fixed" @click.stop="removeFixedAccount(account.id)" />
                        <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
                      </div>
                    </div>
                  </template>

                  <template #content>
                    <div class="finances-config__collapsible-content space-y-2">
                      <template v-if="editingFixedId === account.id">
                        <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_170px]">
                          <UInput v-model="fixedEditDraft.name" class="finances-config__input finances-config__input--fixed-edit-name" placeholder="Nome da conta fixa" />
                          <OmniSelectMenuInput
                            v-model="fixedEditDraft.kind"
                            class="finances-config__input finances-config__input--fixed-edit-kind"
                            :items="KIND_OPTIONS"
                            item-display-mode="text"
                            :searchable="false"
                            :creatable="false"
                            :clear="false"
                            :badge-mode="true"
                            option-edit-mode="none"
                            color="neutral"
                            variant="none"
                            :highlight="false"
                          />
                          <OmniSelectMenuInput
                            v-model="fixedEditDraft.categoryId"
                            :items="categoryConfigOptions"
                            placeholder="Categoria"
                            searchable
                            clear
                            item-display-mode="text"
                            :badge-mode="true"
                            option-edit-mode="color"
                            color="neutral"
                            variant="none"
                            :highlight="false" />
                        </div>
                        <div class="flex justify-end gap-1">
                          <UButton size="xs" color="neutral" variant="soft" class="finances-config__action finances-config__action--save-fixed" @click="finishEditFixed">Salvar</UButton>
                          <UButton size="xs" color="neutral" variant="ghost" class="finances-config__action finances-config__action--cancel-fixed" @click="cancelEditFixed">Cancelar</UButton>
                        </div>
                      </template>

                      <div class="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                        <OmniMoneyInput v-model="account.defaultAmount" @update:model-value="queueConfigPersist" />
                        <UInput v-model="account.notes" class="finances-config__input finances-config__input--fixed-account-notes" placeholder="Observacao da conta fixa" @update:model-value="queueConfigPersist" />
                      </div>

                      <div class="finances-config__details">
                        <p class="finances-config__details-summary">Composicao (ex.: folha salarial)</p>
                        <div class="space-y-2 pt-2">
                          <div
                            v-for="member in account.members"
                            :key="member.id"
                            class="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                            <UInput v-model="member.name" class="finances-config__input finances-config__input--fixed-member-name" placeholder="Pessoa/item" @update:model-value="queueConfigPersist" />
                            <OmniMoneyInput v-model="member.amount" @update:model-value="updateFixedAmountFromMembers(account, { preserveWhenEmpty: true, persist: true })" />
                            <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" class="finances-config__action finances-config__action--remove-fixed-member" @click="removeFixedMember(account, member.id)" />
                          </div>
                          <div class="flex justify-start">
                            <UButton icon="i-lucide-plus" size="xs" color="neutral" variant="soft" class="finances-config__action finances-config__action--add-fixed-member" @click.stop="addFixedMember(account)">
                              Adicionar item
                            </UButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </UCollapsible>
              </div>
            </template>
          </UCollapsible>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <p class="text-xs text-[rgb(var(--muted))]">{{ configSaving ? 'Salvando configuracoes...' : 'Salvo automaticamente' }}</p>
          <UButton color="neutral" variant="ghost" class="finances-config__action finances-config__action--close" @click="configOpen = false">Fechar</UButton>
        </div>
      </template>
    </USlideover>
  </section>
</template>

<style scoped>
.finances-page .omni-select-menu-input{
  display: flex;
}
.finances-page__group {
  display: flex;
  width: 100%;
  min-height: 680px;
  gap: 12px;
}

.finances-page__panel {
  min-width: 0;
  min-height: 50svh;
}

.finances-page__title {
  border: none;
  border-bottom: 1px solid rgb(var(--border));
  border-radius: 0;
  background: transparent;
  color: rgb(var(--text));
  font-size: 1.7rem;
  font-weight: 700;
  padding: 2px 0 8px;
  outline: none;
}

.finances-config__item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  padding: 8px 10px;
}

.finances-config__collapsible {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  padding: 10px;
}

.finances-config__collapsible-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.finances-config__collapsible-content {
  padding-top: 10px;
}

.finances-config__fixed-card {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  padding: 10px;
}

.finances-config__details {
  border-top: 1px dashed rgb(var(--border));
  padding-top: 8px;
}

.finances-config__details-summary {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgb(var(--muted));
}

@media (max-width: 1024px) {
  .finances-page__group {
    min-height: 0;
    flex-direction: column;
  }
}
</style>
