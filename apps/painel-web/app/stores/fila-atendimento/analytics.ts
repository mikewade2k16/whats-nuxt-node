import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoAnalyticsDataResponse,
  FilaAtendimentoAnalyticsIntelligenceResponse,
  FilaAtendimentoAnalyticsRankingResponse
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

  function buildStoreQuery() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    return storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
  }

  async function fetchRanking() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    if (!storeId || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      ranking.value = await bffFetch<FilaAtendimentoAnalyticsRankingResponse>(`/api/admin/modules/fila-atendimento/analytics-ranking${buildStoreQuery()}`)
      return ranking.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar o ranking.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function fetchData() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    if (!storeId || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      data.value = await bffFetch<FilaAtendimentoAnalyticsDataResponse>(`/api/admin/modules/fila-atendimento/analytics-data${buildStoreQuery()}`)
      return data.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os dados operacionais.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function fetchIntelligence() {
    const storeId = normalizeText(operationsStore.state.activeStoreId)
    if (!storeId || !operationsStore.sessionReady) {
      clearState()
      return null
    }

    pending.value = true
    errorMessage.value = ''
    try {
      intelligence.value = await bffFetch<FilaAtendimentoAnalyticsIntelligenceResponse>(`/api/admin/modules/fila-atendimento/analytics-intelligence${buildStoreQuery()}`)
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