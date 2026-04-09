import type {
  TrainingClientOption,
  SubmitTrainingEvaluationPayload,
  SubmitTrainingEvaluationResponse,
  TrainingCatalogResponse,
  TrainingSection
} from '~/types/training'

export function useTrainingManager() {
  const sessionSimulation = useSessionSimulationStore()
  const { bffFetch } = useBffFetch()
  const realtime = useTenantRealtime()
  realtime.start()

  const sections = ref<TrainingSection[]>([])
  const storeOptions = ref<string[]>([])
  const clientOptions = ref<TrainingClientOption[]>([])
  const selectedClientId = ref<number | null>(null)

  const loading = ref(false)
  const submitting = ref(false)
  const errorMessage = ref('')
  const submitErrorMessage = ref('')
  const submitSuccessMessage = ref('')

  async function fetchCatalog() {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<TrainingCatalogResponse>('/api/admin/training', {
        query: sessionSimulation.isAdmin && selectedClientId.value && selectedClientId.value > 0
          ? { clientId: selectedClientId.value }
          : undefined
      })

      sections.value = Array.isArray(response.data?.sections) ? response.data.sections : []
      storeOptions.value = Array.isArray(response.data?.storeOptions) ? response.data.storeOptions : []
      clientOptions.value = Array.isArray(response.data?.clientOptions) ? response.data.clientOptions : []
    } catch {
      errorMessage.value = 'Falha ao carregar treinamentos.'
    } finally {
      loading.value = false
    }
  }

  function setSelectedClientId(value: unknown) {
    const raw = Number.parseInt(String(value ?? '').trim(), 10)
    if (!Number.isFinite(raw) || raw <= 0) {
      selectedClientId.value = null
    } else {
      selectedClientId.value = raw
    }
    void fetchCatalog()
  }

  async function submitEvaluation(payload: SubmitTrainingEvaluationPayload) {
    submitting.value = true
    submitErrorMessage.value = ''
    submitSuccessMessage.value = ''

    try {
      const response = await bffFetch<SubmitTrainingEvaluationResponse>('/api/admin/training/evaluations', {
        method: 'POST',
        body: payload
      })

      submitSuccessMessage.value = `Avaliacao enviada com sucesso. Protocolo #${response.data.id}.`
      return response.data
    } catch {
      submitErrorMessage.value = 'Nao foi possivel enviar a avaliacao. Tente novamente.'
      return null
    } finally {
      submitting.value = false
    }
  }

  function clearSubmitFeedback() {
    submitErrorMessage.value = ''
    submitSuccessMessage.value = ''
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      if (!sessionSimulation.isAdmin) {
        selectedClientId.value = null
      }
      void fetchCatalog()
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('training', () => {
    void fetchCatalog()
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  return {
    sections,
    storeOptions,
    clientOptions,
    selectedClientId,
    loading,
    submitting,
    errorMessage,
    submitErrorMessage,
    submitSuccessMessage,
    fetchCatalog,
    setSelectedClientId,
    submitEvaluation,
    clearSubmitFeedback
  }
}
