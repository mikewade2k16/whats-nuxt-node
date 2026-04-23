import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoMetricEventInput,
  FilaAtendimentoMetricsResponse,
  FilaAtendimentoMetricSummary
} from '~/types/fila-atendimento'

function createEmptySummary(): FilaAtendimentoMetricSummary {
  return {
    totalEvents: 0,
    okEvents: 0,
    errorEvents: 0,
    avgDurationMs: 0,
    maxDurationMs: 0,
    slowEvents: 0,
    aggregates: [],
    actionCoverage: [],
    securityChecklist: [],
    developmentSignals: []
  }
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const useFilaAtendimentoMetricsStore = defineStore('fila-atendimento-metrics', () => {
  const { bffFetch } = useBffFetch()
  const response = ref<FilaAtendimentoMetricsResponse>({
    items: [],
    summary: createEmptySummary()
  })
  const pending = ref(false)
  const recordPending = ref(false)
  const errorMessage = ref('')

  const items = computed(() => response.value.items || [])
  const summary = computed(() => response.value.summary || createEmptySummary())
  const measuredActionCount = computed(() => (summary.value.actionCoverage || []).filter(item => item.measured).length)
  const totalActionCount = computed(() => (summary.value.actionCoverage || []).length)
  const coveragePercent = computed(() => {
    if (!totalActionCount.value) {
      return 0
    }
    return Math.round((measuredActionCount.value / totalActionCount.value) * 100)
  })
  const averageDurationMs = computed(() => Math.round(normalizeNumber(summary.value.avgDurationMs)))

  async function fetchEvents(filters: { pageKey?: string; storeId?: string; limit?: number } = {}) {
    pending.value = true
    errorMessage.value = ''

    try {
      const params = new URLSearchParams()
      params.set('pageKey', filters.pageKey || 'fila-atendimento.operacao')
      params.set('limit', String(filters.limit || 200))
      if (filters.storeId) {
        params.set('storeId', filters.storeId)
      }

      response.value = await bffFetch<FilaAtendimentoMetricsResponse>(
        `/api/admin/modules/fila-atendimento/metrics-events?${params.toString()}`
      )
      return response.value
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar as métricas.'
      throw error
    } finally {
      pending.value = false
    }
  }

  async function recordEvent(event: FilaAtendimentoMetricEventInput) {
    recordPending.value = true

    try {
      await bffFetch('/api/admin/modules/fila-atendimento/metrics-events', {
        method: 'POST',
        body: event
      })
    } finally {
      recordPending.value = false
    }
  }

  return {
    response,
    items,
    summary,
    pending,
    recordPending,
    errorMessage,
    measuredActionCount,
    totalActionCount,
    coveragePercent,
    averageDurationMs,
    fetchEvents,
    recordEvent
  }
})
