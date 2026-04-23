import type {
  FilaAtendimentoCampaign,
  FilaAtendimentoCampaignMatch,
  FilaAtendimentoServiceHistoryEntry
} from '~/types/fila-atendimento'

const DEFAULT_CAMPAIGN: FilaAtendimentoCampaign = {
  id: '',
  name: '',
  description: '',
  campaignType: 'interna',
  isActive: true,
  startsAt: '',
  endsAt: '',
  targetOutcome: 'compra-reserva',
  minSaleAmount: 0,
  maxServiceMinutes: 0,
  productCodes: [],
  sourceIds: [],
  reasonIds: [],
  queueJumpOnly: false,
  existingCustomerFilter: 'all',
  bonusFixed: 0,
  bonusRate: 0
}

const VALID_OUTCOMES = new Set<FilaAtendimentoCampaign['targetOutcome']>(['qualquer', 'compra', 'reserva', 'nao-compra', 'compra-reserva'])
const VALID_EXISTING_FILTERS = new Set<FilaAtendimentoCampaign['existingCustomerFilter']>(['all', 'yes', 'no'])
const VALID_CAMPAIGN_TYPES = new Set<FilaAtendimentoCampaign['campaignType']>(['interna', 'comercial'])

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function uniqueList(values: unknown, upper = false) {
  const items = Array.isArray(values) ? values : []
  const normalized = items
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => (upper ? value.toUpperCase() : value))

  return [...new Set(normalized)]
}

function toNonNegativeNumber(value: unknown) {
  return Math.max(0, Number(value) || 0)
}

function toStartOfDayMs(dateValue: unknown) {
  if (!dateValue) {
    return null
  }

  const date = new Date(`${String(dateValue)}T00:00:00`)
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function toEndOfDayMs(dateValue: unknown) {
  if (!dateValue) {
    return null
  }

  const date = new Date(`${String(dateValue)}T23:59:59.999`)
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function matchesOutcome(targetOutcome: FilaAtendimentoCampaign['targetOutcome'], finishOutcome: unknown) {
  const outcome = String(finishOutcome ?? '').trim()
  if (targetOutcome === 'qualquer') {
    return true
  }

  if (targetOutcome === 'compra-reserva') {
    return outcome === 'compra' || outcome === 'reserva'
  }

  return targetOutcome === outcome
}

function matchesExistingCustomer(filter: FilaAtendimentoCampaign['existingCustomerFilter'], isExistingCustomer: unknown) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'yes') {
    return Boolean(isExistingCustomer)
  }

  if (filter === 'no') {
    return !Boolean(isExistingCustomer)
  }

  return true
}

function intersects(selectedValues: string[], entryValues: string[]) {
  if (!selectedValues.length) {
    return true
  }

  return selectedValues.some((value) => entryValues.includes(value))
}

function extractClosedProductCodes(historyEntry: Partial<FilaAtendimentoServiceHistoryEntry>) {
  return uniqueList(
    (Array.isArray(historyEntry.productsClosed) ? historyEntry.productsClosed : []).map((item) => item?.code),
    true
  )
}

function calculateCampaignBonus(campaign: FilaAtendimentoCampaign, historyEntry: Partial<FilaAtendimentoServiceHistoryEntry>) {
  const saleAmount = Number(historyEntry.saleAmount || 0)
  const totalBonus = toNonNegativeNumber(campaign.bonusFixed) + saleAmount * toNonNegativeNumber(campaign.bonusRate)
  return Number(totalBonus.toFixed(2))
}

function getCampaignMatches(historyEntry: Partial<FilaAtendimentoServiceHistoryEntry>) {
  return (Array.isArray(historyEntry.campaignMatches) ? historyEntry.campaignMatches : []) as FilaAtendimentoCampaignMatch[]
}

function calcPerfStats(entries: Array<Partial<FilaAtendimentoServiceHistoryEntry>>) {
  const converted = entries.filter((entry) => entry.finishOutcome === 'compra' || entry.finishOutcome === 'reserva')
  const soldValue = converted.reduce((sum, entry) => sum + Number(entry.saleAmount || 0), 0)
  return {
    total: entries.length,
    conversions: converted.length,
    conversionRate: entries.length ? (converted.length / entries.length) * 100 : 0,
    soldValue,
    ticketAverage: converted.length ? soldValue / converted.length : 0
  }
}

export function normalizeCampaign(rawCampaign: unknown = {}) {
  const source = asRecord(rawCampaign)
  const merged = {
    ...DEFAULT_CAMPAIGN,
    ...source
  }

  const targetOutcome = VALID_OUTCOMES.has(String(merged.targetOutcome ?? '') as FilaAtendimentoCampaign['targetOutcome'])
    ? (String(merged.targetOutcome) as FilaAtendimentoCampaign['targetOutcome'])
    : DEFAULT_CAMPAIGN.targetOutcome

  const existingCustomerFilter = VALID_EXISTING_FILTERS.has(String(merged.existingCustomerFilter ?? '') as FilaAtendimentoCampaign['existingCustomerFilter'])
    ? (String(merged.existingCustomerFilter) as FilaAtendimentoCampaign['existingCustomerFilter'])
    : DEFAULT_CAMPAIGN.existingCustomerFilter

  const campaignType = VALID_CAMPAIGN_TYPES.has(String(merged.campaignType ?? '') as FilaAtendimentoCampaign['campaignType'])
    ? (String(merged.campaignType) as FilaAtendimentoCampaign['campaignType'])
    : DEFAULT_CAMPAIGN.campaignType

  return {
    ...DEFAULT_CAMPAIGN,
    id: String(merged.id ?? '').trim(),
    name: String(merged.name ?? '').trim(),
    description: String(merged.description ?? '').trim(),
    campaignType,
    isActive: Boolean(merged.isActive),
    startsAt: String(merged.startsAt ?? '').trim(),
    endsAt: String(merged.endsAt ?? '').trim(),
    targetOutcome,
    minSaleAmount: toNonNegativeNumber(merged.minSaleAmount),
    maxServiceMinutes: toNonNegativeNumber(merged.maxServiceMinutes),
    productCodes: uniqueList(merged.productCodes, true),
    sourceIds: uniqueList(merged.sourceIds),
    reasonIds: uniqueList(merged.reasonIds),
    queueJumpOnly: Boolean(merged.queueJumpOnly),
    existingCustomerFilter,
    bonusFixed: toNonNegativeNumber(merged.bonusFixed),
    bonusRate: toNonNegativeNumber(merged.bonusRate)
  } satisfies FilaAtendimentoCampaign
}

export function applyCampaignsToHistoryEntry(
  campaigns: FilaAtendimentoCampaign[] = [],
  historyEntry: Partial<FilaAtendimentoServiceHistoryEntry> = {}
) {
  const finishedAt = Number(historyEntry.finishedAt || Date.now())
  const durationMs = Number(historyEntry.durationMs || 0)
  const saleAmount = Number(historyEntry.saleAmount || 0)
  const customerSources = uniqueList(historyEntry.customerSources)
  const visitReasons = uniqueList(historyEntry.visitReasons)
  const closedProductCodes = extractClosedProductCodes(historyEntry)
  const matches: FilaAtendimentoCampaignMatch[] = []

  campaigns.forEach((rawCampaign) => {
    const campaign = normalizeCampaign(rawCampaign)

    if (!campaign.id || !campaign.name || !campaign.isActive) {
      return
    }

    const startMs = toStartOfDayMs(campaign.startsAt)
    const endMs = toEndOfDayMs(campaign.endsAt)

    if (startMs !== null && finishedAt < startMs) {
      return
    }

    if (endMs !== null && finishedAt > endMs) {
      return
    }

    if (!matchesOutcome(campaign.targetOutcome, historyEntry.finishOutcome)) {
      return
    }

    if (campaign.minSaleAmount > 0 && saleAmount < campaign.minSaleAmount) {
      return
    }

    if (campaign.maxServiceMinutes > 0 && durationMs > campaign.maxServiceMinutes * 60000) {
      return
    }

    const matchedProductCodes = campaign.productCodes.filter((code) => closedProductCodes.includes(code))
    if (campaign.productCodes.length > 0 && matchedProductCodes.length === 0) {
      return
    }

    if (!intersects(campaign.sourceIds, customerSources)) {
      return
    }

    if (!intersects(campaign.reasonIds, visitReasons)) {
      return
    }

    if (campaign.queueJumpOnly && historyEntry.startMode !== 'queue-jump') {
      return
    }

    if (!matchesExistingCustomer(campaign.existingCustomerFilter, historyEntry.isExistingCustomer)) {
      return
    }

    matches.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      matchedProductCodes,
      bonusValue: calculateCampaignBonus(campaign, historyEntry)
    })
  })

  return {
    matches,
    totalBonus: Number(matches.reduce((sum, item) => sum + Number(item.bonusValue || 0), 0).toFixed(2))
  }
}

export function deriveCampaignStatus(campaign: Partial<FilaAtendimentoCampaign>) {
  if (!campaign.isActive) return 'inativa'
  const now = Date.now()
  const startMs = toStartOfDayMs(campaign.startsAt)
  const endMs = toEndOfDayMs(campaign.endsAt)
  if (endMs !== null && now > endMs) return 'encerrada'
  if (startMs !== null && now < startMs) return 'aguardando'
  return 'ativa'
}

export function buildCampaignPerformance(
  campaigns: FilaAtendimentoCampaign[] = [],
  history: Array<Partial<FilaAtendimentoServiceHistoryEntry>> = []
) {
  const result = new Map<string, { hit: ReturnType<typeof calcPerfStats>; nonHit: ReturnType<typeof calcPerfStats>; hasPeriod: boolean }>()

  campaigns.forEach((rawCampaign) => {
    const campaign = normalizeCampaign(rawCampaign)
    const startMs = toStartOfDayMs(campaign.startsAt)
    const endMs = toEndOfDayMs(campaign.endsAt)
    const hasPeriod = startMs !== null || endMs !== null

    const periodHistory = hasPeriod
      ? history.filter((entry) => {
          const timestamp = Number(entry.finishedAt || 0)
          if (startMs !== null && timestamp < startMs) return false
          if (endMs !== null && timestamp > endMs) return false
          return true
        })
      : history

    const hitEntries = periodHistory.filter((entry) =>
      getCampaignMatches(entry).some((match) => match.campaignId === campaign.id)
    )
    const nonHitEntries = periodHistory.filter((entry) =>
      !getCampaignMatches(entry).some((match) => match.campaignId === campaign.id)
    )

    result.set(campaign.id, {
      hit: calcPerfStats(hitEntries),
      nonHit: calcPerfStats(nonHitEntries),
      hasPeriod
    })
  })

  return result
}