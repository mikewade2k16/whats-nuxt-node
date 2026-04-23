import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoAnalyticsCountRow,
  FilaAtendimentoAnalyticsDataResponse,
  FilaAtendimentoAnalyticsHourlySalesRow,
  FilaAtendimentoAnalyticsIntelligenceResponse,
  FilaAtendimentoAnalyticsRankingAlert,
  FilaAtendimentoAnalyticsRankingRow,
  FilaAtendimentoAnalyticsRankingResponse,
  FilaAtendimentoAnalyticsRankingStoreComparison
} from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStoreIds(storeIds: string[]) {
  return [...new Set(
    (Array.isArray(storeIds) ? storeIds : [])
      .map(storeId => normalizeText(storeId))
      .filter(Boolean)
  )]
}

function weightedAverage(entries: Array<{ value: unknown; weight: unknown }>) {
  const totals = entries.reduce((accumulator, entry) => {
    const weight = Math.max(0, normalizeNumber(entry.weight))
    if (weight <= 0) {
      return accumulator
    }

    return {
      value: accumulator.value + (normalizeNumber(entry.value) * weight),
      weight: accumulator.weight + weight
    }
  }, { value: 0, weight: 0 })

  if (!totals.weight) {
    return 0
  }

  return totals.value / totals.weight
}

function aggregateCountRows(groups: Array<FilaAtendimentoAnalyticsCountRow[] | undefined>) {
  const aggregate = new Map<string, FilaAtendimentoAnalyticsCountRow>()

  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      const label = normalizeText(item?.label)
      if (!label) {
        continue
      }

      const key = label.toLocaleLowerCase('pt-BR')
      const current = aggregate.get(key) || { label, count: 0 }
      current.count = normalizeNumber(current.count) + normalizeNumber(item?.count)
      aggregate.set(key, current)
    }
  }

  return [...aggregate.values()].sort((left, right) => {
    const countDiff = normalizeNumber(right.count) - normalizeNumber(left.count)
    if (countDiff !== 0) {
      return countDiff
    }

    return normalizeText(left.label).localeCompare(normalizeText(right.label), 'pt-BR')
  })
}

function aggregateHourlySales(groups: Array<FilaAtendimentoAnalyticsHourlySalesRow[] | undefined>) {
  const aggregate = new Map<string, FilaAtendimentoAnalyticsHourlySalesRow>()

  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      const label = normalizeText(item?.label)
      if (!label) {
        continue
      }

      const current = aggregate.get(label) || { label, count: 0, value: 0 }
      current.count = normalizeNumber(current.count) + normalizeNumber(item?.count)
      current.value = normalizeNumber(current.value) + normalizeNumber(item?.value)
      aggregate.set(label, current)
    }
  }

  return [...aggregate.values()].sort((left, right) => {
    const leftHour = Number.parseInt(normalizeText(left.label).replace(/[^0-9]/g, ''), 10)
    const rightHour = Number.parseInt(normalizeText(right.label).replace(/[^0-9]/g, ''), 10)

    if (Number.isFinite(leftHour) && Number.isFinite(rightHour) && leftHour !== rightHour) {
      return leftHour - rightHour
    }

    return normalizeText(left.label).localeCompare(normalizeText(right.label), 'pt-BR')
  })
}

function estimateAnalyticsVolume(report: FilaAtendimentoAnalyticsDataResponse | null | undefined) {
  const outcomeCount = (report?.outcomeSummary || []).reduce((total, item) => total + normalizeNumber(item?.count), 0)
  const hourlyCount = (report?.hourlySales || []).reduce((total, item) => total + normalizeNumber(item?.count), 0)
  const soldCount = (report?.soldProducts || []).reduce((total, item) => total + normalizeNumber(item?.count), 0)
  return Math.max(outcomeCount, hourlyCount, soldCount, 1)
}

function aggregateRankingRows(groups: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  rows?: FilaAtendimentoAnalyticsRankingRow[]
}>) {
  const aggregate = new Map<string, {
    row: FilaAtendimentoAnalyticsRankingRow
    weight: number
    paWeighted: number
    qualityWeighted: number
    queueJumpWeighted: number
    ticketWeighted: number
  }>()

  for (const group of groups) {
    for (const item of Array.isArray(group.rows) ? group.rows : []) {
      const consultantId = normalizeText(item?.consultantId)
      const consultantName = normalizeText(item?.consultantName)
      const key = consultantId || `${consultantName.toLocaleLowerCase('pt-BR')}::${group.storeId}`
      if (!key) {
        continue
      }

      const attendances = Math.max(0, normalizeNumber(item?.attendances))
      const conversions = Math.max(0, normalizeNumber(item?.conversions))
      const soldValue = Math.max(0, normalizeNumber(item?.soldValue))
      const rowWeight = Math.max(attendances, conversions, 1)
      const current = aggregate.get(key) || {
        row: {
          consultantId,
          consultantName,
          storeId: group.storeId,
          storeName: group.storeName,
          storeCode: group.storeCode,
          soldValue: 0,
          attendances: 0,
          conversions: 0,
          conversionRate: 0,
          ticketAverage: 0,
          paScore: 0,
          qualityScore: 0,
          queueJumpRate: 0
        },
        weight: 0,
        paWeighted: 0,
        qualityWeighted: 0,
        queueJumpWeighted: 0,
        ticketWeighted: 0
      }

      current.row.consultantId = current.row.consultantId || consultantId
      current.row.consultantName = current.row.consultantName || consultantName
  current.row.storeId = current.row.storeId || group.storeId
  current.row.storeName = current.row.storeName || group.storeName
  current.row.storeCode = current.row.storeCode || group.storeCode
      current.row.soldValue = normalizeNumber(current.row.soldValue) + soldValue
      current.row.attendances = normalizeNumber(current.row.attendances) + attendances
      current.row.conversions = normalizeNumber(current.row.conversions) + conversions
      current.weight += rowWeight
      current.paWeighted += normalizeNumber(item?.paScore) * rowWeight
      current.qualityWeighted += normalizeNumber(item?.qualityScore) * rowWeight
      current.queueJumpWeighted += normalizeNumber(item?.queueJumpRate) * rowWeight
      current.ticketWeighted += normalizeNumber(item?.ticketAverage) * rowWeight
      aggregate.set(key, current)
    }
  }

  return [...aggregate.values()]
    .map((entry) => {
      const attendances = normalizeNumber(entry.row.attendances)
      const conversions = normalizeNumber(entry.row.conversions)
      const soldValue = normalizeNumber(entry.row.soldValue)

      return {
        ...entry.row,
        conversionRate: attendances > 0 ? (conversions / attendances) * 100 : 0,
        ticketAverage: conversions > 0 ? soldValue / conversions : (entry.weight > 0 ? entry.ticketWeighted / entry.weight : 0),
        paScore: entry.weight > 0 ? entry.paWeighted / entry.weight : 0,
        qualityScore: entry.weight > 0 ? entry.qualityWeighted / entry.weight : 0,
        queueJumpRate: entry.weight > 0 ? entry.queueJumpWeighted / entry.weight : 0
      }
    })
    .sort((left, right) => {
      const soldDiff = normalizeNumber(right.soldValue) - normalizeNumber(left.soldValue)
      if (soldDiff !== 0) {
        return soldDiff
      }

      return normalizeNumber(right.attendances) - normalizeNumber(left.attendances)
    })
}

function aggregateRankingAlerts(groups: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  alerts?: FilaAtendimentoAnalyticsRankingAlert[]
}>) {
  return groups
    .flatMap(group => (Array.isArray(group.alerts) ? group.alerts : []).map((item) => ({
      ...item,
      storeId: normalizeText(item?.storeId) || group.storeId,
      storeName: normalizeText(item?.storeName) || group.storeName,
      storeCode: normalizeText(item?.storeCode) || group.storeCode
    })))
    .filter(item => normalizeText(item.consultantId) || normalizeText(item.consultantName))
    .sort((left, right) => {
      const rightDelta = Math.abs(normalizeNumber(right.value) - normalizeNumber(right.threshold))
      const leftDelta = Math.abs(normalizeNumber(left.value) - normalizeNumber(left.threshold))
      return rightDelta - leftDelta
    })
}

function buildRankingStoreComparisons(items: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  response: FilaAtendimentoAnalyticsRankingResponse
}>): FilaAtendimentoAnalyticsRankingStoreComparison[] {
  return items
    .map(({ storeId, storeName, storeCode, response }) => {
      const monthlyRows = response?.monthlyRows || []
      const dailyRows = response?.dailyRows || []
      const monthlyAttendances = monthlyRows.reduce((total, row) => total + normalizeNumber(row?.attendances), 0)
      const monthlyConversions = monthlyRows.reduce((total, row) => total + normalizeNumber(row?.conversions), 0)
      const monthlySoldValue = monthlyRows.reduce((total, row) => total + normalizeNumber(row?.soldValue), 0)
      const dailyAttendances = dailyRows.reduce((total, row) => total + normalizeNumber(row?.attendances), 0)
      const dailyConversions = dailyRows.reduce((total, row) => total + normalizeNumber(row?.conversions), 0)
      const dailySoldValue = dailyRows.reduce((total, row) => total + normalizeNumber(row?.soldValue), 0)

      return {
        storeId,
        storeName,
        storeCode,
        monthlySoldValue,
        monthlyAttendances,
        monthlyConversionRate: monthlyAttendances > 0 ? (monthlyConversions / monthlyAttendances) * 100 : 0,
        dailySoldValue,
        dailyAttendances,
        dailyConversionRate: dailyAttendances > 0 ? (dailyConversions / dailyAttendances) * 100 : 0,
        alerts: (response?.alerts || []).length,
        topConsultantName: normalizeText(response?.monthlyRows?.[0]?.consultantName)
      }
    })
    .sort((left, right) => {
      const monthlyDiff = normalizeNumber(right.monthlySoldValue) - normalizeNumber(left.monthlySoldValue)
      if (monthlyDiff !== 0) {
        return monthlyDiff
      }

      return normalizeNumber(right.dailySoldValue) - normalizeNumber(left.dailySoldValue)
    })
}

function aggregateRankingResponse(items: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  response: FilaAtendimentoAnalyticsRankingResponse
}>) {
  return {
    monthlyRows: aggregateRankingRows(items.map(item => ({
      storeId: item.storeId,
      storeName: item.storeName,
      storeCode: item.storeCode,
      rows: item.response?.monthlyRows
    }))),
    dailyRows: aggregateRankingRows(items.map(item => ({
      storeId: item.storeId,
      storeName: item.storeName,
      storeCode: item.storeCode,
      rows: item.response?.dailyRows
    }))),
    alerts: aggregateRankingAlerts(items.map(item => ({
      storeId: item.storeId,
      storeName: item.storeName,
      storeCode: item.storeCode,
      alerts: item.response?.alerts
    }))),
    storeComparisons: buildRankingStoreComparisons(items)
  }
}

function aggregateDataResponse(responses: FilaAtendimentoAnalyticsDataResponse[]) {
  const volumes = responses.map(response => estimateAnalyticsVolume(response))

  return {
    timeIntelligence: {
      quickHighPotentialCount: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.quickHighPotentialCount), 0),
      longLowSaleCount: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.longLowSaleCount), 0),
      longNoSaleCount: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.longNoSaleCount), 0),
      quickNoSaleCount: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.quickNoSaleCount), 0),
      avgQueueWaitMs: weightedAverage(responses.map((response, index) => ({ value: response?.timeIntelligence?.avgQueueWaitMs, weight: volumes[index] }))),
      notUsingQueueRate: weightedAverage(responses.map((response, index) => ({ value: response?.timeIntelligence?.notUsingQueueRate, weight: volumes[index] }))),
      totalsByStatus: {
        queue: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.totalsByStatus?.queue), 0),
        available: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.totalsByStatus?.available), 0),
        paused: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.totalsByStatus?.paused), 0),
        service: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.totalsByStatus?.service), 0)
      },
      consultantsInQueueMs: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.consultantsInQueueMs), 0),
      consultantsPausedMs: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.consultantsPausedMs), 0),
      consultantsInServiceMs: responses.reduce((total, response) => total + normalizeNumber(response?.timeIntelligence?.consultantsInServiceMs), 0)
    },
    soldProducts: aggregateCountRows(responses.map(response => response?.soldProducts)),
    requestedProducts: aggregateCountRows(responses.map(response => response?.requestedProducts)),
    visitReasons: aggregateCountRows(responses.map(response => response?.visitReasons)),
    customerSources: aggregateCountRows(responses.map(response => response?.customerSources)),
    professions: aggregateCountRows(responses.map(response => response?.professions)),
    outcomeSummary: aggregateCountRows(responses.map(response => response?.outcomeSummary)),
    hourlySales: aggregateHourlySales(responses.map(response => response?.hourlySales))
  }
}

function aggregateIntelligenceResponse(responses: FilaAtendimentoAnalyticsIntelligenceResponse[]) {
  const volumes = responses.map(response => Math.max(1, normalizeNumber(response?.totalAttendances)))
  const diagnosis = responses
    .flatMap(response => response?.diagnosis || [])
    .filter(item => normalizeText(item?.title) || normalizeText(item?.reading))
    .sort((left, right) => {
      const rank = (value: unknown) => {
        const normalized = normalizeText(value)
        if (normalized === 'critical') return 0
        if (normalized === 'attention') return 1
        if (normalized === 'healthy') return 2
        return 3
      }

      return rank(left?.level) - rank(right?.level)
    })

  return {
    healthScore: weightedAverage(responses.map((response, index) => ({ value: response?.healthScore, weight: volumes[index] }))),
    severityCounts: {
      critical: responses.reduce((total, response) => total + normalizeNumber(response?.severityCounts?.critical), 0),
      attention: responses.reduce((total, response) => total + normalizeNumber(response?.severityCounts?.attention), 0),
      healthy: responses.reduce((total, response) => total + normalizeNumber(response?.severityCounts?.healthy), 0)
    },
    totalAttendances: responses.reduce((total, response) => total + normalizeNumber(response?.totalAttendances), 0),
    diagnosis,
    recommendedActions: [...new Set(
      responses.flatMap(response => Array.isArray(response?.recommendedActions) ? response.recommendedActions : [])
        .map(action => normalizeText(action))
        .filter(Boolean)
    )],
    time: {
      avgQueueWaitMs: weightedAverage(responses.map((response, index) => ({ value: response?.time?.avgQueueWaitMs, weight: volumes[index] }))),
      notUsingQueueRate: weightedAverage(responses.map((response, index) => ({ value: response?.time?.notUsingQueueRate, weight: volumes[index] })))
    },
    ticketAverage: weightedAverage(responses.map((response, index) => ({ value: response?.ticketAverage, weight: volumes[index] }))),
    conversionRate: weightedAverage(responses.map((response, index) => ({ value: response?.conversionRate, weight: volumes[index] })))
  }
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const serverMessage = normalizeText((error as { statusMessage?: unknown }).statusMessage)
    if (serverMessage) {
      return serverMessage
    }

    const errorData = (error as { data?: Record<string, unknown> }).data
    const dataMessage = normalizeText(errorData?.message)
    if (dataMessage) {
      return dataMessage
    }

    const rawMessage = normalizeText((error as { message?: unknown }).message)
    if (rawMessage) {
      return rawMessage
    }
  }

  return fallback
}

export const useFilaAtendimentoAnalyticsStore = defineStore('fila-atendimento-analytics', () => {
  const { bffFetch } = useBffFetch()
  const operationsStore = useFilaAtendimentoOperationsStore()

  const ranking = ref<FilaAtendimentoAnalyticsRankingResponse | null>(null)
  const data = ref<FilaAtendimentoAnalyticsDataResponse | null>(null)
  const intelligence = ref<FilaAtendimentoAnalyticsIntelligenceResponse | null>(null)
  const pending = ref(false)
  const errorMessage = ref('')

  function clearState() {
    ranking.value = null
    data.value = null
    intelligence.value = null
    errorMessage.value = ''
  }

  function buildStoreQuery(storeId: string) {
    return `?storeId=${encodeURIComponent(storeId)}`
  }

  function resolveStoreIds(storeIds: string[] = []) {
    const normalizedStoreIds = normalizeStoreIds(storeIds)
    if (normalizedStoreIds.length > 0) {
      return normalizedStoreIds
    }

    const activeStoreId = normalizeText(operationsStore.state.activeStoreId)
    return activeStoreId ? [activeStoreId] : []
  }

  async function fetchRanking(options: { storeIds?: string[] } = {}) {
    const storeIds = resolveStoreIds(options.storeIds)
    if (!storeIds.length || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      if (storeIds.length === 1) {
        ranking.value = await bffFetch<FilaAtendimentoAnalyticsRankingResponse>(`/api/admin/modules/fila-atendimento/analytics-ranking${buildStoreQuery(storeIds[0])}`)
      } else {
        const responses = await Promise.all(
          storeIds.map(async (storeId) => {
            const store = operationsStore.stores.find(item => normalizeText(item.id) === storeId)
            const response = await bffFetch<FilaAtendimentoAnalyticsRankingResponse>(`/api/admin/modules/fila-atendimento/analytics-ranking${buildStoreQuery(storeId)}`)
            return {
              storeId,
              storeName: normalizeText(store?.name),
              storeCode: normalizeText(store?.code),
              response
            }
          })
        )
        ranking.value = aggregateRankingResponse(responses)
      }

      return ranking.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar o ranking.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function fetchData(options: { storeIds?: string[] } = {}) {
    const storeIds = resolveStoreIds(options.storeIds)
    if (!storeIds.length || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      if (storeIds.length === 1) {
        data.value = await bffFetch<FilaAtendimentoAnalyticsDataResponse>(`/api/admin/modules/fila-atendimento/analytics-data${buildStoreQuery(storeIds[0])}`)
      } else {
        const responses = await Promise.all(
          storeIds.map(storeId => bffFetch<FilaAtendimentoAnalyticsDataResponse>(`/api/admin/modules/fila-atendimento/analytics-data${buildStoreQuery(storeId)}`))
        )
        data.value = aggregateDataResponse(responses)
      }

      return data.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os dados operacionais.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function fetchIntelligence(options: { storeIds?: string[] } = {}) {
    const storeIds = resolveStoreIds(options.storeIds)
    if (!storeIds.length || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      if (storeIds.length === 1) {
        intelligence.value = await bffFetch<FilaAtendimentoAnalyticsIntelligenceResponse>(`/api/admin/modules/fila-atendimento/analytics-intelligence${buildStoreQuery(storeIds[0])}`)
      } else {
        const responses = await Promise.all(
          storeIds.map(storeId => bffFetch<FilaAtendimentoAnalyticsIntelligenceResponse>(`/api/admin/modules/fila-atendimento/analytics-intelligence${buildStoreQuery(storeId)}`))
        )
        intelligence.value = aggregateIntelligenceResponse(responses)
      }

      return intelligence.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar a inteligencia operacional.')
      throw error
    } finally {
      pending.value = false
    }
  }

  if (import.meta.client) {
    watch(
      () => operationsStore.state.activeStoreId,
      (nextStoreId, previousStoreId) => {
        if (normalizeText(nextStoreId) !== normalizeText(previousStoreId)) {
          clearState()
        }
      }
    )
  }

  return {
    ranking,
    data,
    intelligence,
    pending,
    errorMessage,
    clearState,
    fetchRanking,
    fetchData,
    fetchIntelligence
  }
})