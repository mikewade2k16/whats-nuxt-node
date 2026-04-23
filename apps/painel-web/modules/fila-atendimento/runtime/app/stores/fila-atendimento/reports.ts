import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoReportFilters,
  FilaAtendimentoReportsConsultantAggRow,
  FilaAtendimentoReportsOverviewResponse,
  FilaAtendimentoReportsResultItem,
  FilaAtendimentoReportsRecentServicesResponse,
  FilaAtendimentoReportsRecentServiceItem,
  FilaAtendimentoReportsResultsResponse,
  FilaAtendimentoReportsStoreComparison
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

  return totals.weight > 0 ? totals.value / totals.weight : 0
}

function aggregateConsultants(groups: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  rows?: FilaAtendimentoReportsConsultantAggRow[]
}>) {
  const aggregate = new Map<string, FilaAtendimentoReportsConsultantAggRow>()

  for (const group of groups) {
    for (const item of Array.isArray(group.rows) ? group.rows : []) {
      const consultantId = normalizeText(item?.consultantId)
      const consultantName = normalizeText(item?.consultantName)
      const key = consultantId || `${consultantName.toLocaleLowerCase('pt-BR')}::${group.storeId}`
      if (!key) {
        continue
      }

      const current = aggregate.get(key) || {
        consultantId,
        consultantName,
        storeId: group.storeId,
        storeName: group.storeName,
        storeCode: group.storeCode,
        attendances: 0,
        conversions: 0,
        saleAmount: 0
      }

      current.consultantId = current.consultantId || consultantId
      current.consultantName = current.consultantName || consultantName
      current.storeId = current.storeId || group.storeId
      current.storeName = current.storeName || group.storeName
      current.storeCode = current.storeCode || group.storeCode
      current.attendances = normalizeNumber(current.attendances) + normalizeNumber(item?.attendances)
      current.conversions = normalizeNumber(current.conversions) + normalizeNumber(item?.conversions)
      current.saleAmount = normalizeNumber(current.saleAmount) + normalizeNumber(item?.saleAmount)
      aggregate.set(key, current)
    }
  }

  return [...aggregate.values()].sort((left, right) => {
    const saleDiff = normalizeNumber(right.saleAmount) - normalizeNumber(left.saleAmount)
    if (saleDiff !== 0) {
      return saleDiff
    }

    return normalizeNumber(right.attendances) - normalizeNumber(left.attendances)
  })
}

function mergeResultsRows(groups: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  rows?: FilaAtendimentoReportsResultItem[]
}>) {
  const aggregate = new Map<string, FilaAtendimentoReportsResultItem>()

  for (const group of groups) {
    for (const item of Array.isArray(group.rows) ? group.rows : []) {
      const key = normalizeText(item?.serviceId) || `${normalizeText(item?.personId)}-${normalizeNumber(item?.finishedAt)}`
      if (!key) {
        continue
      }

      aggregate.set(key, {
        ...item,
        storeId: normalizeText(item?.storeId) || group.storeId,
        storeName: normalizeText(item?.storeName) || group.storeName,
        storeCode: normalizeText(item?.storeCode) || group.storeCode
      })
    }
  }

  return [...aggregate.values()]
    .sort((left, right) => normalizeNumber(right.finishedAt) - normalizeNumber(left.finishedAt))
    .slice(0, 200)
}

function mergeRecentServices(groups: Array<{
  storeId: string
  storeName?: string
  storeCode?: string
  items?: FilaAtendimentoReportsRecentServiceItem[]
}>) {
  const aggregate = new Map<string, FilaAtendimentoReportsRecentServiceItem>()

  for (const group of groups) {
    for (const item of Array.isArray(group.items) ? group.items : []) {
      const key = normalizeText(item?.serviceId) || `${normalizeText(item?.consultantName)}-${normalizeNumber(item?.finishedAt)}`
      if (!key) {
        continue
      }

      aggregate.set(key, {
        ...item,
        storeId: normalizeText(item?.storeId) || group.storeId,
        storeName: normalizeText(item?.storeName) || group.storeName,
        storeCode: normalizeText(item?.storeCode) || group.storeCode
      })
    }
  }

  return [...aggregate.values()]
    .sort((left, right) => normalizeNumber(right.finishedAt) - normalizeNumber(left.finishedAt))
    .slice(0, 40)
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

function createDefaultFilters(): FilaAtendimentoReportFilters {
  return {
    dateFrom: '',
    dateTo: '',
    storeId: ''
  }
}

export const useFilaAtendimentoReportsStore = defineStore('fila-atendimento-reports', () => {
  const { bffFetch } = useBffFetch()
  const operationsStore = useFilaAtendimentoOperationsStore()

  const filters = ref<FilaAtendimentoReportFilters>(createDefaultFilters())
  const overview = ref<FilaAtendimentoReportsOverviewResponse | null>(null)
  const results = ref<FilaAtendimentoReportsResultsResponse | null>(null)
  const recentServices = ref<FilaAtendimentoReportsRecentServicesResponse | null>(null)
  const pending = ref(false)
  const ready = ref(false)
  const errorMessage = ref('')
  const lastLoadedKey = ref('')

  const activeStoreName = computed(() => {
    const activeStoreId = normalizeText(operationsStore.state.activeStoreId)
    return operationsStore.stores.find((store) => normalizeText(store.id) === activeStoreId)?.name || ''
  })

  function clearState() {
    overview.value = null
    results.value = null
    recentServices.value = null
    ready.value = false
    errorMessage.value = ''
    lastLoadedKey.value = ''
  }

  function buildRequestParamsForStore(storeId: string) {
    const params = new URLSearchParams()
    params.set('storeId', normalizeText(storeId))
    params.set('page', '1')
    params.set('pageSize', '200')

    if (filters.value.dateFrom) {
      params.set('dateFrom', filters.value.dateFrom)
    }

    if (filters.value.dateTo) {
      params.set('dateTo', filters.value.dateTo)
    }

    return params.toString()
  }

  function resolveStoreIds(storeIds: string[] = []) {
    const normalizedStoreIds = normalizeStoreIds(storeIds)
    if (normalizedStoreIds.length > 0) {
      return normalizedStoreIds
    }

    const activeStoreId = normalizeText(operationsStore.state.activeStoreId)
    return activeStoreId ? [activeStoreId] : []
  }

  function resolveRequestedStoreIds(storeIds: string[] = []) {
    const normalizedStoreIds = resolveStoreIds(storeIds)
    const filteredStoreId = normalizeText(filters.value.storeId)

    if (!filteredStoreId) {
      return normalizedStoreIds
    }

    return normalizedStoreIds.includes(filteredStoreId) ? [filteredStoreId] : normalizedStoreIds
  }

  function buildStoreComparison(rows: Array<{
    storeId: string
    storeName?: string
    storeCode?: string
    overview?: FilaAtendimentoReportsOverviewResponse
  }>): FilaAtendimentoReportsStoreComparison[] {
    return rows
      .map((row) => ({
        storeId: row.storeId,
        storeName: row.storeName,
        storeCode: row.storeCode,
        totalAttendances: normalizeNumber(row.overview?.metrics?.totalAttendances),
        conversions: normalizeNumber(row.overview?.metrics?.conversions),
        conversionRate: normalizeNumber(row.overview?.metrics?.conversionRate),
        soldValue: normalizeNumber(row.overview?.metrics?.soldValue),
        averageTicket: normalizeNumber(row.overview?.metrics?.averageTicket),
        averageDurationMs: normalizeNumber(row.overview?.metrics?.averageDurationMs),
        averageQueueWaitMs: normalizeNumber(row.overview?.metrics?.averageQueueWaitMs),
        queueJumpRate: normalizeNumber(row.overview?.metrics?.queueJumpRate),
        campaignBonusTotal: normalizeNumber(row.overview?.metrics?.campaignBonusTotal)
      }))
      .sort((left, right) => {
        const soldDiff = normalizeNumber(right.soldValue) - normalizeNumber(left.soldValue)
        if (soldDiff !== 0) {
          return soldDiff
        }

        return normalizeNumber(right.totalAttendances) - normalizeNumber(left.totalAttendances)
      })
  }

  function buildRefreshKey(storeIds: string[] = []) {
    const normalizedStoreIds = resolveRequestedStoreIds(storeIds)
    return JSON.stringify({
      storeIds: normalizedStoreIds,
      filters: filters.value
    })
  }

  async function refreshReports(options: { storeIds?: string[] } = {}) {
    const storeIds = resolveRequestedStoreIds(options.storeIds)
    if (!storeIds.length || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''

    try {
      if (storeIds.length === 1) {
        const params = buildRequestParamsForStore(storeIds[0])
        const [overviewResponse, resultsResponse, recentServicesResponse] = await Promise.all([
          bffFetch<FilaAtendimentoReportsOverviewResponse>(`/api/admin/modules/fila-atendimento/reports-overview?${params}`),
          bffFetch<FilaAtendimentoReportsResultsResponse>(`/api/admin/modules/fila-atendimento/reports-results?${params}`),
          bffFetch<FilaAtendimentoReportsRecentServicesResponse>(`/api/admin/modules/fila-atendimento/reports-recent-services?${params}`)
        ])

        overview.value = overviewResponse
        results.value = resultsResponse
        recentServices.value = recentServicesResponse
      } else {
        const responses = await Promise.all(
          storeIds.map(async (storeId) => {
            const descriptor = operationsStore.stores.find((store) => normalizeText(store.id) === storeId)
            const params = buildRequestParamsForStore(storeId)
            const [overviewResponse, resultsResponse, recentServicesResponse] = await Promise.all([
              bffFetch<FilaAtendimentoReportsOverviewResponse>(`/api/admin/modules/fila-atendimento/reports-overview?${params}`),
              bffFetch<FilaAtendimentoReportsResultsResponse>(`/api/admin/modules/fila-atendimento/reports-results?${params}`),
              bffFetch<FilaAtendimentoReportsRecentServicesResponse>(`/api/admin/modules/fila-atendimento/reports-recent-services?${params}`)
            ])

            return {
              storeId,
              storeName: normalizeText(descriptor?.name),
              storeCode: normalizeText(descriptor?.code),
              overview: overviewResponse,
              results: resultsResponse,
              recentServices: recentServicesResponse
            }
          })
        )

        const totalAttendances = responses.reduce((total, item) => total + normalizeNumber(item.overview?.metrics?.totalAttendances), 0)
        const conversions = responses.reduce((total, item) => total + normalizeNumber(item.overview?.metrics?.conversions), 0)
        const soldValue = responses.reduce((total, item) => total + normalizeNumber(item.overview?.metrics?.soldValue), 0)

        overview.value = {
          metrics: {
            totalAttendances,
            conversions,
            conversionRate: totalAttendances > 0 ? (conversions / totalAttendances) * 100 : 0,
            soldValue,
            averageTicket: conversions > 0 ? soldValue / conversions : 0,
            averageDurationMs: weightedAverage(responses.map((item) => ({ value: item.overview?.metrics?.averageDurationMs, weight: item.overview?.metrics?.totalAttendances }))),
            averageQueueWaitMs: weightedAverage(responses.map((item) => ({ value: item.overview?.metrics?.averageQueueWaitMs, weight: item.overview?.metrics?.totalAttendances }))),
            queueJumpRate: weightedAverage(responses.map((item) => ({ value: item.overview?.metrics?.queueJumpRate, weight: item.overview?.metrics?.totalAttendances }))),
            campaignBonusTotal: responses.reduce((total, item) => total + normalizeNumber(item.overview?.metrics?.campaignBonusTotal), 0)
          },
          chartData: {
            consultantAgg: aggregateConsultants(responses.map(item => ({
              storeId: item.storeId,
              storeName: item.storeName,
              storeCode: item.storeCode,
              rows: item.overview?.chartData?.consultantAgg
            })))
          },
          storeComparisons: buildStoreComparison(responses)
        }

        results.value = {
          total: responses.reduce((total, item) => total + normalizeNumber(item.results?.total || item.results?.rows?.length), 0),
          rows: mergeResultsRows(responses.map(item => ({
            storeId: item.storeId,
            storeName: item.storeName,
            storeCode: item.storeCode,
            rows: item.results?.rows
          })))
        }

        recentServices.value = {
          total: responses.reduce((total, item) => total + normalizeNumber(item.recentServices?.total || item.recentServices?.items?.length), 0),
          items: mergeRecentServices(responses.map(item => ({
            storeId: item.storeId,
            storeName: item.storeName,
            storeCode: item.storeCode,
            items: item.recentServices?.items
          })))
        }
      }

      ready.value = true
      lastLoadedKey.value = buildRefreshKey(storeIds)
      return { overview: overview.value, results: results.value, recentServices: recentServices.value }
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os relatorios.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function ensureLoaded(options: { storeIds?: string[] } = {}) {
    const storeIds = resolveRequestedStoreIds(options.storeIds)
    if (!storeIds.length || !operationsStore.sessionReady) {
      clearState()
      return false
    }

    if (ready.value && lastLoadedKey.value === buildRefreshKey(storeIds)) {
      return true
    }

    try {
      await refreshReports({ storeIds })
      return true
    } catch {
      return false
    }
  }

  function updateFilter(filterId: keyof FilaAtendimentoReportFilters, value: string) {
    filters.value = {
      ...filters.value,
      [filterId]: value
    }
  }

  function resetFilters() {
    filters.value = createDefaultFilters()
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
    filters,
    overview,
    results,
    recentServices,
    pending,
    ready,
    errorMessage,
    activeStoreName,
    clearState,
    refreshReports,
    ensureLoaded,
    updateFilter,
    resetFilters
  }
})