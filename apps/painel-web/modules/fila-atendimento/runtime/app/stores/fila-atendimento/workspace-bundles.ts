import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoConsultantsResponse,
  FilaAtendimentoOperationState,
  FilaAtendimentoReportsResultItem,
  FilaAtendimentoReportsResultsResponse,
  FilaAtendimentoSettingsResponse,
  FilaAtendimentoSnapshotResponse,
  FilaAtendimentoWorkspaceBundle
} from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeStoreIds(storeIds: string[]) {
  return [...new Set(
    (Array.isArray(storeIds) ? storeIds : [])
      .map(storeId => normalizeText(storeId))
      .filter(Boolean)
  )]
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

function createEmptyState(activeStoreId = ''): FilaAtendimentoOperationState {
  return {
    activeStoreId,
    roster: [],
    waitingList: [],
    activeServices: [],
    pausedEmployees: [],
    consultantCurrentStatus: {},
    serviceHistory: [],
    operationTemplates: [],
    selectedOperationTemplateId: '',
    settings: {
      maxConcurrentServices: 10,
      timingFastCloseMinutes: 15,
      timingLongServiceMinutes: 45,
      timingLowSaleAmount: 0,
      testModeEnabled: false,
      autoFillFinishModal: false,
      alertMinConversionRate: 0,
      alertMaxQueueJumpRate: 0,
      alertMinPaScore: 0,
      alertMinTicketAverage: 0
    },
    modalConfig: {
      title: 'Fechar atendimento',
      productSeenLabel: 'Produto visto pelo cliente',
      productSeenPlaceholder: 'Busque e selecione um produto',
      productClosedLabel: 'Produto reservado/comprado',
      productClosedPlaceholder: 'Busque e selecione o produto fechado',
      notesLabel: 'Observacoes',
      notesPlaceholder: 'Detalhes adicionais do atendimento',
      queueJumpReasonLabel: 'Motivo do atendimento fora da vez',
      queueJumpReasonPlaceholder: 'Busque e selecione o motivo fora da vez',
      lossReasonLabel: 'Motivo da perda',
      lossReasonPlaceholder: 'Busque e selecione o motivo da perda',
      customerSectionLabel: 'Dados do cliente',
      showEmailField: true,
      showProfessionField: true,
      showNotesField: true,
      visitReasonSelectionMode: 'multiple',
      visitReasonDetailMode: 'shared',
      lossReasonSelectionMode: 'single',
      lossReasonDetailMode: 'off',
      customerSourceSelectionMode: 'single',
      customerSourceDetailMode: 'shared',
      requireProduct: true,
      requireVisitReason: true,
      requireCustomerSource: true,
      requireCustomerNamePhone: true
    },
    visitReasonOptions: [],
    customerSourceOptions: [],
    queueJumpReasonOptions: [],
    lossReasonOptions: [],
    professionOptions: [],
    productCatalog: [],
    campaigns: [],
    finishModalPersonId: ''
  }
}

export const useFilaAtendimentoWorkspaceBundlesStore = defineStore('fila-atendimento-workspace-bundles', () => {
  const { bffFetch } = useBffFetch()
  const operationsStore = useFilaAtendimentoOperationsStore()

  const bundles = ref<FilaAtendimentoWorkspaceBundle[]>([])
  const pending = ref(false)
  const ready = ref(false)
  const errorMessage = ref('')
  const lastLoadedKey = ref('')

  const storeOptions = computed(() => bundles.value.map((bundle) => ({
    value: bundle.storeId,
    label: bundle.storeName || bundle.storeCode || bundle.storeId
  })))

  const aggregatedTeamState = computed<FilaAtendimentoOperationState>(() => {
    const baseState = createEmptyState(operationsStore.state.activeStoreId)

    return {
      ...baseState,
      roster: bundles.value.flatMap(bundle =>
        (bundle.consultants || []).map((consultant) => ({
          ...consultant,
          storeId: normalizeText(consultant.storeId) || bundle.storeId,
          storeName: normalizeText(consultant.storeName) || bundle.storeName,
          storeCode: normalizeText(consultant.storeCode) || bundle.storeCode
        }))
      ),
      waitingList: bundles.value.flatMap(bundle =>
        (bundle.snapshot?.waitingList || []).map((entry) => ({
          ...entry,
          storeId: normalizeText(entry.storeId) || bundle.storeId,
          storeName: normalizeText(entry.storeName) || bundle.storeName,
          storeCode: normalizeText(entry.storeCode) || bundle.storeCode
        }))
      ),
      activeServices: bundles.value.flatMap(bundle =>
        (bundle.snapshot?.activeServices || []).map((entry) => ({
          ...entry,
          storeId: normalizeText(entry.storeId) || bundle.storeId,
          storeName: normalizeText(entry.storeName) || bundle.storeName,
          storeCode: normalizeText(entry.storeCode) || bundle.storeCode
        }))
      ),
      pausedEmployees: bundles.value.flatMap(bundle =>
        (bundle.snapshot?.pausedEmployees || []).map((entry) => ({
          ...entry,
          storeId: normalizeText(entry.storeId) || bundle.storeId,
          storeName: normalizeText(entry.storeName) || bundle.storeName,
          storeCode: normalizeText(entry.storeCode) || bundle.storeCode
        }))
      ),
      consultantCurrentStatus: bundles.value.reduce<Record<string, { status: string; startedAt: number }>>((accumulator, bundle) => ({
        ...accumulator,
        ...(bundle.snapshot?.consultantCurrentStatus || {})
      }), {}),
      serviceHistory: bundles.value
        .flatMap(bundle =>
          (bundle.reportResults || []).map((entry) => ({
            ...entry,
            personId: normalizeText(entry.personId) || normalizeText(entry.consultantId),
            storeId: normalizeText(entry.storeId) || bundle.storeId,
            storeName: normalizeText(entry.storeName) || bundle.storeName
          }))
        )
        .sort((left, right) => Number(right.finishedAt || 0) - Number(left.finishedAt || 0))
    }
  })

  function buildLoadKey(storeIds: string[], options: { includeSettings?: boolean } = {}) {
    return JSON.stringify({
      storeIds: normalizeStoreIds(storeIds),
      includeSettings: options.includeSettings === true
    })
  }

  function clearState() {
    bundles.value = []
    pending.value = false
    ready.value = false
    errorMessage.value = ''
    lastLoadedKey.value = ''
  }

  async function loadBundles(storeIds: string[], options: { includeSettings?: boolean } = {}) {
    const normalizedStoreIds = normalizeStoreIds(storeIds)
    if (!operationsStore.sessionReady || !normalizedStoreIds.length) {
      clearState()
      return []
    }

    pending.value = true
    errorMessage.value = ''

    try {
      const nextBundles = await Promise.all(normalizedStoreIds.map(async (storeId) => {
        const descriptor = operationsStore.stores.find(store => normalizeText(store.id) === storeId)
        const [snapshotResponse, consultantsResponse, reportResultsResponse, settingsResponse] = await Promise.all([
          bffFetch<FilaAtendimentoSnapshotResponse>(
            `/api/admin/modules/fila-atendimento/operations-snapshot?storeId=${encodeURIComponent(storeId)}&includeHistory=false&includeActivitySessions=false`
          ),
          bffFetch<FilaAtendimentoConsultantsResponse>(
            `/api/admin/modules/fila-atendimento/consultants?storeId=${encodeURIComponent(storeId)}`
          ),
          bffFetch<FilaAtendimentoReportsResultsResponse>(
            `/api/admin/modules/fila-atendimento/reports-results?storeId=${encodeURIComponent(storeId)}&page=1&pageSize=200`
          ),
          options.includeSettings === true
            ? bffFetch<FilaAtendimentoSettingsResponse>(
                `/api/admin/modules/fila-atendimento/settings?storeId=${encodeURIComponent(storeId)}`
              )
            : Promise.resolve(null)
        ])

        return {
          storeId,
          storeName: normalizeText(descriptor?.name),
          storeCode: normalizeText(descriptor?.code),
          consultants: consultantsResponse?.consultants || [],
          snapshot: snapshotResponse || null,
          reportResults: reportResultsResponse?.rows || [],
          settings: settingsResponse
        } satisfies FilaAtendimentoWorkspaceBundle
      }))

      bundles.value = nextBundles
      ready.value = true
      lastLoadedKey.value = buildLoadKey(normalizedStoreIds, options)
      return bundles.value
    } catch (error) {
      clearState()
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar os dados consolidados do modulo.')
      throw error
    } finally {
      pending.value = false
    }
  }

  async function ensureLoaded(storeIds: string[], options: { includeSettings?: boolean } = {}) {
    const normalizedStoreIds = normalizeStoreIds(storeIds)
    if (!normalizedStoreIds.length || !operationsStore.sessionReady) {
      clearState()
      return false
    }

    if (ready.value && lastLoadedKey.value === buildLoadKey(normalizedStoreIds, options)) {
      return true
    }

    try {
      await loadBundles(normalizedStoreIds, options)
      return true
    } catch {
      return false
    }
  }

  return {
    bundles,
    pending,
    ready,
    errorMessage,
    storeOptions,
    aggregatedTeamState,
    clearState,
    loadBundles,
    ensureLoaded
  }
})