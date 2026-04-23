import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoActiveService,
  FilaAtendimentoCampaign,
  FilaAtendimentoCampaignMatch,
  FilaAtendimentoConsultantStatus,
  FilaAtendimentoConsultantView,
  FilaAtendimentoConsultantsResponse,
  FilaAtendimentoContextResponse,
  FilaAtendimentoFinishPayload,
  FilaAtendimentoMetricEventInput,
  FilaAtendimentoModalConfig,
  FilaAtendimentoOperationCommandResult,
  FilaAtendimentoOperationMutationDelta,
  FilaAtendimentoOperationOverview,
  FilaAtendimentoOperationState,
  FilaAtendimentoPausedEmployee,
  FilaAtendimentoQueueEntry,
  FilaAtendimentoServiceHistoryEntry,
  FilaAtendimentoSettingsAppSettings,
  FilaAtendimentoSettingsOptionGroup,
  FilaAtendimentoSettingsOptionItem,
  FilaAtendimentoSettingsProductItem,
  FilaAtendimentoSettingsTemplate,
  FilaAtendimentoSettingsResponse,
  FilaAtendimentoSnapshotResponse,
  FilaAtendimentoStoreContext
} from '~/types/fila-atendimento'
import { applyCampaignsToHistoryEntry, normalizeCampaign } from '~/utils/fila-atendimento/campaigns'
import { canAccessOperations, canManageCampaigns, canManageSettings, canSeeIntegratedOperations } from '~/utils/fila-atendimento/permissions'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const errorData = (error as { data?: Record<string, unknown> }).data
    const dataMessage = normalizeText(errorData?.message)
    if (dataMessage) {
      return dataMessage
    }

    const serverMessage = normalizeText((error as { statusMessage?: unknown }).statusMessage)
    if (serverMessage && !['Conflict', 'Bad Request', 'Forbidden', 'Unauthorized', 'Not Found'].includes(serverMessage)) {
      return serverMessage
    }

    const rawMessage = normalizeText((error as { message?: unknown }).message)
    if (rawMessage) {
      return rawMessage
    }
  }

  return fallback
}

function normalizeProductEntries(products: FilaAtendimentoFinishPayload['productsSeen'] = []) {
  return (Array.isArray(products) ? products : []).map((product, index) => {
    const id = normalizeText(product?.id)
    const name = normalizeText(product?.name || product?.label)
    const code = normalizeText(product?.code).toUpperCase()

    return {
      id: id || `product-${index + 1}`,
      name,
      code,
      price: Math.max(0, Number(product?.price ?? 0) || 0),
      isCustom: Boolean(product?.isCustom)
    }
  }).filter((product) => product.id || product.name || product.code)
}

function normalizeStringEntries(values: unknown) {
  const seen = new Set<string>()

  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false
      }

      seen.add(value)
      return true
    })
}

function normalizeDetailMap(value: unknown) {
  return Object.entries(value && typeof value === 'object' ? value as Record<string, unknown> : {}).reduce<Record<string, string>>((accumulator, [rawKey, rawValue]) => {
    const key = normalizeText(rawKey)
    const detail = normalizeText(rawValue)

    if (!key || !detail) {
      return accumulator
    }

    accumulator[key] = detail
    return accumulator
  }, {})
}

function normalizeCampaignMatches(matches: FilaAtendimentoFinishPayload['campaignMatches']) {
  return (Array.isArray(matches) ? matches : []).map((match) => ({
    campaignId: normalizeText(match?.campaignId),
    campaignName: normalizeText(match?.campaignName),
    matchedProductCodes: normalizeStringEntries(match?.matchedProductCodes).map((code) => code.toUpperCase()),
    bonusValue: Math.max(0, Number(match?.bonusValue || 0) || 0)
  })).filter((match) => match.campaignId || match.campaignName)
}

function createDefaultSettings(): FilaAtendimentoSettingsAppSettings {
  return {
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
  }
}

function createDefaultModalConfig(): FilaAtendimentoModalConfig {
  return {
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
  }
}

function createEmptyState(): FilaAtendimentoOperationState {
  return {
    activeStoreId: '',
    roster: [],
    waitingList: [],
    activeServices: [],
    pausedEmployees: [],
    consultantCurrentStatus: {},
    serviceHistory: [],
    operationTemplates: [],
    selectedOperationTemplateId: '',
    settings: createDefaultSettings(),
    modalConfig: createDefaultModalConfig(),
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

function createEmptySettingsState() {
  return {
    operationTemplates: [] as FilaAtendimentoSettingsTemplate[],
    selectedOperationTemplateId: '',
    settings: createDefaultSettings(),
    modalConfig: createDefaultModalConfig(),
    visitReasonOptions: [] as FilaAtendimentoSettingsOptionItem[],
    customerSourceOptions: [] as FilaAtendimentoSettingsOptionItem[],
    queueJumpReasonOptions: [] as FilaAtendimentoSettingsOptionItem[],
    lossReasonOptions: [] as FilaAtendimentoSettingsOptionItem[],
    professionOptions: [] as FilaAtendimentoSettingsOptionItem[],
    productCatalog: [] as FilaAtendimentoSettingsProductItem[],
    campaigns: [] as FilaAtendimentoCampaign[]
  }
}

function normalizeSettingsOptions(items: unknown): FilaAtendimentoSettingsOptionItem[] {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: normalizeText((item as { id?: unknown }).id),
    label: normalizeText((item as { label?: unknown }).label)
  })).filter((item) => item.id || item.label)
}

function normalizeSettingsProducts(items: unknown): FilaAtendimentoSettingsProductItem[] {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: normalizeText((item as { id?: unknown }).id) || `product-${index + 1}`,
    name: normalizeText((item as { name?: unknown }).name),
    code: normalizeText((item as { code?: unknown }).code),
    category: normalizeText((item as { category?: unknown }).category),
    basePrice: normalizeNumber((item as { basePrice?: unknown }).basePrice)
  })).filter((item) => item.id || item.name)
}

function normalizeStoreMap(stores: FilaAtendimentoStoreContext[]) {
  return new Map(stores.map((store) => [normalizeText(store.id), store]))
}

function cloneSettingsOptions(items: FilaAtendimentoSettingsOptionItem[]) {
  return items.map((item) => ({ ...item }))
}

function cloneSettingsProducts(items: FilaAtendimentoSettingsProductItem[]) {
  return items.map((item) => ({ ...item }))
}

function cloneSettingsState(currentState: FilaAtendimentoOperationState) {
  return {
    selectedOperationTemplateId: currentState.selectedOperationTemplateId,
    settings: { ...currentState.settings },
    modalConfig: { ...currentState.modalConfig },
    visitReasonOptions: cloneSettingsOptions(currentState.visitReasonOptions),
    customerSourceOptions: cloneSettingsOptions(currentState.customerSourceOptions),
    queueJumpReasonOptions: cloneSettingsOptions(currentState.queueJumpReasonOptions),
    lossReasonOptions: cloneSettingsOptions(currentState.lossReasonOptions),
    professionOptions: cloneSettingsOptions(currentState.professionOptions),
    productCatalog: cloneSettingsProducts(currentState.productCatalog),
    campaigns: cloneCampaigns(currentState.campaigns)
  }
}

function restoreSettingsState(
  currentState: FilaAtendimentoOperationState,
  snapshot: ReturnType<typeof cloneSettingsState>
): FilaAtendimentoOperationState {
  return {
    ...currentState,
    selectedOperationTemplateId: snapshot.selectedOperationTemplateId,
    settings: { ...snapshot.settings },
    modalConfig: { ...snapshot.modalConfig },
    visitReasonOptions: cloneSettingsOptions(snapshot.visitReasonOptions),
    customerSourceOptions: cloneSettingsOptions(snapshot.customerSourceOptions),
    queueJumpReasonOptions: cloneSettingsOptions(snapshot.queueJumpReasonOptions),
    lossReasonOptions: cloneSettingsOptions(snapshot.lossReasonOptions),
    professionOptions: cloneSettingsOptions(snapshot.professionOptions),
    productCatalog: cloneSettingsProducts(snapshot.productCatalog),
    campaigns: cloneCampaigns(snapshot.campaigns)
  }
}

function optionStateKeyFromGroup(group: FilaAtendimentoSettingsOptionGroup): keyof Pick<
  FilaAtendimentoOperationState,
  'visitReasonOptions' | 'customerSourceOptions' | 'queueJumpReasonOptions' | 'lossReasonOptions' | 'professionOptions'
> {
  switch (group) {
    case 'visit-reasons':
      return 'visitReasonOptions'
    case 'customer-sources':
      return 'customerSourceOptions'
    case 'queue-jump-reasons':
      return 'queueJumpReasonOptions'
    case 'loss-reasons':
      return 'lossReasonOptions'
    case 'professions':
      return 'professionOptions'
  }
}

function normalizeOperationTemplates(items: unknown): FilaAtendimentoSettingsTemplate[] {
  return (Array.isArray(items) ? items : []).map((template) => ({
    id: normalizeText((template as { id?: unknown }).id),
    label: normalizeText((template as { label?: unknown }).label),
    description: normalizeText((template as { description?: unknown }).description),
    settings: {
      ...createDefaultSettings(),
      ...((template as { settings?: Partial<FilaAtendimentoSettingsAppSettings> }).settings || {})
    },
    modalConfig: {
      ...createDefaultModalConfig(),
      ...((template as { modalConfig?: Partial<FilaAtendimentoModalConfig> }).modalConfig || {})
    },
    visitReasonOptions: normalizeSettingsOptions((template as { visitReasonOptions?: unknown }).visitReasonOptions),
    customerSourceOptions: normalizeSettingsOptions((template as { customerSourceOptions?: unknown }).customerSourceOptions)
  })).filter((template) => template.id || template.label)
}

function cloneOperationTemplates(items: FilaAtendimentoSettingsTemplate[]) {
  return items.map((template) => ({
    ...template,
    settings: {
      ...createDefaultSettings(),
      ...(template.settings || {})
    },
    modalConfig: {
      ...createDefaultModalConfig(),
      ...(template.modalConfig || {})
    },
    visitReasonOptions: cloneSettingsOptions(template.visitReasonOptions || []),
    customerSourceOptions: cloneSettingsOptions(template.customerSourceOptions || [])
  }))
}

function normalizeCampaigns(items: unknown): FilaAtendimentoCampaign[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeCampaign(item))
    .filter((item) => item.id || item.name)
}

function cloneCampaigns(items: FilaAtendimentoCampaign[]) {
  return items.map((item) => normalizeCampaign(item))
}

function createLocalId(prefix: string, label: string) {
  const slug = normalizeText(label)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'item'}-${Date.now()}`
}

function buildOptionPath(group: FilaAtendimentoSettingsOptionGroup) {
  return `/api/admin/modules/fila-atendimento/settings/options/${group}`
}

function buildOperationsSnapshotPath(
  storeId: string,
  options: { includeHistory?: boolean; includeActivitySessions?: boolean } = {}
) {
  const searchParams = new URLSearchParams({
    storeId,
    includeHistory: options.includeHistory !== false ? 'true' : 'false',
    includeActivitySessions: options.includeActivitySessions === true ? 'true' : 'false'
  })

  return `/api/admin/modules/fila-atendimento/operations-snapshot?${searchParams.toString()}`
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function durationSince(startedAt: number) {
  return Math.max(0, Math.round(nowMs() - startedAt))
}

function commandEventKey(path: string) {
  if (path.includes('operations-queue')) return 'fila.operacao.action.queue'
  if (path.includes('operations-pause')) return 'fila.operacao.action.pause'
  if (path.includes('operations-assign-task')) return 'fila.operacao.action.assign_task'
  if (path.includes('operations-resume')) return 'fila.operacao.action.resume'
  if (path.includes('operations-start')) return 'fila.operacao.action.start'
  if (path.includes('operations-finish')) return 'fila.operacao.action.finish'
  return 'fila.operacao.action.unknown'
}

function commandSummary(path: string) {
  if (path.includes('operations-queue')) return 'Consultor entrou na fila.'
  if (path.includes('operations-pause')) return 'Consultor pausado.'
  if (path.includes('operations-assign-task')) return 'Consultor direcionado para tarefa.'
  if (path.includes('operations-resume')) return 'Consultor retomado.'
  if (path.includes('operations-start')) return 'Atendimento iniciado.'
  if (path.includes('operations-finish')) return 'Atendimento encerrado.'
  return 'Acao operacional executada.'
}

function normalizeQueueEntries(items: unknown, storeMap: Map<string, FilaAtendimentoStoreContext>): FilaAtendimentoQueueEntry[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const storeId = normalizeText((item as { storeId?: unknown }).storeId)
    const store = storeMap.get(storeId)

    return {
      id: normalizeText((item as { id?: unknown }).id),
      storeId,
      storeName: normalizeText((item as { storeName?: unknown }).storeName) || normalizeText(store?.name),
      storeCode: normalizeText((item as { storeCode?: unknown }).storeCode) || normalizeText(store?.code),
      name: normalizeText((item as { name?: unknown }).name),
      role: normalizeText((item as { role?: unknown }).role),
      initials: normalizeText((item as { initials?: unknown }).initials),
      avatarUrl: normalizeText((item as { avatarUrl?: unknown }).avatarUrl),
      color: normalizeText((item as { color?: unknown }).color) || '#168aad',
      monthlyGoal: normalizeNumber((item as { monthlyGoal?: unknown }).monthlyGoal),
      commissionRate: normalizeNumber((item as { commissionRate?: unknown }).commissionRate),
      queueJoinedAt: normalizeNumber((item as { queueJoinedAt?: unknown }).queueJoinedAt)
    }
  }).filter((item) => item.id)
}

function normalizeActiveServices(items: unknown, storeMap: Map<string, FilaAtendimentoStoreContext>): FilaAtendimentoActiveService[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const base = normalizeQueueEntries([item], storeMap)[0]
    return {
      ...base,
      serviceId: normalizeText((item as { serviceId?: unknown }).serviceId),
      serviceStartedAt: normalizeNumber((item as { serviceStartedAt?: unknown }).serviceStartedAt),
      queueWaitMs: normalizeNumber((item as { queueWaitMs?: unknown }).queueWaitMs),
      queuePositionAtStart: Math.max(1, normalizeNumber((item as { queuePositionAtStart?: unknown }).queuePositionAtStart, 1)),
      startMode: normalizeText((item as { startMode?: unknown }).startMode) || 'queue',
      skippedPeople: (Array.isArray((item as { skippedPeople?: unknown[] }).skippedPeople)
        ? (item as { skippedPeople?: Array<{ id?: unknown; name?: unknown }> }).skippedPeople
        : []).map((person) => ({
          id: normalizeText(person?.id),
          name: normalizeText(person?.name)
        })).filter((person) => person.id || person.name)
    }
  }).filter((item) => item.id && item.serviceId)
}

function normalizePausedEmployees(items: unknown, storeMap: Map<string, FilaAtendimentoStoreContext>): FilaAtendimentoPausedEmployee[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const storeId = normalizeText((item as { storeId?: unknown }).storeId)
    const store = storeMap.get(storeId)

    return {
      personId: normalizeText((item as { personId?: unknown }).personId),
      storeId,
      storeName: normalizeText((item as { storeName?: unknown }).storeName) || normalizeText(store?.name),
      storeCode: normalizeText((item as { storeCode?: unknown }).storeCode) || normalizeText(store?.code),
      reason: normalizeText((item as { reason?: unknown }).reason),
      kind: normalizeText((item as { kind?: unknown }).kind),
      startedAt: normalizeNumber((item as { startedAt?: unknown }).startedAt)
    }
  }).filter((item) => item.personId)
}

function normalizeServiceHistoryEntry(entry: unknown): FilaAtendimentoServiceHistoryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const source = entry as Record<string, unknown>
  const serviceId = normalizeText(source.serviceId)
  if (!serviceId) {
    return null
  }

  return {
    ...(source as FilaAtendimentoServiceHistoryEntry),
    serviceId,
    storeId: normalizeText(source.storeId),
    storeName: normalizeText(source.storeName),
    personId: normalizeText(source.personId || source.consultantId),
    personName: normalizeText(source.personName || source.consultantName),
    consultantId: normalizeText(source.consultantId || source.personId),
    consultantName: normalizeText(source.consultantName || source.personName),
    customerName: normalizeText(source.customerName),
    customerPhone: normalizeText(source.customerPhone),
    customerEmail: normalizeText(source.customerEmail),
    customerProfession: normalizeText(source.customerProfession),
    finishedAt: normalizeNumber(source.finishedAt),
    finishOutcome: normalizeText(source.finishOutcome || source.outcome),
    outcome: normalizeText(source.outcome || source.finishOutcome),
    saleAmount: normalizeNumber(source.saleAmount),
    durationMs: normalizeNumber(source.durationMs),
    queueWaitMs: normalizeNumber(source.queueWaitMs),
    startMode: normalizeText(source.startMode),
    productSeen: normalizeText(source.productSeen),
    productClosed: normalizeText(source.productClosed),
    productDetails: normalizeText(source.productDetails),
    visitReasons: normalizeStringEntries(source.visitReasons),
    customerSources: normalizeStringEntries(source.customerSources),
    queueJumpReason: normalizeText(source.queueJumpReason),
    notes: normalizeText(source.notes),
    hasNotes: Boolean(source.hasNotes ?? normalizeText(source.notes)),
    completionLevel: normalizeText(source.completionLevel),
    completionRate: normalizeNumber(source.completionRate),
    isExistingCustomer: Boolean(source.isExistingCustomer),
    isGift: Boolean(source.isGift),
    isWindowService: Boolean(source.isWindowService),
    productsClosed: (Array.isArray(source.productsClosed) ? source.productsClosed : []).map((item) => ({
      name: normalizeText((item as { name?: unknown })?.name),
      code: normalizeText((item as { code?: unknown })?.code)
    })),
    campaignMatches: Array.isArray(source.campaignMatches) ? source.campaignMatches as any : [],
    campaignNames: normalizeStringEntries(source.campaignNames),
    campaignBonusTotal: normalizeNumber(source.campaignBonusTotal)
  }
}

function sortQueueEntries(items: FilaAtendimentoQueueEntry[]) {
  return [...items].sort((left, right) => {
    if (left.queueJoinedAt !== right.queueJoinedAt) {
      return left.queueJoinedAt - right.queueJoinedAt
    }

    return left.name.localeCompare(right.name, 'pt-BR')
  })
}

function sortActiveServiceEntries(items: FilaAtendimentoActiveService[]) {
  return [...items].sort((left, right) => {
    if (left.serviceStartedAt !== right.serviceStartedAt) {
      return left.serviceStartedAt - right.serviceStartedAt
    }

    return left.name.localeCompare(right.name, 'pt-BR')
  })
}

function sortPausedEmployeeEntries(items: FilaAtendimentoPausedEmployee[]) {
  return [...items].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt
    }

    return left.personId.localeCompare(right.personId, 'pt-BR')
  })
}

function sortServiceHistoryEntries(items: FilaAtendimentoServiceHistoryEntry[]) {
  return [...items].sort((left, right) => {
    const leftFinishedAt = Number(left.finishedAt || 0)
    const rightFinishedAt = Number(right.finishedAt || 0)
    if (leftFinishedAt !== rightFinishedAt) {
      return leftFinishedAt - rightFinishedAt
    }

    return normalizeText(left.serviceId).localeCompare(normalizeText(right.serviceId), 'pt-BR')
  })
}

function normalizeConsultants(items: FilaAtendimentoConsultantsResponse | null, storeMap: Map<string, FilaAtendimentoStoreContext>): FilaAtendimentoConsultantView[] {
  return (Array.isArray(items?.consultants) ? items?.consultants : []).map((consultant) => {
    const storeId = normalizeText(consultant.storeId)
    const store = storeMap.get(storeId)
    return {
      ...consultant,
      id: normalizeText(consultant.id),
      storeId,
      storeName: normalizeText(consultant.storeName) || normalizeText(store?.name),
      storeCode: normalizeText(consultant.storeCode) || normalizeText(store?.code),
      name: normalizeText(consultant.name),
      role: normalizeText(consultant.role),
      initials: normalizeText(consultant.initials),
      avatarUrl: normalizeText(consultant.avatarUrl),
      color: normalizeText(consultant.color) || '#168aad',
      monthlyGoal: normalizeNumber(consultant.monthlyGoal),
      commissionRate: normalizeNumber(consultant.commissionRate),
      conversionGoal: normalizeNumber(consultant.conversionGoal),
      avgTicketGoal: normalizeNumber(consultant.avgTicketGoal),
      paGoal: normalizeNumber(consultant.paGoal),
      active: Boolean(consultant.active)
    }
  }).filter((consultant) => consultant.id)
}

function cloneConsultants(items: FilaAtendimentoConsultantView[]) {
  return items.map((consultant) => ({
    ...consultant,
    access: consultant.access
      ? {
          ...consultant.access
        }
      : consultant.access ?? null
  }))
}

export const useFilaAtendimentoOperationsStore = defineStore('fila-atendimento-operations', () => {
  const { bffFetch } = useBffFetch()

  const moduleContext = ref<FilaAtendimentoContextResponse | null>(null)
  const state = ref<FilaAtendimentoOperationState>(createEmptyState())
  const overview = ref<FilaAtendimentoOperationOverview | null>(null)
  const overviewPending = ref(false)
  const overviewError = ref('')
  const bootstrapPending = ref(false)
  const workspacePending = ref(false)
  const commandPending = ref(false)
  const errorMessage = ref('')
  const workspaceError = ref('')
  const suppressedRealtimeRefresh = ref<Record<string, number>>({})
  const snapshotLoadState = ref({
    storeId: '',
    includeHistory: false,
    includeActivitySessions: false
  })
  const consultantsStoreId = ref('')
  const settingsStoreId = ref('')

  const stores = computed(() => moduleContext.value?.context?.stores || [])
  const role = computed(() => normalizeText(moduleContext.value?.principal?.role))
  const sessionReady = computed(() => Boolean(role.value))
  const canSeeIntegrated = computed(() => canSeeIntegratedOperations(role.value))
  const canEditSettings = computed(() => canManageSettings(role.value))
  const canEditCampaigns = computed(() => canManageCampaigns(role.value))

  function canRecordMetrics() {
    return typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
  }

  function buildMetricBase(): Pick<FilaAtendimentoMetricEventInput, 'pageKey' | 'pagePath' | 'storeId'> {
    return {
      pageKey: 'fila-atendimento.operacao',
      pagePath: '/admin/fila-atendimento',
      storeId: normalizeText(state.value.activeStoreId)
    }
  }

  async function recordMetricEvent(event: Omit<FilaAtendimentoMetricEventInput, 'pageKey' | 'pagePath'>) {
    if (!canRecordMetrics()) {
      return
    }

    try {
      await bffFetch('/api/admin/modules/fila-atendimento/metrics-events', {
        method: 'POST',
        body: {
          ...buildMetricBase(),
          ...event,
          metadata: {
            ...(event.metadata || {}),
            role: role.value,
            tenantId: normalizeText(moduleContext.value?.principal?.tenantId || moduleContext.value?.context?.activeTenantId)
          }
        }
      })
    } catch {
      // Métricas nunca devem bloquear a operação principal.
    }
  }

  async function measuredFetch<T>(
    eventKey: string,
    summary: string,
    request: () => Promise<T>,
    metadata: Record<string, unknown> = {}
  ) {
    const startedAt = nowMs()

    try {
      const result = await request()
      void recordMetricEvent({
        eventType: 'api',
        eventKey,
        status: 'ok',
        durationMs: durationSince(startedAt),
        summary,
        metadata
      })
      return result
    } catch (error) {
      void recordMetricEvent({
        eventType: 'api',
        eventKey,
        status: 'error',
        severity: 'warning',
        durationMs: durationSince(startedAt),
        summary,
        metadata: {
          ...metadata,
          message: normalizeErrorMessage(error, 'Falha na chamada.')
        }
      })
      throw error
    }
  }

  function resetWorkspaceLoadState() {
    snapshotLoadState.value = {
      storeId: '',
      includeHistory: false,
      includeActivitySessions: false
    }
    consultantsStoreId.value = ''
    settingsStoreId.value = ''
  }

  function markSnapshotLoaded(
    storeId: string,
    options: { includeHistory?: boolean; includeActivitySessions?: boolean } = {}
  ) {
    snapshotLoadState.value = {
      storeId,
      includeHistory: options.includeHistory !== false,
      includeActivitySessions: options.includeActivitySessions === true
    }
  }

  function hasLoadedSnapshot(
    storeId: string,
    options: { includeHistory?: boolean; includeActivitySessions?: boolean } = {}
  ) {
    const normalizedStoreId = normalizeText(storeId)
    if (!normalizedStoreId || snapshotLoadState.value.storeId !== normalizedStoreId) {
      return false
    }

    const requiresHistory = options.includeHistory !== false
    const requiresActivitySessions = options.includeActivitySessions === true

    if (requiresHistory && !snapshotLoadState.value.includeHistory) {
      return false
    }

    if (requiresActivitySessions && !snapshotLoadState.value.includeActivitySessions) {
      return false
    }

    return true
  }

  function hasLoadedConsultants(storeId: string) {
    return normalizeText(storeId) !== '' && consultantsStoreId.value === normalizeText(storeId)
  }

  function hasLoadedSettings(storeId: string) {
    return normalizeText(storeId) !== '' && settingsStoreId.value === normalizeText(storeId)
  }

  function clearWorkspace() {
    resetWorkspaceLoadState()
    state.value = {
      ...createEmptyState(),
      activeStoreId: state.value.activeStoreId
    }
  }

  function mergeWorkspaceState(
    storeId: string,
    snapshot: FilaAtendimentoSnapshotResponse | null,
    consultants: FilaAtendimentoConsultantsResponse | null,
    settingsBundle: FilaAtendimentoSettingsResponse | null
  ) {
    const storeMap = normalizeStoreMap(stores.value)
    const previousState = state.value
    const sameStore = normalizeText(previousState.activeStoreId) === storeId
    const normalizedSettings = settingsBundle
      ? {
          operationTemplates: normalizeOperationTemplates(settingsBundle.operationTemplates),
          selectedOperationTemplateId: normalizeText(settingsBundle.selectedOperationTemplateId),
          settings: {
            ...createDefaultSettings(),
            ...(settingsBundle.settings || {})
          },
          modalConfig: {
            ...createDefaultModalConfig(),
            ...(settingsBundle.modalConfig || {})
          },
          visitReasonOptions: normalizeSettingsOptions(settingsBundle.visitReasonOptions),
          customerSourceOptions: normalizeSettingsOptions(settingsBundle.customerSourceOptions),
          queueJumpReasonOptions: normalizeSettingsOptions(settingsBundle.queueJumpReasonOptions),
          lossReasonOptions: normalizeSettingsOptions(settingsBundle.lossReasonOptions),
          professionOptions: normalizeSettingsOptions(settingsBundle.professionOptions),
          productCatalog: normalizeSettingsProducts(settingsBundle.productCatalog),
          campaigns: normalizeCampaigns(settingsBundle.campaigns)
        }
      : sameStore
        ? {
            operationTemplates: cloneOperationTemplates(previousState.operationTemplates),
            selectedOperationTemplateId: previousState.selectedOperationTemplateId,
            settings: { ...previousState.settings },
            modalConfig: { ...previousState.modalConfig },
            visitReasonOptions: cloneSettingsOptions(previousState.visitReasonOptions),
            customerSourceOptions: cloneSettingsOptions(previousState.customerSourceOptions),
            queueJumpReasonOptions: cloneSettingsOptions(previousState.queueJumpReasonOptions),
            lossReasonOptions: cloneSettingsOptions(previousState.lossReasonOptions),
            professionOptions: cloneSettingsOptions(previousState.professionOptions),
            productCatalog: cloneSettingsProducts(previousState.productCatalog),
            campaigns: cloneCampaigns(previousState.campaigns)
          }
        : createEmptySettingsState()

    state.value = {
      activeStoreId: storeId,
      roster: consultants
        ? normalizeConsultants(consultants, storeMap)
        : (sameStore ? cloneConsultants(previousState.roster) : []),
      waitingList: snapshot
        ? normalizeQueueEntries(snapshot.waitingList, storeMap)
        : (sameStore ? [...previousState.waitingList] : []),
      activeServices: snapshot
        ? normalizeActiveServices(snapshot.activeServices, storeMap)
        : (sameStore ? [...previousState.activeServices] : []),
      pausedEmployees: snapshot
        ? normalizePausedEmployees(snapshot.pausedEmployees, storeMap)
        : (sameStore ? [...previousState.pausedEmployees] : []),
      consultantCurrentStatus: snapshot
        ? (snapshot.consultantCurrentStatus || {}) as Record<string, FilaAtendimentoConsultantStatus>
        : (sameStore ? { ...previousState.consultantCurrentStatus } : {}),
      serviceHistory: snapshot
        ? (Array.isArray(snapshot.serviceHistory) ? snapshot.serviceHistory : [])
        : (sameStore ? [...previousState.serviceHistory] : []),
      operationTemplates: normalizedSettings.operationTemplates,
      selectedOperationTemplateId: normalizedSettings.selectedOperationTemplateId,
      settings: normalizedSettings.settings,
      modalConfig: normalizedSettings.modalConfig,
      visitReasonOptions: normalizedSettings.visitReasonOptions,
      customerSourceOptions: normalizedSettings.customerSourceOptions,
      queueJumpReasonOptions: normalizedSettings.queueJumpReasonOptions,
      lossReasonOptions: normalizedSettings.lossReasonOptions,
      professionOptions: normalizedSettings.professionOptions,
      productCatalog: normalizedSettings.productCatalog,
      campaigns: normalizedSettings.campaigns,
      finishModalPersonId: ''
    }
  }

  function mergeOperationSnapshot(
    storeId: string,
    snapshot: FilaAtendimentoSnapshotResponse | null,
    options: { resetFinishModal?: boolean; preserveHistory?: boolean } = {}
  ) {
    const storeMap = normalizeStoreMap(stores.value)
    const previousState = state.value

    state.value = {
      ...previousState,
      activeStoreId: storeId,
      waitingList: normalizeQueueEntries(snapshot?.waitingList, storeMap),
      activeServices: normalizeActiveServices(snapshot?.activeServices, storeMap),
      pausedEmployees: normalizePausedEmployees(snapshot?.pausedEmployees, storeMap),
      consultantCurrentStatus: (snapshot?.consultantCurrentStatus || {}) as Record<string, FilaAtendimentoConsultantStatus>,
      serviceHistory: options.preserveHistory
        ? previousState.serviceHistory
        : (Array.isArray(snapshot?.serviceHistory) ? snapshot.serviceHistory : []),
      finishModalPersonId: options.resetFinishModal ? '' : previousState.finishModalPersonId
    }
  }

  function applyOperationMutationDelta(
    delta: FilaAtendimentoOperationMutationDelta | null | undefined,
    options: { resetFinishModal?: boolean } = {}
  ) {
    if (!delta) {
      return false
    }

    const previousState = state.value
    const storeMap = normalizeStoreMap(stores.value)
    const removeWaitingPersonId = normalizeText(delta.removeWaitingPersonId)
    const removeActivePersonId = normalizeText(delta.removeActivePersonId)
    const removePausedPersonId = normalizeText(delta.removePausedPersonId)

    let waitingList = previousState.waitingList.filter((item) => item.id !== removeWaitingPersonId && item.id !== removeActivePersonId)
    let activeServices = previousState.activeServices.filter((item) => item.id !== removeWaitingPersonId && item.id !== removeActivePersonId)
    let pausedEmployees = previousState.pausedEmployees.filter((item) => item.personId !== removePausedPersonId && item.personId !== removeWaitingPersonId)
    let serviceHistory = [...previousState.serviceHistory]
    const consultantCurrentStatus = { ...previousState.consultantCurrentStatus }

    const waitingEntry = normalizeQueueEntries(delta.waitingEntry ? [delta.waitingEntry] : [], storeMap)[0]
    if (waitingEntry) {
      waitingList = sortQueueEntries([...waitingList.filter((item) => item.id !== waitingEntry.id), waitingEntry])
    }

    const activeService = normalizeActiveServices(delta.activeService ? [delta.activeService] : [], storeMap)[0]
    if (activeService) {
      activeServices = sortActiveServiceEntries([...activeServices.filter((item) => item.id !== activeService.id), activeService])
    }

    const pausedEmployee = normalizePausedEmployees(delta.pausedEmployee ? [delta.pausedEmployee] : [], storeMap)[0]
    if (pausedEmployee) {
      pausedEmployees = sortPausedEmployeeEntries([...pausedEmployees.filter((item) => item.personId !== pausedEmployee.personId), pausedEmployee])
    }

    const historyEntry = normalizeServiceHistoryEntry(delta.serviceHistoryEntry)
    if (historyEntry) {
      serviceHistory = sortServiceHistoryEntries([
        ...serviceHistory.filter((item) => normalizeText(item.serviceId) !== normalizeText(historyEntry.serviceId)),
        historyEntry
      ])
    }

    const consultantStatusPersonId = normalizeText(delta.consultantStatus?.personId)
    if (consultantStatusPersonId && delta.consultantStatus?.status) {
      consultantCurrentStatus[consultantStatusPersonId] = {
        status: normalizeText(delta.consultantStatus.status.status),
        startedAt: normalizeNumber(delta.consultantStatus.status.startedAt)
      }
    }

    state.value = {
      ...previousState,
      waitingList,
      activeServices,
      pausedEmployees,
      consultantCurrentStatus,
      serviceHistory,
      finishModalPersonId: options.resetFinishModal ? '' : previousState.finishModalPersonId
    }

    return true
  }

  function suppressRealtimeRefresh(storeId: string, ttlMs = 1500) {
    const normalizedStoreId = normalizeText(storeId)
    if (!normalizedStoreId) {
      return
    }

    suppressedRealtimeRefresh.value = {
      ...suppressedRealtimeRefresh.value,
      [normalizedStoreId]: Date.now() + ttlMs
    }
  }

  function consumeSuppressedRealtimeRefresh(storeId: string) {
    const normalizedStoreId = normalizeText(storeId)
    if (!normalizedStoreId) {
      return false
    }

    const expiresAt = Number(suppressedRealtimeRefresh.value[normalizedStoreId] || 0)
    if (!expiresAt) {
      return false
    }

    if (expiresAt > Date.now()) {
      return true
    }

    const nextState = { ...suppressedRealtimeRefresh.value }
    delete nextState[normalizedStoreId]
    suppressedRealtimeRefresh.value = nextState
    return false
  }

  async function replaceSettingsOptionGroup(group: FilaAtendimentoSettingsOptionGroup, items: FilaAtendimentoSettingsOptionItem[]) {
    await bffFetch(buildOptionPath(group), {
      method: 'PUT',
      body: {
        storeId: state.value.activeStoreId,
        items: items.map((item) => ({
          id: normalizeText(item.id),
          label: normalizeText(item.label)
        })).filter((item) => item.id && item.label)
      }
    })
  }

  async function loadWorkspace(
    storeId = state.value.activeStoreId,
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      includeSettings?: boolean
      silent?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
    } = {}
  ) {
    const normalizedStoreId = normalizeText(storeId)
    const includeSnapshot = options.includeSnapshot !== false
    const includeConsultants = options.includeConsultants !== false
    const includeSettings = options.includeSettings !== false
    const silent = options.silent === true
    state.value = {
      ...state.value,
      activeStoreId: normalizedStoreId
    }

    if (!normalizedStoreId) {
      clearWorkspace()
      return null
    }

    if (!silent) {
      workspacePending.value = true
      workspaceError.value = ''
    }

    try {
      const [snapshot, consultants, settingsBundle] = await Promise.all([
        includeSnapshot
          ? measuredFetch<FilaAtendimentoSnapshotResponse>(
              'fila.operacao.api.snapshot',
              'Snapshot operacional carregado.',
              () => bffFetch<FilaAtendimentoSnapshotResponse>(
                buildOperationsSnapshotPath(normalizedStoreId, {
                  includeHistory: options.includeHistory,
                  includeActivitySessions: options.includeActivitySessions
                })
              ),
              {
                storeId: normalizedStoreId,
                includeHistory: options.includeHistory !== false,
                includeActivitySessions: options.includeActivitySessions === true
              }
            )
          : Promise.resolve(null),
        includeConsultants
          ? measuredFetch<FilaAtendimentoConsultantsResponse>(
              'fila.operacao.api.consultants',
              'Lista de consultores carregada.',
              () => bffFetch<FilaAtendimentoConsultantsResponse>(
                `/api/admin/modules/fila-atendimento/consultants?storeId=${encodeURIComponent(normalizedStoreId)}`
              ),
              { storeId: normalizedStoreId }
            )
          : Promise.resolve(null),
        includeSettings
          ? measuredFetch<FilaAtendimentoSettingsResponse>(
              'fila.operacao.api.settings',
              'Configuracoes operacionais carregadas.',
              () => bffFetch<FilaAtendimentoSettingsResponse>(
                `/api/admin/modules/fila-atendimento/settings?storeId=${encodeURIComponent(normalizedStoreId)}`
              ),
              { storeId: normalizedStoreId }
            )
          : Promise.resolve(null)
      ])

      mergeWorkspaceState(
        normalizedStoreId,
        includeSnapshot ? snapshot : null,
        includeConsultants ? consultants : null,
        includeSettings ? settingsBundle : null
      )

      if (includeSnapshot) {
        markSnapshotLoaded(normalizedStoreId, {
          includeHistory: options.includeHistory,
          includeActivitySessions: options.includeActivitySessions
        })
      }

      if (includeConsultants) {
        consultantsStoreId.value = normalizedStoreId
      }

      if (includeSettings) {
        settingsStoreId.value = normalizedStoreId
      }

      return state.value
    } catch (error) {
      if (!silent) {
        clearWorkspace()
        state.value = {
          ...state.value,
          activeStoreId: normalizedStoreId
        }
      }

      workspaceError.value = normalizeErrorMessage(error, 'Nao foi possivel carregar a operacao hospedada.')
      throw error
    } finally {
      if (!silent) {
        workspacePending.value = false
      }
    }
  }

  async function ensureWorkspaceData(
    storeId = state.value.activeStoreId,
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      includeSettings?: boolean
      silent?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
      force?: boolean
    } = {}
  ) {
    const normalizedStoreId = normalizeText(storeId)
    const includeSnapshot = options.includeSnapshot !== false
    const includeConsultants = options.includeConsultants !== false
    const includeSettings = options.includeSettings !== false
    const force = options.force === true

    if (!normalizedStoreId) {
      clearWorkspace()
      return null
    }

    const shouldLoadSnapshot = includeSnapshot && (force || !hasLoadedSnapshot(normalizedStoreId, {
      includeHistory: options.includeHistory,
      includeActivitySessions: options.includeActivitySessions
    }))
    const shouldLoadConsultants = includeConsultants && (force || !hasLoadedConsultants(normalizedStoreId))
    const shouldLoadSettings = includeSettings && (force || !hasLoadedSettings(normalizedStoreId))

    if (!shouldLoadSnapshot && !shouldLoadConsultants && !shouldLoadSettings) {
      state.value = {
        ...state.value,
        activeStoreId: normalizedStoreId
      }
      return state.value
    }

    return loadWorkspace(normalizedStoreId, {
      includeSnapshot: shouldLoadSnapshot,
      includeConsultants: shouldLoadConsultants,
      includeSettings: shouldLoadSettings,
      silent: options.silent,
      includeHistory: options.includeHistory,
      includeActivitySessions: options.includeActivitySessions
    })
  }

  async function refreshOperationSnapshot(
    storeId = state.value.activeStoreId,
    options: { resetFinishModal?: boolean; includeHistory?: boolean; includeActivitySessions?: boolean } = {}
  ) {
    const normalizedStoreId = normalizeText(storeId)
    const includeHistory = options.includeHistory !== false
    const includeActivitySessions = options.includeActivitySessions === true

    if (!normalizedStoreId) {
      return null
    }

    const snapshot = await measuredFetch<FilaAtendimentoSnapshotResponse>(
      'fila.operacao.api.snapshot',
      'Snapshot operacional atualizado.',
      () => bffFetch<FilaAtendimentoSnapshotResponse>(
        buildOperationsSnapshotPath(normalizedStoreId, {
          includeHistory,
          includeActivitySessions
        })
      ),
      {
        storeId: normalizedStoreId,
        includeHistory,
        includeActivitySessions,
        refresh: true
      }
    )

    mergeOperationSnapshot(normalizedStoreId, snapshot, {
      resetFinishModal: options.resetFinishModal,
      preserveHistory: !includeHistory
    })
    markSnapshotLoaded(normalizedStoreId, {
      includeHistory,
      includeActivitySessions
    })
    return snapshot
  }

  async function loadContext(
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      includeSettings?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
    } = {}
  ) {
    workspacePending.value = true
    errorMessage.value = ''

    try {
      const response = await measuredFetch<FilaAtendimentoContextResponse>(
        'fila.operacao.api.context',
        'Contexto da sessao do modulo carregado.',
        () => bffFetch<FilaAtendimentoContextResponse>('/api/admin/modules/fila-atendimento/context')
      )
      moduleContext.value = response
      if (!canAccessOperations(response?.principal?.role)) {
        clearWorkspace()
        return response
      }

      const nextStoreId = normalizeText(
        response?.context?.activeStoreId || response?.context?.stores?.[0]?.id || ''
      )

      if (!nextStoreId) {
        clearWorkspace()
        return null
      }

      await loadWorkspace(nextStoreId, {
        includeSnapshot: options.includeSnapshot,
        includeConsultants: options.includeConsultants,
        includeSettings: options.includeSettings,
        includeHistory: options.includeHistory,
        includeActivitySessions: options.includeActivitySessions
      })
      return response
    } catch (error) {
      moduleContext.value = null
      clearWorkspace()
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar a sessao do modulo.')
      throw error
    } finally {
      workspacePending.value = false
    }
  }

  async function bootstrap(
    bridgeToken = '',
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      includeSettings?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
    } = {}
  ) {
    bootstrapPending.value = true
    errorMessage.value = ''

    try {
      await bffFetch('/api/admin/modules/fila-atendimento/session', {
        method: 'POST',
        body: bridgeToken ? { bridgeToken } : {}
      })

      await loadContext(options)
    } catch (error) {
      moduleContext.value = null
      clearWorkspace()
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel iniciar a sessao do modulo.')
      throw error
    } finally {
      bootstrapPending.value = false
    }
  }

  async function refreshOverview() {
    overviewPending.value = true
    overviewError.value = ''

    try {
      overview.value = await measuredFetch<FilaAtendimentoOperationOverview>(
        'fila.operacao.api.overview',
        'Visao integrada das lojas carregada.',
        () => bffFetch<FilaAtendimentoOperationOverview>('/api/admin/modules/fila-atendimento/operations-overview')
      )
      return overview.value
    } catch (error) {
      overview.value = null
      overviewError.value = normalizeErrorMessage(error, 'Nao foi possivel carregar a operacao integrada.')
      throw error
    } finally {
      overviewPending.value = false
    }
  }

  function clearOverview() {
    overview.value = null
    overviewPending.value = false
    overviewError.value = ''
  }

  async function selectStore(
    storeId: string,
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      includeSettings?: boolean
      silent?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
      force?: boolean
    } = {}
  ) {
    const normalizedStoreId = normalizeText(storeId)

    return ensureWorkspaceData(normalizedStoreId, options)
  }

  async function runCommand(
    path: string,
    body: Record<string, unknown>,
    options: { storeId?: string; refreshOverview?: boolean; resetFinishModal?: boolean } = {}
  ): Promise<FilaAtendimentoOperationCommandResult> {
    const storeId = normalizeText(options.storeId || state.value.activeStoreId)

    if (!storeId) {
      return { ok: false, message: 'Selecione uma loja para continuar.' }
    }

    const startedAt = nowMs()
    const eventKey = commandEventKey(path)
    commandPending.value = true

    try {
      const response = await bffFetch<FilaAtendimentoOperationCommandResult>(path, {
        method: 'POST',
        body: {
          ...body,
          storeId
        }
      })

      if (state.value.activeStoreId === storeId) {
        suppressRealtimeRefresh(storeId)

        const appliedDelta = applyOperationMutationDelta(response?.delta, {
          resetFinishModal: options.resetFinishModal
        })

        if (!appliedDelta) {
          await refreshOperationSnapshot(storeId, {
            resetFinishModal: options.resetFinishModal,
            includeHistory: false,
            includeActivitySessions: false
          })
        }
      }

      if (options.refreshOverview) {
        await refreshOverview().catch(() => undefined)
      }

      const result = {
        ok: response?.ok !== false,
        message: normalizeText(response?.message),
        delta: response?.delta || null
      }

      void recordMetricEvent({
        eventType: 'action',
        eventKey,
        status: result.ok ? 'ok' : 'warning',
        severity: result.ok ? 'info' : 'warning',
        durationMs: durationSince(startedAt),
        summary: commandSummary(path),
        storeId,
        metadata: {
          path,
          hadDelta: Boolean(result.delta),
          refreshOverview: options.refreshOverview === true
        }
      })

      return result
    } catch (error) {
      void recordMetricEvent({
        eventType: 'action',
        eventKey,
        status: 'error',
        severity: 'warning',
        durationMs: durationSince(startedAt),
        summary: commandSummary(path),
        storeId,
        metadata: {
          path,
          message: normalizeErrorMessage(error, 'Nao foi possivel atualizar a operacao.')
        }
      })

      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel atualizar a operacao.')
      }
    } finally {
      commandPending.value = false
    }
  }

  async function openFinishModal(personId: string) {
    const normalizedPersonId = normalizeText(personId)
    const activeStoreId = normalizeText(state.value.activeStoreId)
    const startedAt = nowMs()

    if (!normalizedPersonId) {
      return
    }

    if (activeStoreId && !hasLoadedSettings(activeStoreId)) {
      try {
        await ensureWorkspaceData(activeStoreId, {
          includeSnapshot: false,
          includeConsultants: false,
          includeSettings: true,
          silent: true
        })
      } catch {
        // Mantem o modal funcional com defaults locais quando o bundle falha.
      }
    }

    state.value = {
      ...state.value,
      finishModalPersonId: normalizedPersonId
    }

    void recordMetricEvent({
      eventType: 'action',
      eventKey: 'fila.operacao.action.open_finish_modal',
      status: 'ok',
      durationMs: durationSince(startedAt),
      summary: 'Modal de fechamento aberto.',
      storeId: activeStoreId,
      metadata: {
        settingsLoaded: activeStoreId ? hasLoadedSettings(activeStoreId) : false
      }
    })
  }

  function closeFinishModal() {
    state.value = {
      ...state.value,
      finishModalPersonId: ''
    }
  }

  async function finishService(input: FilaAtendimentoFinishPayload): Promise<FilaAtendimentoOperationCommandResult> {
    const personId = normalizeText(input.personId)
    const normalizedProductsSeen = normalizeProductEntries(input.productsSeen)
    const normalizedProductsClosed = normalizeProductEntries(input.productsClosed)
    const outcome = normalizeText(input.outcome)
    const isSaleOutcome = outcome === 'compra' || outcome === 'reserva'
    const isLossOutcome = outcome === 'nao-compra'
    const productSeen = normalizeText(input.productSeen)
    const productClosed = normalizeText(input.productClosed)
    const productDetails = normalizeText(input.productDetails)
    const customerName = normalizeText(input.customerName)
    const customerPhone = normalizeText(input.customerPhone)
    const customerEmail = normalizeText(input.customerEmail)
    const visitReasons = normalizeStringEntries(input.visitReasons)
    const visitReasonDetails = normalizeDetailMap(input.visitReasonDetails)
    const customerSources = normalizeStringEntries(input.customerSources)
    const customerSourceDetails = normalizeDetailMap(input.customerSourceDetails)
    const lossReasons = normalizeStringEntries(input.lossReasons)
    const lossReasonDetails = normalizeDetailMap(input.lossReasonDetails)
    const lossReasonId = normalizeText(input.lossReasonId)
    const lossReason = normalizeText(input.lossReason)
    const saleAmount = Math.max(0, Number(input.saleAmount || 0) || 0)
    const customerProfession = normalizeText(input.customerProfession)
    const queueJumpReason = normalizeText(input.queueJumpReason)
    const notes = normalizeText(input.notes)
    const activeService = state.value.activeServices.find((item) => item.id === personId) || null
    const activeStore = stores.value.find((store) => store.id === state.value.activeStoreId) || null
    const campaignSeed: Partial<FilaAtendimentoServiceHistoryEntry> | null = activeService
      ? {
          serviceId: activeService.serviceId,
          storeId: state.value.activeStoreId,
          storeName: activeStore?.name || '',
          personId: activeService.id,
          personName: activeService.name,
          finishedAt: Date.now(),
          durationMs: Math.max(0, Date.now() - Number(activeService.serviceStartedAt || Date.now())),
          finishOutcome: outcome,
          startMode: activeService.startMode,
          queueWaitMs: Number(activeService.queueWaitMs || 0),
          isWindowService: Boolean(input.isWindowService),
          isGift: isSaleOutcome && Boolean(input.isGift),
          productSeen,
          productClosed: isSaleOutcome ? productClosed : '',
          productDetails: isSaleOutcome ? productDetails : '',
          productsSeen: normalizedProductsSeen,
          productsClosed: isSaleOutcome ? normalizedProductsClosed : [],
          productsSeenNone: Boolean(input.productsSeenNone),
          visitReasons,
          customerSources,
          customerName,
          customerPhone,
          customerEmail,
          customerProfession,
          isExistingCustomer: Boolean(input.isExistingCustomer),
          saleAmount: isSaleOutcome ? saleAmount : 0
        }
      : null
    const campaignResult = campaignSeed
      ? applyCampaignsToHistoryEntry(state.value.campaigns || [], campaignSeed)
      : { matches: [], totalBonus: 0 }
    const campaignMatches = normalizeCampaignMatches(
      Array.isArray(input.campaignMatches) ? input.campaignMatches : campaignResult.matches
    )
    const campaignBonusTotal = Math.max(0, Number(input.campaignBonusTotal ?? campaignResult.totalBonus ?? 0) || 0)
    const finishPayload: Record<string, unknown> = {
      personId,
      outcome
    }

    if (Boolean(input.isWindowService)) {
      finishPayload.isWindowService = true
    }

    if (productSeen) {
      finishPayload.productSeen = productSeen
    }

    if (normalizedProductsSeen.length > 0) {
      finishPayload.productsSeen = normalizedProductsSeen
    }

    if (Boolean(input.productsSeenNone)) {
      finishPayload.productsSeenNone = true
    }

    if (Boolean(input.visitReasonsNotInformed)) {
      finishPayload.visitReasonsNotInformed = true
    }

    if (Boolean(input.customerSourcesNotInformed)) {
      finishPayload.customerSourcesNotInformed = true
    }

    if (customerName) {
      finishPayload.customerName = customerName
    }

    if (customerPhone) {
      finishPayload.customerPhone = customerPhone
    }

    if (customerEmail) {
      finishPayload.customerEmail = customerEmail
    }

    if (Boolean(input.isExistingCustomer)) {
      finishPayload.isExistingCustomer = true
    }

    if (visitReasons.length > 0) {
      finishPayload.visitReasons = visitReasons
    }

    if (Object.keys(visitReasonDetails).length > 0) {
      finishPayload.visitReasonDetails = visitReasonDetails
    }

    if (customerSources.length > 0) {
      finishPayload.customerSources = customerSources
    }

    if (Object.keys(customerSourceDetails).length > 0) {
      finishPayload.customerSourceDetails = customerSourceDetails
    }

    if (isSaleOutcome && Boolean(input.isGift)) {
      finishPayload.isGift = true
    }

    if (isSaleOutcome && productClosed) {
      finishPayload.productClosed = productClosed
    }

    if (isSaleOutcome && productDetails) {
      finishPayload.productDetails = productDetails
    }

    if (isSaleOutcome && normalizedProductsClosed.length > 0) {
      finishPayload.productsClosed = normalizedProductsClosed
    }

    if (isSaleOutcome && saleAmount > 0) {
      finishPayload.saleAmount = saleAmount
    }

    if (isLossOutcome && lossReasons.length > 0) {
      finishPayload.lossReasons = lossReasons
    }

    if (isLossOutcome && Object.keys(lossReasonDetails).length > 0) {
      finishPayload.lossReasonDetails = lossReasonDetails
    }

    if (isLossOutcome && lossReasonId) {
      finishPayload.lossReasonId = lossReasonId
    }

    if (isLossOutcome && lossReason) {
      finishPayload.lossReason = lossReason
    }

    if (customerProfession) {
      finishPayload.customerProfession = customerProfession
    }

    if (queueJumpReason) {
      finishPayload.queueJumpReason = queueJumpReason
    }

    if (notes) {
      finishPayload.notes = notes
    }

    if (campaignMatches.length > 0) {
      finishPayload.campaignMatches = campaignMatches
    }

    if (campaignBonusTotal > 0) {
      finishPayload.campaignBonusTotal = campaignBonusTotal
    }

    return runCommand('/api/admin/modules/fila-atendimento/operations-finish', finishPayload, {
      storeId: input.storeId,
      resetFinishModal: true
    })
  }

  async function refreshWorkspaceState(
    includeSettings = true,
    options: {
      includeSnapshot?: boolean
      includeConsultants?: boolean
      silent?: boolean
      includeHistory?: boolean
      includeActivitySessions?: boolean
    } = {}
  ) {
    if (!state.value.activeStoreId) {
      return null
    }

    return loadWorkspace(state.value.activeStoreId, {
      includeSnapshot: options.includeSnapshot,
      includeConsultants: options.includeConsultants,
      includeSettings,
      silent: options.silent,
      includeHistory: options.includeHistory,
      includeActivitySessions: options.includeActivitySessions
    })
  }

  function recordQueuePageLoad(metrics: Record<string, unknown> = {}) {
    void recordMetricEvent({
      eventType: 'page_load',
      eventKey: 'fila.operacao.page_load',
      status: 'ok',
      durationMs: Math.round(Number(metrics.totalLoadMs || metrics.domReadyMs || 0) || 0),
      summary: 'Pagina de fila carregada no navegador.',
      metadata: metrics
    })
  }

  async function persistSettingsMutation(
    action: () => void,
    request: () => Promise<unknown>,
    fallbackMessage: string,
    options: { refreshOverview?: boolean } = {}
  ) {
    if (!state.value.activeStoreId) {
      return { ok: false, message: 'Selecione uma loja para continuar.' }
    }

    if (!canEditSettings.value) {
      return { ok: false, message: 'Seu acesso nao pode alterar configuracoes.' }
    }

    const previousSettingsState = cloneSettingsState(state.value)
    commandPending.value = true

    try {
      action()
      await request()

      if (options.refreshOverview && overview.value) {
        await refreshOverview().catch(() => undefined)
      }

      return { ok: true }
    } catch (error) {
      state.value = restoreSettingsState(state.value, previousSettingsState)
      return {
        ok: false,
        message: normalizeErrorMessage(error, fallbackMessage)
      }
    } finally {
      commandPending.value = false
    }
  }

  async function persistCampaignMutation(
    action: () => void,
    request: () => Promise<unknown>,
    fallbackMessage: string
  ) {
    if (!state.value.activeStoreId) {
      return { ok: false, message: 'Selecione uma loja para continuar.' }
    }

    if (!canEditCampaigns.value) {
      return { ok: false, message: 'Seu acesso nao pode alterar campanhas.' }
    }

    const previousCampaigns = cloneCampaigns(state.value.campaigns)
    commandPending.value = true

    try {
      action()
      await request()

      if (overview.value) {
        await refreshOverview().catch(() => undefined)
      }

      return { ok: true }
    } catch (error) {
      state.value = {
        ...state.value,
        campaigns: previousCampaigns
      }
      return {
        ok: false,
        message: normalizeErrorMessage(error, fallbackMessage)
      }
    } finally {
      commandPending.value = false
    }
  }

  function applyConsultantToState(consultantInput: FilaAtendimentoConsultantView | null | undefined) {
    const normalizedConsultant = normalizeConsultants(
      consultantInput ? { consultants: [consultantInput] } : null,
      normalizeStoreMap(stores.value)
    )[0]

    if (!normalizedConsultant) {
      return null
    }

    const currentStatuses = { ...state.value.consultantCurrentStatus }
    const activeStatus = currentStatuses[normalizedConsultant.id]

    state.value = {
      ...state.value,
      roster: (() => {
        const nextRoster = cloneConsultants(state.value.roster)
        const existingIndex = nextRoster.findIndex((item) => item.id === normalizedConsultant.id)

        if (existingIndex >= 0) {
          nextRoster.splice(existingIndex, 1, {
            ...nextRoster[existingIndex],
            ...normalizedConsultant
          })
          return nextRoster
        }

        return [...nextRoster, normalizedConsultant]
      })(),
      waitingList: state.value.waitingList.map((item) => (
        item.id === normalizedConsultant.id
          ? {
              ...item,
              storeId: normalizedConsultant.storeId,
              storeName: normalizedConsultant.storeName,
              storeCode: normalizedConsultant.storeCode,
              name: normalizedConsultant.name,
              role: normalizedConsultant.role,
              initials: normalizedConsultant.initials,
              avatarUrl: normalizedConsultant.avatarUrl,
              color: normalizedConsultant.color,
              monthlyGoal: normalizedConsultant.monthlyGoal,
              commissionRate: normalizedConsultant.commissionRate
            }
          : item
      )),
      activeServices: state.value.activeServices.map((item) => (
        item.id === normalizedConsultant.id
          ? {
              ...item,
              storeId: normalizedConsultant.storeId,
              storeName: normalizedConsultant.storeName,
              storeCode: normalizedConsultant.storeCode,
              name: normalizedConsultant.name,
              role: normalizedConsultant.role,
              initials: normalizedConsultant.initials,
              avatarUrl: normalizedConsultant.avatarUrl,
              color: normalizedConsultant.color,
              monthlyGoal: normalizedConsultant.monthlyGoal,
              commissionRate: normalizedConsultant.commissionRate
            }
          : item
      )),
      pausedEmployees: state.value.pausedEmployees.map((item) => (
        item.personId === normalizedConsultant.id
          ? {
              ...item,
              storeId: normalizedConsultant.storeId,
              storeName: normalizedConsultant.storeName,
              storeCode: normalizedConsultant.storeCode
            }
          : item
      )),
      consultantCurrentStatus: activeStatus
        ? {
            ...currentStatuses,
            [normalizedConsultant.id]: activeStatus
          }
        : currentStatuses
    }

    return normalizedConsultant
  }

  return {
    moduleContext,
    state,
    stores,
    role,
    sessionReady,
    canSeeIntegrated,
    canEditSettings,
    canEditCampaigns,
    overview,
    overviewPending,
    overviewError,
    bootstrapPending,
    workspacePending,
    commandPending,
    errorMessage,
    workspaceError,
    bootstrap,
    loadContext,
    loadWorkspace,
    ensureWorkspaceData,
    refreshOperationSnapshot,
    refreshWorkspaceState,
    selectStore,
    refreshOverview,
    clearOverview,
    recordQueuePageLoad,
    openFinishModal,
    closeFinishModal,
    consumeSuppressedRealtimeRefresh,
    updateOperationSettings(settingsPatch: Partial<FilaAtendimentoSettingsAppSettings>) {
      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            settings: {
              ...state.value.settings,
              ...settingsPatch
            }
          }
        },
        () => bffFetch('/api/admin/modules/fila-atendimento/settings/operation', {
          method: 'PATCH',
          body: {
            storeId: state.value.activeStoreId,
            settings: settingsPatch
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    applyOperationTemplate(templateId: string) {
      const normalizedTemplateId = normalizeText(templateId)
      const template = state.value.operationTemplates.find((item) => normalizeText(item.id) === normalizedTemplateId)

      if (!normalizedTemplateId || !template) {
        return Promise.resolve({ ok: false, message: 'Template operacional nao encontrado.' })
      }

      if (!state.value.activeStoreId) {
        return Promise.resolve({ ok: false, message: 'Selecione uma loja para continuar.' })
      }

      if (!canEditSettings.value) {
        return Promise.resolve({ ok: false, message: 'Seu acesso nao pode alterar configuracoes.' })
      }

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            selectedOperationTemplateId: normalizedTemplateId,
            settings: {
              ...createDefaultSettings(),
              ...(template.settings || {})
            },
            modalConfig: {
              ...createDefaultModalConfig(),
              ...(template.modalConfig || {})
            },
            visitReasonOptions: cloneSettingsOptions(template.visitReasonOptions || []),
            customerSourceOptions: cloneSettingsOptions(template.customerSourceOptions || [])
          }
        },
        () => Promise.all([
          bffFetch('/api/admin/modules/fila-atendimento/settings/operation', {
            method: 'PATCH',
            body: {
              storeId: state.value.activeStoreId,
              selectedOperationTemplateId: normalizedTemplateId,
              settings: {
                ...createDefaultSettings(),
                ...(template.settings || {})
              }
            }
          }),
          bffFetch('/api/admin/modules/fila-atendimento/settings/modal', {
            method: 'PATCH',
            body: {
              storeId: state.value.activeStoreId,
              modalConfig: {
                ...createDefaultModalConfig(),
                ...(template.modalConfig || {})
              }
            }
          }),
          replaceSettingsOptionGroup('visit-reasons', template.visitReasonOptions || []),
          replaceSettingsOptionGroup('customer-sources', template.customerSourceOptions || [])
        ]),
        'Nao foi possivel aplicar o template.',
        { refreshOverview: true }
      )
    },
    updateModalConfig(modalConfigPatch: Partial<FilaAtendimentoModalConfig>) {
      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            modalConfig: {
              ...state.value.modalConfig,
              ...modalConfigPatch
            }
          }
        },
        () => bffFetch('/api/admin/modules/fila-atendimento/settings/modal', {
          method: 'PATCH',
          body: {
            storeId: state.value.activeStoreId,
            modalConfig: modalConfigPatch
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    addSettingsOption(group: FilaAtendimentoSettingsOptionGroup, label: string) {
      const trimmedLabel = normalizeText(label)
      const optionId = createLocalId('opt', trimmedLabel)
      const stateKey = optionStateKeyFromGroup(group)

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            [stateKey]: [
              ...cloneSettingsOptions(state.value[stateKey]),
              {
                id: optionId,
                label: trimmedLabel
              }
            ]
          }
        },
        () => bffFetch(buildOptionPath(group), {
          method: 'POST',
          body: {
            storeId: state.value.activeStoreId,
            item: {
              id: optionId,
              label: trimmedLabel
            }
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    updateSettingsOption(group: FilaAtendimentoSettingsOptionGroup, optionId: string, label: string) {
      const normalizedOptionId = normalizeText(optionId)
      const normalizedLabel = normalizeText(label)
      const stateKey = optionStateKeyFromGroup(group)

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            [stateKey]: cloneSettingsOptions(state.value[stateKey]).map((item) => (
              item.id === normalizedOptionId
                ? {
                    ...item,
                    label: normalizedLabel
                  }
                : item
            ))
          }
        },
        () => bffFetch(`${buildOptionPath(group)}/${encodeURIComponent(normalizedOptionId)}`, {
          method: 'PATCH',
          body: {
            storeId: state.value.activeStoreId,
            label: normalizedLabel
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    removeSettingsOption(group: FilaAtendimentoSettingsOptionGroup, optionId: string) {
      const normalizedOptionId = normalizeText(optionId)
      const stateKey = optionStateKeyFromGroup(group)

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            [stateKey]: cloneSettingsOptions(state.value[stateKey]).filter((item) => item.id !== normalizedOptionId)
          }
        },
        () => bffFetch(`${buildOptionPath(group)}/${encodeURIComponent(normalizedOptionId)}?storeId=${encodeURIComponent(state.value.activeStoreId)}`, {
          method: 'DELETE'
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    addCatalogProduct(name: string, category = '', basePrice = 0, code = '') {
      const product = {
        id: createLocalId('product', name),
        name: normalizeText(name),
        code: normalizeText(code).toUpperCase(),
        category: normalizeText(category),
        basePrice: Math.max(0, normalizeNumber(basePrice))
      }

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            productCatalog: [
              ...cloneSettingsProducts(state.value.productCatalog),
              product
            ]
          }
        },
        () => bffFetch('/api/admin/modules/fila-atendimento/settings/products', {
          method: 'POST',
          body: {
            storeId: state.value.activeStoreId,
            item: product
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    updateCatalogProduct(productId: string, payload: Partial<FilaAtendimentoSettingsProductItem>) {
      const normalizedProductId = normalizeText(productId)
      const productPatch = {
        name: normalizeText(payload.name),
        code: normalizeText(payload.code).toUpperCase(),
        category: normalizeText(payload.category),
        basePrice: Math.max(0, normalizeNumber(payload.basePrice))
      }

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            productCatalog: cloneSettingsProducts(state.value.productCatalog).map((item) => (
              item.id === normalizedProductId
                ? {
                    ...item,
                    ...productPatch
                  }
                : item
            ))
          }
        },
        () => bffFetch(`/api/admin/modules/fila-atendimento/settings/products/${encodeURIComponent(normalizedProductId)}`, {
          method: 'PATCH',
          body: {
            storeId: state.value.activeStoreId,
            ...productPatch
          }
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    removeCatalogProduct(productId: string) {
      const normalizedProductId = normalizeText(productId)

      return persistSettingsMutation(
        () => {
          state.value = {
            ...state.value,
            productCatalog: cloneSettingsProducts(state.value.productCatalog).filter((item) => item.id !== normalizedProductId)
          }
        },
        () => bffFetch(`/api/admin/modules/fila-atendimento/settings/products/${encodeURIComponent(normalizedProductId)}?storeId=${encodeURIComponent(state.value.activeStoreId)}`, {
          method: 'DELETE'
        }),
        'Nao foi possivel salvar as configuracoes.'
      )
    },
    addCampaign(payload: Partial<FilaAtendimentoCampaign>) {
      const normalized = normalizeCampaign({
        ...payload,
        id: normalizeText(payload.id) || createLocalId('campaign', normalizeText(payload.name))
      })

      return persistCampaignMutation(
        () => {
          state.value = {
            ...state.value,
            campaigns: [
              ...cloneCampaigns(state.value.campaigns),
              normalized
            ]
          }
        },
        () => bffFetch('/api/admin/modules/fila-atendimento/settings/campaigns', {
          method: 'POST',
          body: {
            storeId: state.value.activeStoreId,
            item: normalized
          }
        }),
        'Nao foi possivel salvar as campanhas.'
      )
    },
    updateCampaign(campaignId: string, payload: Partial<FilaAtendimentoCampaign>) {
      const normalized = normalizeCampaign({
        ...payload,
        id: normalizeText(campaignId)
      })

      return persistCampaignMutation(
        () => {
          state.value = {
            ...state.value,
            campaigns: cloneCampaigns(state.value.campaigns).map((campaign) => (
              campaign.id === normalized.id ? normalized : campaign
            ))
          }
        },
        () => bffFetch(`/api/admin/modules/fila-atendimento/settings/campaigns/${encodeURIComponent(normalizeText(campaignId))}`, {
          method: 'PATCH',
          body: {
            storeId: state.value.activeStoreId,
            name: normalized.name,
            description: normalized.description,
            campaignType: normalized.campaignType,
            isActive: normalized.isActive,
            startsAt: normalized.startsAt,
            endsAt: normalized.endsAt,
            targetOutcome: normalized.targetOutcome,
            minSaleAmount: normalized.minSaleAmount,
            maxServiceMinutes: normalized.maxServiceMinutes,
            productCodes: normalized.productCodes,
            sourceIds: normalized.sourceIds,
            reasonIds: normalized.reasonIds,
            queueJumpOnly: normalized.queueJumpOnly,
            existingCustomerFilter: normalized.existingCustomerFilter,
            bonusFixed: normalized.bonusFixed,
            bonusRate: normalized.bonusRate
          }
        }),
        'Nao foi possivel salvar as campanhas.'
      )
    },
    removeCampaign(campaignId: string) {
      const normalizedCampaignId = normalizeText(campaignId)

      return persistCampaignMutation(
        () => {
          state.value = {
            ...state.value,
            campaigns: cloneCampaigns(state.value.campaigns).filter((campaign) => campaign.id !== normalizedCampaignId)
          }
        },
        () => bffFetch(`/api/admin/modules/fila-atendimento/settings/campaigns/${encodeURIComponent(normalizedCampaignId)}?storeId=${encodeURIComponent(state.value.activeStoreId)}`, {
          method: 'DELETE'
        }),
        'Nao foi possivel salvar as campanhas.'
      )
    },
    addToQueue(personId: string, storeId = '') {
      return runCommand('/api/admin/modules/fila-atendimento/operations-queue', { personId }, {
        storeId,
        refreshOverview: Boolean(storeId)
      })
    },
    pauseEmployee(personId: string, reason: string, storeId = '') {
      return runCommand('/api/admin/modules/fila-atendimento/operations-pause', { personId, reason }, {
        storeId,
        refreshOverview: Boolean(storeId)
      })
    },
    assignTask(personId: string, reason: string, storeId = '') {
      return runCommand('/api/admin/modules/fila-atendimento/operations-assign-task', { personId, reason }, {
        storeId,
        refreshOverview: true
      })
    },
    resumeEmployee(personId: string, storeId = '') {
      return runCommand('/api/admin/modules/fila-atendimento/operations-resume', { personId }, {
        storeId,
        refreshOverview: Boolean(storeId)
      })
    },
    startService(personId = '', storeId = '') {
      return runCommand('/api/admin/modules/fila-atendimento/operations-start', { personId }, {
        storeId,
        refreshOverview: Boolean(storeId)
      })
    },
    finishService
  }
})
