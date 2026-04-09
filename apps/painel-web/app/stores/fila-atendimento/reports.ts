import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoReportFilters,
  FilaAtendimentoReportsOverviewResponse,
  FilaAtendimentoReportsRecentServicesResponse,
  FilaAtendimentoReportsResultsResponse
} from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
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
    search: ''
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

  function buildRequestParams() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    const params = new URLSearchParams()
    params.set('storeId', storeId)
    params.set('page', '1')
    params.set('pageSize', '200')

    if (filters.value.dateFrom) {
      params.set('dateFrom', filters.value.dateFrom)
    }

    if (filters.value.dateTo) {
      params.set('dateTo', filters.value.dateTo)
    }

    if (filters.value.search) {
      params.set('search', filters.value.search)
    }

    return params.toString()
  }

  function buildRefreshKey() {
    return JSON.stringify({
      storeId: operationsStore.state.activeStoreId,
      filters: filters.value
    })
  }

  async function refreshReports() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    if (!storeId || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    const params = buildRequestParams()

    try {
      const [overviewResponse, resultsResponse, recentServicesResponse] = await Promise.all([
        bffFetch<FilaAtendimentoReportsOverviewResponse>(`/api/admin/modules/fila-atendimento/reports-overview?${params}`),
        bffFetch<FilaAtendimentoReportsResultsResponse>(`/api/admin/modules/fila-atendimento/reports-results?${params}`),
        bffFetch<FilaAtendimentoReportsRecentServicesResponse>(`/api/admin/modules/fila-atendimento/reports-recent-services?${params}`)
      ])

      overview.value = overviewResponse
      results.value = resultsResponse
      recentServices.value = recentServicesResponse
      ready.value = true
      lastLoadedKey.value = buildRefreshKey()
      return { overview: overviewResponse, results: resultsResponse, recentServices: recentServicesResponse }
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os relatorios.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function ensureLoaded() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    if (!storeId || !operationsStore.sessionReady) {
      clearState()
      return false
    }

    if (ready.value && lastLoadedKey.value === buildRefreshKey()) {
      return true
    }

    try {
      await refreshReports()
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