import type { IndicatorEvaluationDraftPayload, IndicatorExportRequest } from '~/types/indicators'
import type { IndicatorsProfileIndicatorConfig } from '~/types/indicators-management'
import {
  buildDashboardModel,
  buildIndicatorOptions,
  buildIndicatorSections,
  buildModuleSummary,
  buildUnitOptions,
  cloneIndicators,
  getCurrentIndicatorsMonthRange,
  getIndicatorsPresetRange,
  INDICATORS_RANGE_PRESETS,
  mapActiveProfileState,
  mapEvaluationRecord,
  type ApiDashboardResponse,
  type ApiEvaluationDetail,
  useIndicatorsApi
} from '~/composables/useIndicatorsData'

export function useIndicatorsWorkspaceLive() {
  const api = useIndicatorsApi()
  const sessionSimulation = useSessionSimulationStore()
  const { coreToken, coreUser } = useAdminSession()
  const ui = useUiStore()
  const realtime = useTenantRealtime()
  realtime.start()

  const currentMonthRange = getCurrentIndicatorsMonthRange()
  const loading = ref(false)
  const errorMessage = ref('')
  const baseSummary = ref(buildModuleSummary())
  const clientLabel = ref('Cliente nao selecionado')
  const configuredIndicators = ref<IndicatorsProfileIndicatorConfig[]>([])
  const configuredStores = ref([] as ReturnType<typeof mapActiveProfileState>['stores'])
  const dashboardPayload = ref<ApiDashboardResponse | null>(null)
  const draftStart = ref(currentMonthRange.start)
  const draftEnd = ref(currentMonthRange.end)
  const appliedStart = ref(currentMonthRange.start)
  const appliedEnd = ref(currentMonthRange.end)
  const evaluationsOpen = ref(false)
  const evaluationModalOpen = ref(false)
  const evaluations = ref([] as ReturnType<typeof mapEvaluationRecord>[]) 
  const evaluationDetails = ref<ApiEvaluationDetail[]>([])

  function extractFileNameFromContentDisposition(value: string | null) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''

    const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match && utf8Match[1]) {
      try {
        return decodeURIComponent(utf8Match[1].trim())
      } catch {
        return utf8Match[1].trim()
      }
    }

    const simpleMatch = raw.match(/filename="([^"]+)"/i) || raw.match(/filename=([^;]+)/i)
    if (!simpleMatch || !simpleMatch[1]) return ''
    return simpleMatch[1].trim()
  }

  function buildExportErrorMessage(raw: string, fallback: string) {
    const normalized = String(raw ?? '').trim()
    if (!normalized) return fallback

    try {
      const parsed = JSON.parse(normalized) as {
        statusMessage?: unknown
        message?: unknown
        data?: { message?: unknown }
      }

      const candidates = [
        typeof parsed.statusMessage === 'string' ? parsed.statusMessage : '',
        typeof parsed.message === 'string' ? parsed.message : '',
        typeof parsed.data?.message === 'string' ? parsed.data.message : ''
      ].map(item => item.trim()).filter(Boolean)

      return candidates[0] || fallback
    } catch {
      return normalized || fallback
    }
  }

  function triggerDownload(blob: Blob, fileName: string) {
    if (!import.meta.client) return

    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  }

  function formatDateLabel(value: string) {
    const raw = String(value ?? '').trim()
    if (!raw) return '--'

    const parsed = new Date(`${raw}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      return raw
    }

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(parsed)
  }

  const summary = computed(() => {
    if (dashboardPayload.value?.summary) {
      return buildModuleSummary(dashboardPayload.value.summary)
    }

    return baseSummary.value
  })

  const actorName = computed(() => {
    const preferred = String(coreUser.value?.name || coreUser.value?.nick || '').trim()
    if (preferred) return preferred

    const email = String(coreUser.value?.email || '').trim()
    if (email.includes('@')) {
      return email.split('@')[0] || 'Nao identificado'
    }

    return email || 'Nao identificado'
  })

  const appliedRangeLabel = computed(() => {
    return `Exibindo dados de: ${formatDateLabel(appliedStart.value)} ate ${formatDateLabel(appliedEnd.value)}`
  })

  const totalEvaluationCount = computed(() => evaluations.value.length)
  const hasResults = computed(() => evaluations.value.length > 0 || configuredIndicators.value.some(indicator => indicator.enabled))
  const dashboard = computed(() => buildDashboardModel(dashboardPayload.value, summary.value.clientLabel, configuredIndicators.value))
  const indicatorSections = computed(() => {
    return buildIndicatorSections(configuredIndicators.value, configuredStores.value, dashboardPayload.value, evaluationDetails.value)
  })
  const rangePresets = computed(() => INDICATORS_RANGE_PRESETS)
  const unitOptions = computed(() => buildUnitOptions(configuredStores.value))
  const indicatorOptions = computed(() => buildIndicatorOptions(configuredIndicators.value))

  function toggleEvaluations() {
    evaluationsOpen.value = !evaluationsOpen.value
  }

  function openEvaluationForm() {
    if (unitOptions.value.length === 0) {
      ui.info('Nenhuma loja configurada para registrar avaliacao neste cliente.', 'Indicadores')
      return
    }

    evaluationModalOpen.value = true
  }

  function closeEvaluationForm() {
    evaluationModalOpen.value = false
  }

  async function loadEvaluationDetails(ids: string[]) {
    if (ids.length === 0) {
      evaluationDetails.value = []
      return
    }

    const detailResponses = await Promise.allSettled(ids.map(id => api.getEvaluation(id)))
    evaluationDetails.value = detailResponses
      .filter((result): result is PromiseFulfilledResult<ApiEvaluationDetail> => result.status === 'fulfilled')
      .map(result => result.value)
  }

  async function loadWorkspace(silent = false) {
    loading.value = true
    if (!silent) {
      errorMessage.value = ''
    }

    try {
      const profile = await api.getActiveProfile()
      const [dashboardResult, evaluationsResult] = await Promise.allSettled([
        api.getDashboard(appliedStart.value, appliedEnd.value),
        api.listEvaluations(appliedStart.value, appliedEnd.value)
      ])

      dashboardPayload.value = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null

      const state = mapActiveProfileState(profile, dashboardPayload.value)
      baseSummary.value = state.summary
      clientLabel.value = state.clientLabel
      configuredIndicators.value = cloneIndicators(state.indicators)
      configuredStores.value = cloneIndicators(state.stores)

      if (evaluationsResult.status === 'fulfilled') {
        evaluations.value = evaluationsResult.value.map(mapEvaluationRecord)
        await loadEvaluationDetails(evaluationsResult.value.map(item => item.id))
      } else {
        evaluations.value = []
        evaluationDetails.value = []
      }

      const failedParts = [
        dashboardResult.status === 'rejected' ? 'dashboard' : '',
        evaluationsResult.status === 'rejected' ? 'avaliacoes' : ''
      ].filter(Boolean)

      if (failedParts.length > 0) {
        errorMessage.value = `Falha ao carregar ${failedParts.join(' e ')} do modulo.`
        if (!silent) {
          ui.error(errorMessage.value, 'Indicadores')
        }
      } else {
        errorMessage.value = ''
      }
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao carregar o workspace de indicadores.'
      dashboardPayload.value = null
      evaluations.value = []
      evaluationDetails.value = []
      if (!silent) {
        ui.error(errorMessage.value, 'Indicadores')
      }
    } finally {
      loading.value = false
    }
  }

  function applyFilters() {
    if (!draftStart.value || !draftEnd.value) {
      ui.error('Informe a data inicial e final para aplicar o filtro.', 'Indicadores')
      return
    }

    if (draftEnd.value < draftStart.value) {
      ui.error('A data final nao pode ser menor do que a data inicial.', 'Indicadores')
      return
    }

    appliedStart.value = draftStart.value
    appliedEnd.value = draftEnd.value
    void loadWorkspace(false)
  }

  function applyPreset(presetId: string) {
    const range = getIndicatorsPresetRange(presetId)
    draftStart.value = range.start
    draftEnd.value = range.end
    applyFilters()
  }

  async function deleteEvaluation(evaluationId: string | number) {
    const evaluationKey = String(evaluationId)
    const target = evaluations.value.find(entry => String(entry.id) === evaluationKey)
    if (!target) return

    const confirmation = await ui.confirm({
      title: 'Excluir avaliacao',
      message: `Remover a avaliacao de ${target.unitName} feita por ${target.evaluatorName}?`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar'
    })

    if (!confirmation.confirmed) return

    try {
      await api.deleteEvaluation(evaluationKey)
      await loadWorkspace(true)
      ui.success('Avaliacao removida do backend core.', 'Indicadores')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha ao excluir avaliacao.'
      ui.error(message, 'Indicadores')
    }
  }

  async function exportEvaluations(request: IndicatorExportRequest) {
    const unitId = String(request.unitId ?? 'all').trim()
    const visibleEvaluations = unitId && unitId !== 'all'
      ? evaluations.value.filter(item => item.unitId === unitId)
      : evaluations.value

    if (visibleEvaluations.length === 0) {
      ui.info('Nao ha avaliacoes visiveis para exportar neste recorte.', 'Exportacao')
      return
    }

    if (!import.meta.client) {
      return
    }

    const query = new URLSearchParams({
      format: request.format,
      startDate: appliedStart.value,
      endDate: appliedEnd.value
    })

    if (unitId && unitId !== 'all') {
      query.set('unitId', unitId)
    }

    try {
      const response = await fetch(`/api/admin/indicators/export?${query.toString()}`, {
        method: 'GET',
        headers: {
          ...sessionSimulation.requestHeaders,
          ...(coreToken.value ? { 'x-core-token': coreToken.value } : {})
        }
      })

      if (!response.ok) {
        const rawError = await response.text().catch(() => '')
        ui.error(
          buildExportErrorMessage(rawError, `Falha ao gerar exportacao ${request.format.toUpperCase()}.`),
          'Exportacao'
        )
        return
      }

      const blob = await response.blob()
      if (!blob || blob.size <= 0) {
        ui.error('O BFF retornou um arquivo vazio para esta exportacao.', 'Exportacao')
        return
      }

      const fileName = extractFileNameFromContentDisposition(response.headers.get('content-disposition'))
        || `indicadores-${request.format}`

      triggerDownload(blob, fileName)
      ui.success(`Exportacao ${request.format.toUpperCase()} gerada com dados reais do backend.`, 'Exportacao')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha ao baixar a exportacao.'
      ui.error(message, 'Exportacao')
    }
  }

  async function createEvaluation(payload: IndicatorEvaluationDraftPayload) {
    const unit = unitOptions.value.find(option => option.id === payload.unitId)

    try {
      await api.createEvaluation({
        evaluatorName: payload.evaluatorName,
        unitExternalId: payload.unitId,
        unitName: unit?.label || payload.unitName,
        scopeMode: 'per_store',
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        indicatorCodes: [...payload.indicatorCodes]
      })

      evaluationModalOpen.value = false
      evaluationsOpen.value = true
      await loadWorkspace(true)
      ui.success(`Avaliacao de ${payload.unitName} registrada no backend core.`, 'Indicadores')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha ao criar avaliacao.'
      ui.error(message, 'Indicadores')
    }
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      const range = getCurrentIndicatorsMonthRange()
      draftStart.value = range.start
      draftEnd.value = range.end
      appliedStart.value = range.start
      appliedEnd.value = range.end
      evaluationModalOpen.value = false
      void loadWorkspace(true)
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('indicators', () => {
    void loadWorkspace(true)
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  void loadWorkspace(true)

  return {
    loading,
    errorMessage,
    summary,
    actorName,
    clientLabel,
    draftStart,
    draftEnd,
    appliedStart,
    appliedEnd,
    appliedRangeLabel,
    evaluationsOpen,
    evaluationModalOpen,
    evaluations,
    totalEvaluationCount,
    hasResults,
    dashboard,
    indicatorSections,
    rangePresets,
    unitOptions,
    indicatorOptions,
    toggleEvaluations,
    applyFilters,
    applyPreset,
    openEvaluationForm,
    closeEvaluationForm,
    deleteEvaluation,
    exportEvaluations,
    createEvaluation
  }
}