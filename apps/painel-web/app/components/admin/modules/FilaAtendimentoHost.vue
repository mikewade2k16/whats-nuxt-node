<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const route = useRoute()
const router = useRouter()
const { bffFetch } = useBffFetch()

interface ModuleProbeResult {
  ok: boolean
  url: string
  statusCode: number | null
  checkedAt: string
  detail: string
}

interface FilaAtendimentoBootstrapResponse {
  module: {
    id: string
    label: string
    status: string
    transport: string
    docs: {
      quickStart: string
      protocol: string
      agents: string
      incorporationPlan: string
    }
    contracts: {
      required: string[]
      optional: string[]
    }
  }
  runtime: {
    web: {
      publicBase: string
      internalBase: string
    }
    api: {
      publicBase: string
      internalBase: string
    }
  }
  health: {
    web: ModuleProbeResult
    api: ModuleProbeResult
  }
  context: {
    actor: {
      coreUserId: string
      email: string
      userType: string
      userLevel: string
      isPlatformAdmin: boolean
    }
    tenant: {
      tenantId: string
      clientId: number | null
      moduleCodes: string[]
    }
    capabilities: string[]
  }
}

interface FilaAtendimentoStoreContext {
  id: string
  code: string
  name: string
  city: string
}

interface FilaAtendimentoTenantContext {
  id: string
  slug?: string
  name?: string
}

interface FilaAtendimentoContextResponse {
  user?: {
    displayName?: string
    email?: string
  }
  principal?: {
    role?: string
    tenantId?: string
  }
  context?: {
    activeTenantId?: string
    activeStoreId?: string
    tenants?: FilaAtendimentoTenantContext[]
    stores?: FilaAtendimentoStoreContext[]
  }
}

interface QueueEntry {
  id: string
  name: string
  role: string
  initials: string
  color: string
  monthlyGoal?: number
  commissionRate?: number
  queueJoinedAt: number
}

interface ActiveService {
  id: string
  name: string
  role: string
  initials: string
  color: string
  monthlyGoal?: number
  commissionRate?: number
  serviceId: string
  serviceStartedAt: number
  queueJoinedAt: number
  queueWaitMs: number
  queuePositionAtStart: number
  startMode: string
}

interface PausedEmployee {
  personId: string
  reason: string
  kind?: string
  startedAt: number
}

interface ConsultantStatus {
  status: string
  startedAt: number
}

interface FilaAtendimentoSnapshotResponse {
  storeId?: string
  waitingList?: QueueEntry[]
  activeServices?: ActiveService[]
  pausedEmployees?: PausedEmployee[]
  consultantCurrentStatus?: Record<string, ConsultantStatus>
  serviceHistory?: Array<{ serviceId?: string }>
}

interface ConsultantView {
  id: string
  storeId: string
  name: string
  role: string
  initials: string
  color: string
  monthlyGoal: number
  commissionRate: number
  conversionGoal: number
  avgTicketGoal: number
  paGoal: number
  active: boolean
}

interface FilaAtendimentoConsultantsResponse {
  consultants?: ConsultantView[]
}

interface ReportsOverviewMetrics {
  totalAttendances?: number
  conversions?: number
  conversionRate?: number
  soldValue?: number
  averageTicket?: number
  averageQueueWaitMs?: number
}

interface ReportsConsultantAggRow {
  consultantId?: string
  consultantName?: string
  attendances?: number
  conversions?: number
  saleAmount?: number
}

interface ReportsOverviewResponse {
  storeId?: string
  metrics?: ReportsOverviewMetrics
  chartData?: {
    consultantAgg?: ReportsConsultantAggRow[]
  }
}

interface RecentServiceItem {
  serviceId?: string
  consultantName?: string
  customerName?: string
  outcome?: string
  saleAmount?: number
  finishedAt?: number
  productClosed?: string
}

interface ReportsRecentServicesResponse {
  items?: RecentServiceItem[]
}

interface ReportsResultItem {
  serviceId?: string
  consultantName?: string
  customerName?: string
  outcome?: string
  saleAmount?: number
  durationMs?: number
  queueWaitMs?: number
  finishedAt?: number
  productClosed?: string
  completionLevel?: string
}

interface ReportsResultsResponse {
  total?: number
  rows?: ReportsResultItem[]
}

interface AnalyticsRankingRow {
  consultantId?: string
  consultantName?: string
  soldValue?: number
  attendances?: number
  conversions?: number
  conversionRate?: number
  ticketAverage?: number
  paScore?: number
  qualityScore?: number
  queueJumpRate?: number
}

interface AnalyticsRankingAlert {
  consultantId?: string
  consultantName?: string
  type?: string
  value?: number
  threshold?: number
}

interface AnalyticsRankingResponse {
  monthlyRows?: AnalyticsRankingRow[]
  alerts?: AnalyticsRankingAlert[]
}

interface AnalyticsCountRow {
  label?: string
  count?: number
}

interface AnalyticsHourlySalesRow {
  label?: string
  count?: number
  value?: number
}

interface AnalyticsTimeIntelligence {
  quickHighPotentialCount?: number
  longLowSaleCount?: number
  longNoSaleCount?: number
  quickNoSaleCount?: number
  avgQueueWaitMs?: number
  notUsingQueueRate?: number
}

interface AnalyticsDataResponse {
  timeIntelligence?: AnalyticsTimeIntelligence
  soldProducts?: AnalyticsCountRow[]
  visitReasons?: AnalyticsCountRow[]
  customerSources?: AnalyticsCountRow[]
  outcomeSummary?: AnalyticsCountRow[]
  hourlySales?: AnalyticsHourlySalesRow[]
}

interface AnalyticsDiagnosisItem {
  id?: string
  level?: string
  title?: string
  reading?: string
  hypothesis?: string
  action?: string
}

interface AnalyticsIntelligenceResponse {
  totalAttendances?: number
  conversionRate?: number
  ticketAverage?: number
  healthScore?: number
  severityCounts?: {
    critical?: number
    attention?: number
    healthy?: number
  }
  diagnosis?: AnalyticsDiagnosisItem[]
  recommendedActions?: string[]
  time?: {
    avgQueueWaitMs?: number
  }
}

interface SettingsOptionItem {
  id?: string
  label?: string
}

interface SettingsProductItem {
  id?: string
  name?: string
  category?: string
  basePrice?: number
}

interface SettingsOperationTemplate {
  id?: string
  label?: string
}

interface SettingsAppSettings {
  maxConcurrentServices?: number
  alertMinConversionRate?: number
  alertMaxQueueJumpRate?: number
  alertMinPaScore?: number
  alertMinTicketAverage?: number
}

interface FilaAtendimentoSettingsResponse {
  storeId?: string
  selectedOperationTemplateId?: string
  operationTemplates?: SettingsOperationTemplate[]
  settings?: SettingsAppSettings
  visitReasonOptions?: SettingsOptionItem[]
  customerSourceOptions?: SettingsOptionItem[]
  queueJumpReasonOptions?: SettingsOptionItem[]
  lossReasonOptions?: SettingsOptionItem[]
  professionOptions?: SettingsOptionItem[]
  productCatalog?: SettingsProductItem[]
}

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface RealtimeTicketResponse {
  ticket: string
  expiresInSeconds: number
}

interface FilaAtendimentoRealtimeEvent {
  type?: string
  topic?: string
  storeId?: string
  tenantId?: string
  message?: string
  ts?: string
}

type ConsultantStatusKey = 'available' | 'queue' | 'service' | 'paused' | 'assignment'

interface ConsultantRosterItem extends ConsultantView {
  statusKey: ConsultantStatusKey
  statusLabel: string
  statusStartedAt: number
  pauseReason: string
}

const data = ref<FilaAtendimentoBootstrapResponse | null>(null)
const moduleContext = ref<FilaAtendimentoContextResponse | null>(null)
const snapshot = ref<FilaAtendimentoSnapshotResponse | null>(null)
const consultants = ref<ConsultantView[]>([])
const reportsOverview = ref<ReportsOverviewResponse | null>(null)
const recentServices = ref<ReportsRecentServicesResponse | null>(null)
const reportsResults = ref<ReportsResultsResponse | null>(null)
const analyticsRanking = ref<AnalyticsRankingResponse | null>(null)
const analyticsData = ref<AnalyticsDataResponse | null>(null)
const analyticsIntelligence = ref<AnalyticsIntelligenceResponse | null>(null)
const settingsBundle = ref<FilaAtendimentoSettingsResponse | null>(null)
const selectedStoreId = ref('')
const pending = ref(false)
const sessionPending = ref(false)
const workspacePending = ref(false)
const errorMessage = ref('')
const sessionErrorMessage = ref('')
const realtimeErrorMessage = ref('')
const operationsRealtimeStatus = ref<RealtimeStatus>('idle')
const contextRealtimeStatus = ref<RealtimeStatus>('idle')
const lastRealtimeEventAt = ref('')
const now = ref(Date.now())

let clockTimer: ReturnType<typeof setInterval> | null = null
let realtimeStopWatcher: (() => void) | null = null
let operationsSocket: WebSocket | null = null
let contextSocket: WebSocket | null = null
let operationsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let contextReconnectTimer: ReturnType<typeof setTimeout> | null = null
let operationsReconnectAttempts = 0
let contextReconnectAttempts = 0
let operationsConnectionKey = ''
let contextConnectionKey = ''
let operationsIntentionalClose = false
let contextIntentionalClose = false
let realtimeWorkspaceRefreshPromise: Promise<void> | null = null
let realtimeWorkspaceRefreshQueued = false

const requiredContracts = computed(() => data.value?.module.contracts.required || [])
const optionalContracts = computed(() => data.value?.module.contracts.optional || [])
const actorCapabilities = computed(() => data.value?.context.capabilities || [])
const moduleDocs = computed(() => data.value?.module.docs)
const stores = computed(() => moduleContext.value?.context?.stores || [])
const moduleTenantId = computed(() => String(
  moduleContext.value?.context?.activeTenantId
  || moduleContext.value?.principal?.tenantId
  || moduleContext.value?.context?.tenants?.[0]?.id
  || data.value?.context?.tenant?.tenantId
  || ''
).trim())
const selectedTenant = computed(() => (
  moduleContext.value?.context?.tenants || []
).find(tenant => String(tenant.id || '').trim() === moduleTenantId.value) || null)
const selectedStore = computed(() =>
  stores.value.find(store => String(store.id || '').trim() === String(selectedStoreId.value || '').trim()) || null
)
const sessionReady = computed(() => Boolean(moduleContext.value?.principal?.role))
const waitingList = computed(() => snapshot.value?.waitingList || [])
const activeServices = computed(() => snapshot.value?.activeServices || [])
const pausedEmployees = computed(() => snapshot.value?.pausedEmployees || [])
const consultantCurrentStatus = computed(() => snapshot.value?.consultantCurrentStatus || {})
const waitingCount = computed(() => waitingList.value.length)
const activeCount = computed(() => activeServices.value.length)
const pausedCount = computed(() => pausedEmployees.value.length)
const historyCount = computed(() => snapshot.value?.serviceHistory?.length || 0)
const currentUserLabel = computed(() =>
  moduleContext.value?.user?.displayName || data.value?.context.actor.email || 'não identificado'
)
const activeTenantLabel = computed(() =>
  selectedTenant.value?.name || selectedTenant.value?.slug || moduleTenantId.value || 'tenant não resolvido'
)
const storeOptions = computed(() =>
  stores.value.map(store => ({
    label: `${store.name} (${store.code})`,
    value: store.id
  }))
)
const pausedByPersonId = computed(() => {
  return new Map(
    pausedEmployees.value.map(item => [String(item.personId || '').trim(), item])
  )
})
const waitingIds = computed(() => new Set(waitingList.value.map(item => String(item.id || '').trim())))
const activeIds = computed(() => new Set(activeServices.value.map(item => String(item.id || '').trim())))
const roster = computed<ConsultantRosterItem[]>(() => {
  return consultants.value
    .filter(item => item.active !== false)
    .map((consultant) => {
      const consultantId = String(consultant.id || '').trim()
      const pausedItem = pausedByPersonId.value.get(consultantId)
      const statusRecord = consultantCurrentStatus.value[consultantId]
      const statusKey: ConsultantStatusKey = activeIds.value.has(consultantId)
        ? 'service'
        : waitingIds.value.has(consultantId)
          ? 'queue'
          : pausedItem
            ? String(pausedItem.kind || '').trim() === 'assignment'
              ? 'assignment'
              : 'paused'
            : 'available'

      const statusLabel = statusKey === 'service'
        ? 'Em atendimento'
        : statusKey === 'queue'
          ? 'Na fila'
          : statusKey === 'assignment'
            ? 'Em tarefa'
            : statusKey === 'paused'
              ? 'Pausado'
              : 'Disponível'

      return {
        ...consultant,
        statusKey,
        statusLabel,
        statusStartedAt: Number(pausedItem?.startedAt || statusRecord?.startedAt || 0) || 0,
        pauseReason: String(pausedItem?.reason || '').trim()
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
})
const recentServiceItems = computed(() => recentServices.value?.items || [])
const reportResultRows = computed(() => (reportsResults.value?.rows || []).slice(0, 4))
const rankingRows = computed(() => (analyticsRanking.value?.monthlyRows || []).slice(0, 5))
const analyticsOutcomeSummary = computed(() => (analyticsData.value?.outcomeSummary || []).slice(0, 4))
const analyticsSoldProducts = computed(() => (analyticsData.value?.soldProducts || []).slice(0, 4))
const analyticsVisitReasons = computed(() => (analyticsData.value?.visitReasons || []).slice(0, 4))
const analyticsCustomerSources = computed(() => (analyticsData.value?.customerSources || []).slice(0, 4))
const analyticsHourlySales = computed(() => (analyticsData.value?.hourlySales || []).slice(0, 4))
const analyticsDataAvailable = computed(() => Boolean(
  analyticsOutcomeSummary.value.length
  || analyticsSoldProducts.value.length
  || analyticsVisitReasons.value.length
  || analyticsCustomerSources.value.length
  || analyticsHourlySales.value.length
))
const analyticsAlerts = computed(() => (analyticsRanking.value?.alerts || []).slice(0, 4))
const diagnosisItems = computed(() => (analyticsIntelligence.value?.diagnosis || []).slice(0, 3))
const recommendedActions = computed(() => (analyticsIntelligence.value?.recommendedActions || []).slice(0, 3))
const selectedTemplate = computed(() => {
  const templateId = String(settingsBundle.value?.selectedOperationTemplateId || '').trim()
  return (settingsBundle.value?.operationTemplates || []).find(
    template => String(template.id || '').trim() === templateId
  ) || null
})
const bridgeConnected = computed(() => (
  operationsRealtimeStatus.value === 'connected' || contextRealtimeStatus.value === 'connected'
))
const lastRealtimeEventLabel = computed(() => (
  lastRealtimeEventAt.value ? formatDateTime(Date.parse(lastRealtimeEventAt.value)) : 'aguardando evento'
))

function probeBadgeColor(result?: ModuleProbeResult | null) {
  if (!result) return 'neutral'
  return result.ok ? 'success' : 'error'
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatElapsed(timestamp: number) {
  const startedAt = Number(timestamp || 0)
  if (!startedAt) return 'agora'

  const diffMs = Math.max(0, now.value - startedAt)
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = [hours, minutes, seconds].map(value => String(value).padStart(2, '0'))
  return hours > 0 ? parts.join(':') : parts.slice(1).join(':')
}

function formatWaitTime(waitMs: number) {
  const totalMinutes = Math.max(0, Math.round((Number(waitMs || 0) || 0) / 60000))
  if (totalMinutes < 1) return 'menos de 1 min'
  if (totalMinutes === 1) return '1 min'
  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function startModeLabel(startMode: string) {
  return String(startMode || '').trim() === 'queue-jump' ? 'Fora da vez' : 'Fila normal'
}

function statusBadgeColor(statusKey: ConsultantStatusKey) {
  if (statusKey === 'service') return 'success'
  if (statusKey === 'queue') return 'warning'
  if (statusKey === 'paused' || statusKey === 'assignment') return 'error'
  return 'neutral'
}

function formatCompactNumber(value: number) {
  const normalized = Number(value || 0) || 0
  return new Intl.NumberFormat('pt-BR').format(Math.round(normalized))
}

function formatCurrency(value: number) {
  const normalized = Number(value || 0) || 0
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(normalized)
}

function formatPercent(value: number) {
  const normalized = Number(value || 0) || 0
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(normalized)}%`
}

function formatDateTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'sem horário'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

function formatOutcomeLabel(outcome: string) {
  const normalized = String(outcome || '').trim().toLowerCase()
  if (normalized === 'compra') return 'Compra'
  if (normalized === 'reserva') return 'Reserva'
  if (normalized === 'nao-compra') return 'Não compra'
  return normalized || 'Sem desfecho'
}

function formatCompletionLevel(level: string) {
  const normalized = String(level || '').trim().toLowerCase()
  if (normalized === 'excellent') return 'Excelente'
  if (normalized === 'complete') return 'Completo'
  if (normalized === 'incomplete') return 'Incompleto'
  if (normalized === 'notes') return 'Com observações'
  return normalized || 'Sem checklist'
}

function realtimeBadgeColor(status: RealtimeStatus) {
  if (status === 'connected') return 'success'
  if (status === 'connecting' || status === 'reconnecting') return 'warning'
  if (status === 'error') return 'error'
  return 'neutral'
}

function realtimeStatusLabel(status: RealtimeStatus) {
  if (status === 'connected') return 'conectado'
  if (status === 'connecting') return 'conectando'
  if (status === 'reconnecting') return 'reconectando'
  if (status === 'error') return 'com falha'
  return 'ocioso'
}

async function loadBootstrap() {
  pending.value = true
  errorMessage.value = ''

  try {
    data.value = await bffFetch<FilaAtendimentoBootstrapResponse>('/api/admin/modules/fila-atendimento/bootstrap')
  } catch (error) {
    data.value = null
    errorMessage.value = normalizeErrorMessage(error, 'Não foi possível carregar o host do módulo.')
  } finally {
    pending.value = false
  }
}

async function loadOperationalWorkspace(storeId = selectedStoreId.value, options: { includeSettings?: boolean } = {}) {
  const normalizedStoreId = String(storeId || '').trim()
  if (!normalizedStoreId) {
    snapshot.value = null
    consultants.value = []
    reportsOverview.value = null
    recentServices.value = null
    reportsResults.value = null
    analyticsRanking.value = null
    analyticsData.value = null
    analyticsIntelligence.value = null
    if (options.includeSettings !== false) {
      settingsBundle.value = null
    }
    return
  }

  workspacePending.value = true
  sessionErrorMessage.value = ''

  try {
    const [
      nextSnapshot,
      nextConsultants,
      nextReportsOverview,
      nextRecentServices,
      nextReportsResults,
      nextAnalyticsRanking,
      nextAnalyticsData,
      nextAnalyticsIntelligence,
      nextSettingsBundle
    ] = await Promise.all([
      bffFetch<FilaAtendimentoSnapshotResponse>(
        `/api/admin/modules/fila-atendimento/operations-snapshot?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      bffFetch<FilaAtendimentoConsultantsResponse>(
        `/api/admin/modules/fila-atendimento/consultants?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      bffFetch<ReportsOverviewResponse>(
        `/api/admin/modules/fila-atendimento/reports-overview?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      bffFetch<ReportsRecentServicesResponse>(
        `/api/admin/modules/fila-atendimento/reports-recent-services?storeId=${encodeURIComponent(normalizedStoreId)}&page=1&pageSize=6`
      ),
      bffFetch<ReportsResultsResponse>(
        `/api/admin/modules/fila-atendimento/reports-results?storeId=${encodeURIComponent(normalizedStoreId)}&page=1&pageSize=4`
      ),
      bffFetch<AnalyticsRankingResponse>(
        `/api/admin/modules/fila-atendimento/analytics-ranking?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      bffFetch<AnalyticsDataResponse>(
        `/api/admin/modules/fila-atendimento/analytics-data?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      bffFetch<AnalyticsIntelligenceResponse>(
        `/api/admin/modules/fila-atendimento/analytics-intelligence?storeId=${encodeURIComponent(normalizedStoreId)}`
      ),
      options.includeSettings === false
        ? Promise.resolve(settingsBundle.value)
        : bffFetch<FilaAtendimentoSettingsResponse>(
            `/api/admin/modules/fila-atendimento/settings?storeId=${encodeURIComponent(normalizedStoreId)}`
          )
    ])

    snapshot.value = nextSnapshot
    consultants.value = nextConsultants.consultants || []
    reportsOverview.value = nextReportsOverview
    recentServices.value = nextRecentServices
    reportsResults.value = nextReportsResults
    analyticsRanking.value = nextAnalyticsRanking
    analyticsData.value = nextAnalyticsData
    analyticsIntelligence.value = nextAnalyticsIntelligence
    if (options.includeSettings !== false) {
      settingsBundle.value = nextSettingsBundle
    }
  } catch (error) {
    snapshot.value = null
    consultants.value = []
    reportsOverview.value = null
    recentServices.value = null
    reportsResults.value = null
    analyticsRanking.value = null
    analyticsData.value = null
    analyticsIntelligence.value = null
    if (options.includeSettings !== false) {
      settingsBundle.value = null
    }
    sessionErrorMessage.value = normalizeErrorMessage(error, 'Não foi possível carregar a operação hospedada.')
  } finally {
    workspacePending.value = false
  }
}

async function loadModuleContext() {
  workspacePending.value = true
  sessionErrorMessage.value = ''

  try {
    const response = await bffFetch<FilaAtendimentoContextResponse>('/api/admin/modules/fila-atendimento/context')
    moduleContext.value = response

    const nextStoreId = String(
      response?.context?.activeStoreId ||
      response?.context?.stores?.[0]?.id ||
      ''
    ).trim()

    selectedStoreId.value = nextStoreId
    if (nextStoreId) {
      await loadOperationalWorkspace(nextStoreId)
    } else {
      snapshot.value = null
      consultants.value = []
      reportsOverview.value = null
      recentServices.value = null
      reportsResults.value = null
      analyticsRanking.value = null
      analyticsData.value = null
      analyticsIntelligence.value = null
      settingsBundle.value = null
    }
  } catch (error) {
    moduleContext.value = null
    snapshot.value = null
    consultants.value = []
    reportsOverview.value = null
    recentServices.value = null
    reportsResults.value = null
    analyticsRanking.value = null
    analyticsData.value = null
    analyticsIntelligence.value = null
    settingsBundle.value = null
    sessionErrorMessage.value = normalizeErrorMessage(error, 'Não foi possível carregar a sessão do módulo.')
  } finally {
    workspacePending.value = false
  }
}

async function connectModule(bridgeToken = '') {
  sessionPending.value = true
  sessionErrorMessage.value = ''

  try {
    await bffFetch('/api/admin/modules/fila-atendimento/session', {
      method: 'POST',
      body: bridgeToken ? { bridgeToken } : {}
    })

    await loadModuleContext()
  } catch (error) {
    moduleContext.value = null
    snapshot.value = null
    consultants.value = []
    reportsOverview.value = null
    recentServices.value = null
    reportsResults.value = null
    analyticsRanking.value = null
    analyticsData.value = null
    analyticsIntelligence.value = null
    settingsBundle.value = null
    sessionErrorMessage.value = normalizeErrorMessage(error, 'Não foi possível iniciar a sessão do módulo.')
  } finally {
    sessionPending.value = false
  }
}

async function refreshAll() {
  await loadBootstrap()

  if (sessionReady.value) {
    await loadModuleContext()
  }
}

async function handleStoreChange(value: string) {
  selectedStoreId.value = String(value || '').trim()
  await loadOperationalWorkspace(selectedStoreId.value)
}

async function bootstrapModuleHost() {
  await loadBootstrap()

  const bridgeToken = String(route.query.shellBridgeToken || '').trim()
  if (bridgeToken) {
    await connectModule(bridgeToken)

    const nextQuery = { ...route.query }
    delete nextQuery.shellBridgeToken
    await router.replace({ query: nextQuery })
    return
  }

  await loadModuleContext()
}

function buildRealtimeSocketUrl(path: string, ticket: string) {
  const target = new URL(path, window.location.origin)
  if (target.protocol === 'http:') {
    target.protocol = 'ws:'
  } else if (target.protocol === 'https:') {
    target.protocol = 'wss:'
  }

  target.searchParams.set('ticket', ticket)
  return target.toString()
}

function parseRealtimeEvent(raw: unknown) {
  if (typeof raw === 'string') {
    const normalized = raw.trim()
    if (!normalized) {
      return null
    }

    try {
      return JSON.parse(normalized) as FilaAtendimentoRealtimeEvent
    } catch {
      return null
    }
  }

  if (raw && typeof raw === 'object') {
    return raw as FilaAtendimentoRealtimeEvent
  }

  return null
}

function clearOperationsReconnectTimer() {
  if (operationsReconnectTimer) {
    clearTimeout(operationsReconnectTimer)
    operationsReconnectTimer = null
  }
}

function clearContextReconnectTimer() {
  if (contextReconnectTimer) {
    clearTimeout(contextReconnectTimer)
    contextReconnectTimer = null
  }
}

function disconnectOperationsRealtime(options: { resetStatus?: boolean, resetAttempts?: boolean } = {}) {
  clearOperationsReconnectTimer()
  if (options.resetAttempts !== false) {
    operationsReconnectAttempts = 0
  }
  operationsConnectionKey = ''

  if (operationsSocket) {
    const currentSocket = operationsSocket
    operationsSocket = null
    operationsIntentionalClose = true
    currentSocket.close()
  }

  if (options.resetStatus !== false) {
    operationsRealtimeStatus.value = 'idle'
  }
}

function disconnectContextRealtime(options: { resetStatus?: boolean, resetAttempts?: boolean } = {}) {
  clearContextReconnectTimer()
  if (options.resetAttempts !== false) {
    contextReconnectAttempts = 0
  }
  contextConnectionKey = ''

  if (contextSocket) {
    const currentSocket = contextSocket
    contextSocket = null
    contextIntentionalClose = true
    currentSocket.close()
  }

  if (options.resetStatus !== false) {
    contextRealtimeStatus.value = 'idle'
  }
}

async function queueRealtimeWorkspaceRefresh(storeId = selectedStoreId.value) {
  const normalizedStoreId = String(storeId || '').trim()
  if (!normalizedStoreId || !sessionReady.value) {
    return
  }

  if (realtimeWorkspaceRefreshPromise) {
    realtimeWorkspaceRefreshQueued = true
    return realtimeWorkspaceRefreshPromise
  }

  realtimeWorkspaceRefreshPromise = loadOperationalWorkspace(normalizedStoreId, {
    includeSettings: false
  })
    .catch(() => undefined)
    .finally(async () => {
      realtimeWorkspaceRefreshPromise = null

      if (realtimeWorkspaceRefreshQueued) {
        realtimeWorkspaceRefreshQueued = false
        await queueRealtimeWorkspaceRefresh(selectedStoreId.value)
      }
    })

  return realtimeWorkspaceRefreshPromise
}

function scheduleOperationsReconnect() {
  clearOperationsReconnectTimer()

  const normalizedStoreId = String(selectedStoreId.value || '').trim()
  if (!sessionReady.value || !normalizedStoreId) {
    operationsRealtimeStatus.value = 'idle'
    return
  }

  operationsRealtimeStatus.value = 'reconnecting'
  const delayMs = Math.min(10000, 1000 * Math.max(1, 2 ** operationsReconnectAttempts))
  operationsReconnectTimer = setTimeout(() => {
    operationsReconnectTimer = null
    void connectOperationsRealtime()
  }, delayMs)
}

function scheduleContextReconnect() {
  clearContextReconnectTimer()

  const normalizedTenantId = moduleTenantId.value
  if (!sessionReady.value || !normalizedTenantId) {
    contextRealtimeStatus.value = 'idle'
    return
  }

  contextRealtimeStatus.value = 'reconnecting'
  const delayMs = Math.min(10000, 1000 * Math.max(1, 2 ** contextReconnectAttempts))
  contextReconnectTimer = setTimeout(() => {
    contextReconnectTimer = null
    void connectContextRealtime()
  }, delayMs)
}

async function connectOperationsRealtime() {
  if (import.meta.server) {
    return
  }

  const normalizedStoreId = String(selectedStoreId.value || '').trim()
  if (!sessionReady.value || !normalizedStoreId) {
    disconnectOperationsRealtime()
    return
  }

  const nextConnectionKey = normalizedStoreId
  if (
    operationsSocket
    && operationsConnectionKey === nextConnectionKey
    && operationsSocket.readyState <= WebSocket.OPEN
  ) {
    return
  }

  disconnectOperationsRealtime({ resetStatus: false, resetAttempts: false })
  operationsIntentionalClose = false
  operationsRealtimeStatus.value = operationsReconnectAttempts > 0 ? 'reconnecting' : 'connecting'
  realtimeErrorMessage.value = ''

  try {
    const response = await bffFetch<RealtimeTicketResponse>('/api/admin/modules/fila-atendimento/realtime-ticket', {
      method: 'POST',
      body: {
        topic: 'operations',
        storeId: normalizedStoreId
      }
    })

    if (!sessionReady.value || String(selectedStoreId.value || '').trim() !== normalizedStoreId) {
      return
    }

    const nextSocket = new WebSocket(buildRealtimeSocketUrl('/ws/fila-atendimento/operations', response.ticket))
    operationsSocket = nextSocket
    operationsConnectionKey = nextConnectionKey

    nextSocket.addEventListener('open', () => {
      if (operationsSocket !== nextSocket) {
        return
      }

      operationsReconnectAttempts = 0
      operationsRealtimeStatus.value = 'connected'
    })

    nextSocket.addEventListener('message', (message) => {
      const payload = parseRealtimeEvent(message.data)
      if (!payload) {
        return
      }

      lastRealtimeEventAt.value = new Date().toISOString()

      if (payload.type === 'bridge.error') {
        realtimeErrorMessage.value = String(payload.message || 'Falha no bridge realtime da operação.').trim()
        operationsRealtimeStatus.value = 'error'
        return
      }

      if (payload.type !== 'operation.updated') {
        return
      }

      const payloadStoreId = String(payload.storeId || '').trim()
      if (payloadStoreId && payloadStoreId !== String(selectedStoreId.value || '').trim()) {
        return
      }

      void queueRealtimeWorkspaceRefresh(payloadStoreId || normalizedStoreId)
    })

    nextSocket.addEventListener('close', () => {
      if (operationsSocket !== nextSocket) {
        return
      }

      operationsSocket = null
      operationsConnectionKey = ''

      if (operationsIntentionalClose) {
        operationsIntentionalClose = false
        operationsRealtimeStatus.value = 'idle'
        return
      }

      operationsReconnectAttempts += 1
      scheduleOperationsReconnect()
    })

    nextSocket.addEventListener('error', () => {
      if (operationsSocket !== nextSocket) {
        return
      }

      operationsRealtimeStatus.value = 'error'
    })
  } catch (error) {
    realtimeErrorMessage.value = normalizeErrorMessage(error, 'Não foi possível iniciar o bridge realtime da operação.')
    operationsRealtimeStatus.value = 'error'
    operationsReconnectAttempts += 1
    scheduleOperationsReconnect()
  }
}

async function connectContextRealtime() {
  if (import.meta.server) {
    return
  }

  const normalizedTenantId = moduleTenantId.value
  if (!sessionReady.value || !normalizedTenantId) {
    disconnectContextRealtime()
    return
  }

  const nextConnectionKey = normalizedTenantId
  if (
    contextSocket
    && contextConnectionKey === nextConnectionKey
    && contextSocket.readyState <= WebSocket.OPEN
  ) {
    return
  }

  disconnectContextRealtime({ resetStatus: false, resetAttempts: false })
  contextIntentionalClose = false
  contextRealtimeStatus.value = contextReconnectAttempts > 0 ? 'reconnecting' : 'connecting'
  realtimeErrorMessage.value = ''

  try {
    const response = await bffFetch<RealtimeTicketResponse>('/api/admin/modules/fila-atendimento/realtime-ticket', {
      method: 'POST',
      body: {
        topic: 'context',
        tenantId: normalizedTenantId
      }
    })

    if (!sessionReady.value || moduleTenantId.value !== normalizedTenantId) {
      return
    }

    const nextSocket = new WebSocket(buildRealtimeSocketUrl('/ws/fila-atendimento/context', response.ticket))
    contextSocket = nextSocket
    contextConnectionKey = nextConnectionKey

    nextSocket.addEventListener('open', () => {
      if (contextSocket !== nextSocket) {
        return
      }

      contextReconnectAttempts = 0
      contextRealtimeStatus.value = 'connected'
    })

    nextSocket.addEventListener('message', (message) => {
      const payload = parseRealtimeEvent(message.data)
      if (!payload) {
        return
      }

      lastRealtimeEventAt.value = new Date().toISOString()

      if (payload.type === 'bridge.error') {
        realtimeErrorMessage.value = String(payload.message || 'Falha no bridge realtime de contexto.').trim()
        contextRealtimeStatus.value = 'error'
        return
      }

      if (payload.type !== 'context.updated') {
        return
      }

      const payloadTenantId = String(payload.tenantId || '').trim()
      if (payloadTenantId && payloadTenantId !== moduleTenantId.value) {
        return
      }

      void loadModuleContext()
    })

    nextSocket.addEventListener('close', () => {
      if (contextSocket !== nextSocket) {
        return
      }

      contextSocket = null
      contextConnectionKey = ''

      if (contextIntentionalClose) {
        contextIntentionalClose = false
        contextRealtimeStatus.value = 'idle'
        return
      }

      contextReconnectAttempts += 1
      scheduleContextReconnect()
    })

    nextSocket.addEventListener('error', () => {
      if (contextSocket !== nextSocket) {
        return
      }

      contextRealtimeStatus.value = 'error'
    })
  } catch (error) {
    realtimeErrorMessage.value = normalizeErrorMessage(error, 'Não foi possível iniciar o bridge realtime de contexto.')
    contextRealtimeStatus.value = 'error'
    contextReconnectAttempts += 1
    scheduleContextReconnect()
  }
}

function syncRealtimeConnections() {
  if (import.meta.server) {
    return
  }

  if (!sessionReady.value) {
    disconnectOperationsRealtime()
    disconnectContextRealtime()
    return
  }

  void connectOperationsRealtime()
  void connectContextRealtime()
}

onMounted(() => {
  now.value = Date.now()
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)

  realtimeStopWatcher = watch(
    [
      () => sessionReady.value,
      () => selectedStoreId.value,
      () => moduleTenantId.value
    ],
    () => {
      syncRealtimeConnections()
    },
    { immediate: true }
  )

  void bootstrapModuleHost()
})

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
  }

  if (typeof realtimeStopWatcher === 'function') {
    realtimeStopWatcher()
    realtimeStopWatcher = null
  }

  disconnectOperationsRealtime()
  disconnectContextRealtime()
})
</script>

<template>
  <section class="fila-module">
    <div class="fila-module__hero">
      <div>
        <p class="fila-module__eyebrow">Operação hospedada</p>
        <h1 class="fila-module__title">Fila de Atendimento</h1>
        <p class="fila-module__text">
          A rota do painel agora mostra a operação hospedada com fila, atendimentos, consultores e contexto real de loja,
          usando a sessão SSO do shell e o backend já validado no host Go.
        </p>
      </div>

      <div class="fila-module__actions">
        <UButton
          icon="i-lucide-plug-zap"
          :loading="sessionPending"
          @click="connectModule()"
        >
          {{ sessionReady ? 'Reconectar módulo' : 'Conectar módulo' }}
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="pending || workspacePending"
          @click="refreshAll()"
        >
          Atualizar visão
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      title="Falha ao carregar o host do módulo"
      :description="errorMessage"
    />

    <UAlert
      v-if="sessionErrorMessage"
      color="warning"
      variant="soft"
      title="Falha na sessão do módulo"
      :description="sessionErrorMessage"
    />

    <UAlert
      v-if="realtimeErrorMessage"
      color="warning"
      variant="soft"
      title="Bridge realtime do módulo"
      :description="realtimeErrorMessage"
    />

    <div class="fila-module__workspace">
      <UCard class="fila-module__workspace-card fila-module__workspace-card--controls">
        <template #header>
          <div class="fila-module__card-header">
            <div>
              <p class="fila-module__card-kicker">Sessão ativa</p>
              <h2 class="fila-module__card-title">Contexto operacional</h2>
            </div>
            <div class="fila-module__bridge-status">
              <UBadge :color="sessionReady ? 'success' : 'neutral'" variant="soft">
                {{ sessionReady ? 'Sessão conectada' : 'Sessão pendente' }}
              </UBadge>
              <UBadge :color="realtimeBadgeColor(operationsRealtimeStatus)" variant="soft">
                Operação realtime: {{ realtimeStatusLabel(operationsRealtimeStatus) }}
              </UBadge>
              <UBadge :color="realtimeBadgeColor(contextRealtimeStatus)" variant="soft">
                Contexto realtime: {{ realtimeStatusLabel(contextRealtimeStatus) }}
              </UBadge>
            </div>
          </div>
        </template>

        <div class="fila-module__controls-grid">
          <div class="fila-module__control-copy">
            <p class="fila-module__control-label">Usuário do módulo</p>
            <strong>{{ currentUserLabel }}</strong>
            <span class="fila-module__control-subtle">{{ moduleContext?.principal?.role || 'sem perfil local' }}</span>
          </div>

          <div class="fila-module__control-copy">
            <p class="fila-module__control-label">Loja ativa</p>
            <strong>{{ selectedStore?.name || 'não resolvida' }}</strong>
            <span class="fila-module__control-subtle">{{ selectedStore?.code || 'sem código' }}{{ selectedStore?.city ? ` • ${selectedStore.city}` : '' }}</span>
          </div>

          <div class="fila-module__control-copy">
            <p class="fila-module__control-label">Bridge hospedado</p>
            <strong>{{ bridgeConnected ? 'Eventos em fluxo' : 'Aguardando conexão' }}</strong>
            <span class="fila-module__control-subtle">Tenant ativo: {{ activeTenantLabel }}</span>
            <span class="fila-module__control-subtle">Último evento: {{ lastRealtimeEventLabel }}</span>
          </div>

          <USelect
            v-if="storeOptions.length"
            :model-value="selectedStoreId"
            :items="storeOptions"
            class="fila-module__store-select"
            @update:model-value="handleStoreChange"
          />
        </div>
      </UCard>

      <div class="fila-module__summary-grid">
        <UCard class="fila-summary-card">
          <span class="fila-summary-card__label">Fila aguardando</span>
          <strong class="fila-summary-card__value">{{ waitingCount }}</strong>
        </UCard>
        <UCard class="fila-summary-card">
          <span class="fila-summary-card__label">Em atendimento</span>
          <strong class="fila-summary-card__value">{{ activeCount }}</strong>
        </UCard>
        <UCard class="fila-summary-card">
          <span class="fila-summary-card__label">Pausados</span>
          <strong class="fila-summary-card__value">{{ pausedCount }}</strong>
        </UCard>
        <UCard class="fila-summary-card">
          <span class="fila-summary-card__label">Histórico carregado</span>
          <strong class="fila-summary-card__value">{{ historyCount }}</strong>
        </UCard>
      </div>

      <div v-if="workspacePending" class="fila-empty-state">
        <strong>Carregando a operação hospedada...</strong>
        <p>Sincronizando fila, atendimentos e consultores da loja ativa.</p>
      </div>

      <div v-else-if="!sessionReady" class="fila-empty-state">
        <strong>Conecte o módulo para abrir a operação.</strong>
        <p>A conexão usa o bridge SSO do shell e prepara a sessão local do módulo.</p>
      </div>

      <template v-else>
        <div class="fila-board-grid">
          <section class="fila-board-column">
            <header class="fila-board-column__header">
              <span>Lista da vez</span>
              <UBadge color="warning" variant="soft">{{ waitingCount }}</UBadge>
            </header>

            <div v-if="waitingList.length" class="fila-board-column__stack">
              <article
                v-for="(person, index) in waitingList"
                :key="person.id"
                class="fila-queue-card"
              >
                <div class="fila-queue-card__lead">
                  <span class="fila-queue-card__position">{{ index + 1 }}</span>
                  <span class="fila-queue-card__avatar" :style="{ '--avatar-accent': person.color || '#38bdf8' }">
                    {{ person.initials || person.name?.slice(0, 2) }}
                  </span>
                </div>

                <div class="fila-queue-card__body">
                  <strong>{{ person.name }}</strong>
                  <span>{{ person.role || 'Consultor' }}</span>
                </div>

                <div class="fila-queue-card__meta">
                  <UBadge :color="index === 0 ? 'primary' : 'neutral'" variant="soft">
                    {{ index === 0 ? 'Na vez' : 'Na fila' }}
                  </UBadge>
                  <span>{{ formatElapsed(person.queueJoinedAt) }}</span>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty">
              <strong>Fila vazia</strong>
              <p>Quando alguém entrar na lista, o card aparece aqui imediatamente.</p>
            </div>
          </section>

          <section class="fila-board-column">
            <header class="fila-board-column__header">
              <span>Em atendimento</span>
              <UBadge color="success" variant="soft">{{ activeCount }}</UBadge>
            </header>

            <div v-if="activeServices.length" class="fila-board-column__stack">
              <article
                v-for="service in activeServices"
                :key="service.serviceId"
                class="fila-service-card"
              >
                <div class="fila-service-card__top">
                  <div>
                    <strong>{{ service.name }}</strong>
                    <p>{{ service.role || 'Consultor' }}</p>
                  </div>
                  <UBadge color="success" variant="soft">{{ startModeLabel(service.startMode) }}</UBadge>
                </div>

                <div class="fila-service-card__metrics">
                  <div>
                    <span>Duração</span>
                    <strong>{{ formatElapsed(service.serviceStartedAt) }}</strong>
                  </div>
                  <div>
                    <span>Espera</span>
                    <strong>{{ formatWaitTime(service.queueWaitMs) }}</strong>
                  </div>
                  <div>
                    <span>Posição inicial</span>
                    <strong>#{{ service.queuePositionAtStart || 1 }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty">
              <strong>Nenhum atendimento em andamento</strong>
              <p>Assim que um consultor iniciar um atendimento, a duração fica visível aqui.</p>
            </div>
          </section>

          <section class="fila-board-column">
            <header class="fila-board-column__header">
              <span>Pausas e tarefas</span>
              <UBadge :color="pausedCount ? 'error' : 'neutral'" variant="soft">{{ pausedCount }}</UBadge>
            </header>

            <div v-if="pausedEmployees.length" class="fila-board-column__stack">
              <article
                v-for="paused in pausedEmployees"
                :key="paused.personId"
                class="fila-paused-card"
              >
                <div>
                  <strong>
                    {{ roster.find(item => item.id === paused.personId)?.name || paused.personId }}
                  </strong>
                  <p>{{ paused.reason || 'Sem motivo informado' }}</p>
                </div>
                <div class="fila-paused-card__meta">
                  <UBadge :color="String(paused.kind || '').trim() === 'assignment' ? 'warning' : 'error'" variant="soft">
                    {{ String(paused.kind || '').trim() === 'assignment' ? 'Em tarefa' : 'Pausado' }}
                  </UBadge>
                  <span>{{ formatElapsed(paused.startedAt) }}</span>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty">
              <strong>Nenhuma pausa registrada</strong>
              <p>As pausas e deslocamentos temporários da operação aparecem nessa coluna.</p>
            </div>
          </section>
        </div>

        <UCard class="fila-module__workspace-card fila-module__workspace-card--wide">
          <template #header>
            <div class="fila-module__card-header">
              <div>
                <p class="fila-module__card-kicker">Consultores</p>
                <h2 class="fila-module__card-title">Barra operacional da loja</h2>
              </div>
              <span class="fila-module__control-subtle">Leitura em tempo real do estado hospedado</span>
            </div>
          </template>

          <div v-if="roster.length" class="fila-roster-grid">
            <article
              v-for="consultant in roster"
              :key="consultant.id"
              class="fila-roster-card"
              :class="`fila-roster-card--${consultant.statusKey}`"
            >
              <div class="fila-roster-card__identity">
                <span class="fila-roster-card__avatar" :style="{ '--avatar-accent': consultant.color || '#38bdf8' }">
                  {{ consultant.initials || consultant.name?.slice(0, 2) }}
                </span>

                <div>
                  <strong>{{ consultant.name }}</strong>
                  <p>{{ consultant.role || 'Consultor' }}</p>
                </div>
              </div>

              <div class="fila-roster-card__footer">
                <UBadge :color="statusBadgeColor(consultant.statusKey)" variant="soft">
                  {{ consultant.statusLabel }}
                </UBadge>
                <span v-if="consultant.pauseReason">{{ consultant.pauseReason }}</span>
                <span v-else>{{ consultant.statusStartedAt ? formatElapsed(consultant.statusStartedAt) : 'sem transição recente' }}</span>
              </div>
            </article>
          </div>

          <div v-else class="fila-column-empty fila-column-empty--inline">
            <strong>Nenhum consultor carregado</strong>
            <p>Quando a lista de consultores da loja estiver disponível, ela aparece aqui com o status atual.</p>
          </div>
        </UCard>

        <div class="fila-insights-grid">
          <UCard class="fila-module__workspace-card">
            <template #header>
              <div class="fila-module__card-header">
                <div>
                  <p class="fila-module__card-kicker">Reports</p>
                  <h2 class="fila-module__card-title">Relatórios hospedados</h2>
                </div>
                <UBadge color="primary" variant="soft">
                  {{ formatCompactNumber(reportsOverview?.metrics?.totalAttendances || 0) }} atendimentos
                </UBadge>
              </div>
            </template>

            <div class="fila-mini-metric-grid">
              <article class="fila-mini-metric">
                <span>Total</span>
                <strong>{{ formatCompactNumber(reportsOverview?.metrics?.totalAttendances || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Conversão</span>
                <strong>{{ formatPercent(reportsOverview?.metrics?.conversionRate || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Venda fechada</span>
                <strong>{{ formatCurrency(reportsOverview?.metrics?.soldValue || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Ticket médio</span>
                <strong>{{ formatCurrency(reportsOverview?.metrics?.averageTicket || 0) }}</strong>
              </article>
            </div>

            <div v-if="(reportsOverview?.chartData?.consultantAgg || []).length" class="fila-list-stack">
              <article
                v-for="item in reportsOverview?.chartData?.consultantAgg?.slice(0, 4) || []"
                :key="item.consultantId || item.consultantName"
                class="fila-list-row"
              >
                <div>
                  <strong>{{ item.consultantName || 'Consultor sem nome' }}</strong>
                  <p>{{ formatCompactNumber(item.attendances || 0) }} atendimentos</p>
                </div>
                <div class="fila-list-end">
                  <span>{{ formatPercent(item.conversionRate || ((item.attendances || 0) > 0 ? ((item.conversions || 0) / (item.attendances || 1)) * 100 : 0)) }}</span>
                  <strong>{{ formatCurrency(item.saleAmount || 0) }}</strong>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Relatórios ainda sem volume</strong>
              <p>Assim que a loja registrar atendimentos concluídos, os agregados aparecem aqui.</p>
            </div>

            <div class="fila-section-divider" />

            <div v-if="recentServiceItems.length" class="fila-list-stack">
              <article
                v-for="item in recentServiceItems"
                :key="item.serviceId || `${item.customerName}-${item.finishedAt}`"
                class="fila-list-row"
              >
                <div>
                  <strong>{{ item.customerName || item.consultantName || 'Atendimento sem cliente' }}</strong>
                  <p>{{ item.consultantName || 'Consultor não identificado' }} • {{ formatOutcomeLabel(String(item.outcome || '')) }}</p>
                </div>
                <div class="fila-list-end">
                  <strong>{{ item.saleAmount ? formatCurrency(item.saleAmount) : 'Sem venda' }}</strong>
                  <span>{{ formatDateTime(Number(item.finishedAt || 0)) }}</span>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Nenhum atendimento recente</strong>
              <p>Os últimos fechamentos do dia passam a aparecer aqui assim que a operação gerar histórico.</p>
            </div>

            <div class="fila-section-divider" />

            <div v-if="reportResultRows.length" class="fila-list-stack">
              <p class="fila-module__control-label">Resultados detalhados</p>
              <article
                v-for="row in reportResultRows"
                :key="row.serviceId || `${row.customerName}-${row.finishedAt}`"
                class="fila-list-row"
              >
                <div>
                  <strong>{{ row.customerName || row.consultantName || 'Fechamento sem cliente' }}</strong>
                  <p>
                    {{ row.consultantName || 'Consultor não identificado' }} • {{ formatOutcomeLabel(String(row.outcome || '')) }}
                    {{ row.productClosed ? ` • ${row.productClosed}` : '' }}
                  </p>
                </div>
                <div class="fila-list-end">
                  <strong>{{ row.saleAmount ? formatCurrency(row.saleAmount) : 'Sem venda' }}</strong>
                  <span>{{ formatWaitTime(row.durationMs || 0) }} • {{ formatCompletionLevel(String(row.completionLevel || '')) }}</span>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Sem resultados detalhados</strong>
              <p>Quando houver fechamentos completos, os últimos detalhes aparecem aqui com duração e checklist.</p>
            </div>
          </UCard>

          <UCard class="fila-module__workspace-card">
            <template #header>
              <div class="fila-module__card-header">
                <div>
                  <p class="fila-module__card-kicker">Analytics</p>
                  <h2 class="fila-module__card-title">Inteligência operacional</h2>
                </div>
                <UBadge color="success" variant="soft">
                  Score {{ formatCompactNumber(analyticsIntelligence?.healthScore || 0) }}
                </UBadge>
              </div>
            </template>

            <div class="fila-mini-metric-grid">
              <article class="fila-mini-metric">
                <span>Saúde operacional</span>
                <strong>{{ formatCompactNumber(analyticsIntelligence?.healthScore || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Conversão</span>
                <strong>{{ formatPercent(analyticsIntelligence?.conversionRate || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Ticket médio</span>
                <strong>{{ formatCurrency(analyticsIntelligence?.ticketAverage || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Espera média</span>
                <strong>{{ formatWaitTime(analyticsIntelligence?.time?.avgQueueWaitMs || 0) }}</strong>
              </article>
            </div>

            <div v-if="rankingRows.length" class="fila-list-stack">
              <article
                v-for="row in rankingRows"
                :key="row.consultantId || row.consultantName"
                class="fila-list-row"
              >
                <div>
                  <strong>{{ row.consultantName || 'Consultor sem nome' }}</strong>
                  <p>{{ formatCompactNumber(row.attendances || 0) }} atendimentos • PA {{ formatCompactNumber(row.paScore || 0) }}</p>
                </div>
                <div class="fila-list-end">
                  <span>{{ formatPercent(row.conversionRate || 0) }}</span>
                  <strong>{{ formatCurrency(row.soldValue || 0) }}</strong>
                </div>
              </article>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Ranking indisponível</strong>
              <p>O ranking mensal e diário será mostrado assim que houver amostra suficiente de atendimentos.</p>
            </div>

            <div class="fila-section-divider" />

            <div v-if="diagnosisItems.length || analyticsAlerts.length" class="fila-diagnosis-list">
              <article
                v-for="item in diagnosisItems"
                :key="item.id || item.title"
                class="fila-diagnosis-card"
              >
                <strong>{{ item.title || 'Diagnóstico operacional' }}</strong>
                <p>{{ item.reading || item.hypothesis || 'Sem leitura adicional.' }}</p>
                <span>{{ item.action || 'Sem ação recomendada.' }}</span>
              </article>

              <article
                v-for="alert in analyticsAlerts"
                :key="`${alert.consultantId}-${alert.type}`"
                class="fila-diagnosis-card fila-diagnosis-card--alert"
              >
                <strong>{{ alert.consultantName || 'Consultor' }} • {{ alert.type || 'alerta' }}</strong>
                <p>Valor atual {{ formatPercent(alert.value || 0) }}</p>
                <span>Limiar {{ formatPercent(alert.threshold || 0) }}</span>
              </article>
            </div>

            <div v-else-if="recommendedActions.length" class="fila-diagnosis-list">
              <article
                v-for="action in recommendedActions"
                :key="action"
                class="fila-diagnosis-card"
              >
                <strong>Ação recomendada</strong>
                <p>{{ action }}</p>
                <span>Priorizar este ajuste na operação ativa.</span>
              </article>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Nenhum insight crítico no momento</strong>
              <p>Quando o analytics identificar risco ou oportunidade, ele aparece aqui.</p>
            </div>

            <div class="fila-section-divider" />

            <div v-if="analyticsDataAvailable">
              <p class="fila-module__control-label">Distribuição capturada</p>

              <div class="fila-mini-metric-grid">
                <article class="fila-mini-metric">
                  <span>Fechamento rápido</span>
                  <strong>{{ formatCompactNumber(analyticsData?.timeIntelligence?.quickHighPotentialCount || 0) }}</strong>
                </article>
                <article class="fila-mini-metric">
                  <span>Longo e baixo</span>
                  <strong>{{ formatCompactNumber(analyticsData?.timeIntelligence?.longLowSaleCount || 0) }}</strong>
                </article>
                <article class="fila-mini-metric">
                  <span>Longo sem venda</span>
                  <strong>{{ formatCompactNumber(analyticsData?.timeIntelligence?.longNoSaleCount || 0) }}</strong>
                </article>
                <article class="fila-mini-metric">
                  <span>Sem fila</span>
                  <strong>{{ formatPercent(analyticsData?.timeIntelligence?.notUsingQueueRate || 0) }}</strong>
                </article>
              </div>

              <div v-if="analyticsOutcomeSummary.length" class="fila-list-stack">
                <article
                  v-for="item in analyticsOutcomeSummary"
                  :key="item.label || 'outcome-summary'"
                  class="fila-list-row"
                >
                  <div>
                    <strong>{{ item.label || 'Desfecho' }}</strong>
                    <p>Volume consolidado do período</p>
                  </div>
                  <div class="fila-list-end">
                    <strong>{{ formatCompactNumber(item.count || 0) }}</strong>
                    <span>{{ selectedStore?.name || 'Loja ativa' }}</span>
                  </div>
                </article>
              </div>

              <div v-if="analyticsSoldProducts.length || analyticsHourlySales.length" class="fila-list-stack">
                <article
                  v-for="item in analyticsSoldProducts"
                  :key="`produto-${item.label}`"
                  class="fila-list-row"
                >
                  <div>
                    <strong>{{ item.label || 'Produto' }}</strong>
                    <p>Produto mais fechado pela operação</p>
                  </div>
                  <div class="fila-list-end">
                    <strong>{{ formatCompactNumber(item.count || 0) }}</strong>
                    <span>fechamentos</span>
                  </div>
                </article>

                <article
                  v-for="slot in analyticsHourlySales"
                  :key="`hora-${slot.label}`"
                  class="fila-list-row"
                >
                  <div>
                    <strong>{{ slot.label || 'Faixa horária' }}</strong>
                    <p>{{ formatCompactNumber(slot.count || 0) }} vendas registradas</p>
                  </div>
                  <div class="fila-list-end">
                    <strong>{{ formatCurrency(slot.value || 0) }}</strong>
                    <span>valor vendido</span>
                  </div>
                </article>
              </div>

              <div v-if="analyticsVisitReasons.length || analyticsCustomerSources.length" class="fila-tag-cloud">
                <span
                  v-for="item in analyticsVisitReasons"
                  :key="`motivo-${item.label}`"
                  class="fila-tag-cloud__item"
                >
                  {{ item.label || 'Motivo' }} • {{ formatCompactNumber(item.count || 0) }}
                </span>
                <span
                  v-for="item in analyticsCustomerSources"
                  :key="`origem-${item.label}`"
                  class="fila-tag-cloud__item"
                >
                  {{ item.label || 'Origem' }} • {{ formatCompactNumber(item.count || 0) }}
                </span>
              </div>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Sem distribuição analítica</strong>
              <p>Os cortes por produto, horário e origem aparecem aqui assim que a loja acumular histórico suficiente.</p>
            </div>
          </UCard>

          <UCard class="fila-module__workspace-card">
            <template #header>
              <div class="fila-module__card-header">
                <div>
                  <p class="fila-module__card-kicker">Settings</p>
                  <h2 class="fila-module__card-title">Configuração ativa da loja</h2>
                </div>
                <UBadge color="neutral" variant="soft">
                  {{ selectedTemplate?.label || 'Template manual' }}
                </UBadge>
              </div>
            </template>

            <div class="fila-mini-metric-grid">
              <article class="fila-mini-metric">
                <span>Concorrência máxima</span>
                <strong>{{ formatCompactNumber(settingsBundle?.settings?.maxConcurrentServices || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Meta mínima conv.</span>
                <strong>{{ formatPercent(settingsBundle?.settings?.alertMinConversionRate || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Ticket mínimo</span>
                <strong>{{ formatCurrency(settingsBundle?.settings?.alertMinTicketAverage || 0) }}</strong>
              </article>
              <article class="fila-mini-metric">
                <span>Fila fora da vez</span>
                <strong>{{ formatPercent(settingsBundle?.settings?.alertMaxQueueJumpRate || 0) }}</strong>
              </article>
            </div>

            <div class="fila-settings-summary">
              <article class="fila-settings-stat">
                <span>Produtos do catálogo</span>
                <strong>{{ formatCompactNumber(settingsBundle?.productCatalog?.length || 0) }}</strong>
              </article>
              <article class="fila-settings-stat">
                <span>Motivos de visita</span>
                <strong>{{ formatCompactNumber(settingsBundle?.visitReasonOptions?.length || 0) }}</strong>
              </article>
              <article class="fila-settings-stat">
                <span>Origens de cliente</span>
                <strong>{{ formatCompactNumber(settingsBundle?.customerSourceOptions?.length || 0) }}</strong>
              </article>
              <article class="fila-settings-stat">
                <span>Profissões</span>
                <strong>{{ formatCompactNumber(settingsBundle?.professionOptions?.length || 0) }}</strong>
              </article>
            </div>

            <div v-if="(settingsBundle?.productCatalog || []).length" class="fila-tag-cloud">
              <span
                v-for="product in settingsBundle?.productCatalog?.slice(0, 6) || []"
                :key="product.id || product.name"
                class="fila-tag-cloud__item"
              >
                {{ product.name || 'Produto' }}
              </span>
            </div>

            <div v-else class="fila-column-empty fila-column-empty--inline">
              <strong>Sem catálogo publicado</strong>
              <p>O resumo das opções e produtos da loja será exibido aqui quando houver configuração ativa.</p>
            </div>
          </UCard>
        </div>

        <details class="fila-debug-card">
          <summary>Diagnóstico do host e contratos</summary>

          <div class="fila-debug-card__content">
            <div class="fila-debug-card__group">
              <div class="fila-module__metric">
                <span class="fila-module__metric-label">Web do host</span>
                <UBadge :color="probeBadgeColor(data?.health.web)" variant="soft">
                  {{ data?.health.web?.ok ? 'Online' : 'Offline' }}
                </UBadge>
              </div>
              <div class="fila-module__metric">
                <span class="fila-module__metric-label">API do módulo</span>
                <UBadge :color="probeBadgeColor(data?.health.api)" variant="soft">
                  {{ data?.health.api?.ok ? 'Online' : 'Offline' }}
                </UBadge>
              </div>
              <div class="fila-module__metric">
                <span class="fila-module__metric-label">Contratos obrigatórios</span>
                <span>{{ requiredContracts.join(', ') || 'nenhum' }}</span>
              </div>
              <div class="fila-module__metric">
                <span class="fila-module__metric-label">Contratos opcionais</span>
                <span>{{ optionalContracts.join(', ') || 'nenhum' }}</span>
              </div>
            </div>

            <div class="fila-debug-card__group">
              <p class="fila-debug-card__label">Capacidades do ator</p>
              <div class="fila-module__chips">
                <UBadge
                  v-for="item in actorCapabilities"
                  :key="item"
                  color="neutral"
                  variant="soft"
                >
                  {{ item }}
                </UBadge>
              </div>
            </div>

            <div class="fila-debug-card__group">
              <p class="fila-debug-card__label">Documentação de incorporação</p>
              <p v-if="moduleDocs?.quickStart" class="fila-module__path">{{ moduleDocs.quickStart }}</p>
              <p v-if="moduleDocs?.protocol" class="fila-module__path">{{ moduleDocs.protocol }}</p>
              <p v-if="moduleDocs?.agents" class="fila-module__path">{{ moduleDocs.agents }}</p>
              <p v-if="moduleDocs?.incorporationPlan" class="fila-module__path">{{ moduleDocs.incorporationPlan }}</p>
            </div>
          </div>
        </details>
      </template>
    </div>
  </section>
</template>

<style scoped>
.fila-module {
  display: grid;
  gap: 1.25rem;
}

.fila-module__hero {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1.25rem;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.24), transparent 38%),
    linear-gradient(135deg, rgba(12, 74, 110, 0.5), rgba(15, 23, 42, 0.95));
}

.fila-module__eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(125, 211, 252);
}

.fila-module__title {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  line-height: 1.05;
}

.fila-module__text {
  max-width: 62ch;
  margin: 0.85rem 0 0;
  color: rgba(226, 232, 240, 0.86);
}

.fila-module__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
}

.fila-module__bridge-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.fila-module__workspace {
  display: grid;
  gap: 1rem;
}

.fila-module__workspace-card {
  min-height: 100%;
}

.fila-module__workspace-card--wide {
  grid-column: 1 / -1;
}

.fila-module__workspace-card--controls {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88));
}

.fila-module__card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.fila-module__card-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.fila-module__card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.fila-module__controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
  align-items: end;
}

.fila-module__control-copy {
  display: grid;
  gap: 0.2rem;
}

.fila-module__control-label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.88);
}

.fila-module__control-subtle {
  color: rgba(148, 163, 184, 0.88);
  font-size: 0.84rem;
}

.fila-module__store-select {
  min-width: 14rem;
}

.fila-module__summary-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.fila-summary-card {
  display: grid;
  gap: 0.35rem;
}

.fila-summary-card__label {
  font-size: 0.82rem;
  color: rgba(148, 163, 184, 0.92);
}

.fila-summary-card__value {
  font-size: 1.8rem;
  line-height: 1;
}

.fila-empty-state,
.fila-column-empty {
  display: grid;
  gap: 0.45rem;
  padding: 1.2rem;
  border: 1px dashed rgba(148, 163, 184, 0.22);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.45);
}

.fila-column-empty--inline {
  padding: 0;
  border: 0;
  background: transparent;
}

.fila-empty-state p,
.fila-column-empty p {
  margin: 0;
  color: rgba(148, 163, 184, 0.9);
}

.fila-board-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.fila-board-column {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.74));
}

.fila-board-column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-weight: 700;
}

.fila-board-column__stack {
  display: grid;
  gap: 0.75rem;
}

.fila-queue-card,
.fila-service-card,
.fila-paused-card,
.fila-roster-card {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1rem;
  background: rgba(2, 6, 23, 0.48);
}

.fila-queue-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem 0.95rem;
}

.fila-queue-card__lead {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.fila-queue-card__position {
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: rgb(125, 211, 252);
  font-size: 0.82rem;
  font-weight: 700;
}

.fila-queue-card__avatar,
.fila-roster-card__avatar {
  width: 2.35rem;
  height: 2.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: white;
  font-weight: 800;
  text-transform: uppercase;
  background: linear-gradient(135deg, var(--avatar-accent), rgba(15, 23, 42, 0.95));
}

.fila-queue-card__body,
.fila-queue-card__meta,
.fila-service-card__top,
.fila-service-card__metrics,
.fila-paused-card,
.fila-roster-card {
  display: flex;
}

.fila-queue-card__body {
  flex-direction: column;
  gap: 0.2rem;
}

.fila-queue-card__body span,
.fila-service-card__top p,
.fila-paused-card p,
.fila-roster-card p,
.fila-roster-card__footer span {
  margin: 0;
  color: rgba(148, 163, 184, 0.92);
  font-size: 0.84rem;
}

.fila-queue-card__meta {
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: rgba(148, 163, 184, 0.92);
}

.fila-service-card,
.fila-paused-card,
.fila-roster-card {
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.95rem;
}

.fila-service-card__top,
.fila-paused-card,
.fila-roster-card__identity,
.fila-roster-card__footer {
  align-items: center;
  justify-content: space-between;
}

.fila-service-card__metrics {
  gap: 0.75rem;
  flex-wrap: wrap;
}

.fila-service-card__metrics div {
  min-width: 7rem;
  display: grid;
  gap: 0.15rem;
}

.fila-service-card__metrics span {
  color: rgba(148, 163, 184, 0.9);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fila-paused-card__meta,
.fila-roster-card__identity,
.fila-roster-card__footer {
  display: flex;
  gap: 0.75rem;
}

.fila-roster-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.fila-insights-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.fila-mini-metric-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fila-mini-metric {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 0.9rem;
  background: rgba(2, 6, 23, 0.38);
}

.fila-mini-metric span {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(148, 163, 184, 0.9);
}

.fila-mini-metric strong {
  font-size: 1.05rem;
}

.fila-list-stack,
.fila-diagnosis-list,
.fila-settings-summary {
  display: grid;
  gap: 0.75rem;
}

.fila-list-row,
.fila-diagnosis-card,
.fila-settings-stat {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 0.9rem;
  background: rgba(2, 6, 23, 0.34);
}

.fila-list-row p,
.fila-list-row span,
.fila-diagnosis-card p,
.fila-diagnosis-card span,
.fila-settings-stat span {
  margin: 0;
  color: rgba(148, 163, 184, 0.9);
}

.fila-list-end {
  display: grid;
  justify-items: flex-end;
  gap: 0.2rem;
  text-align: right;
}

.fila-diagnosis-card {
  flex-direction: column;
}

.fila-diagnosis-card--alert {
  border-color: rgba(245, 158, 11, 0.24);
}

.fila-settings-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fila-settings-stat {
  flex-direction: column;
}

.fila-tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.fila-tag-cloud__item {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background: rgba(8, 47, 73, 0.42);
  color: rgba(191, 219, 254, 0.96);
  font-size: 0.8rem;
}

.fila-section-divider {
  height: 1px;
  margin: 0.9rem 0;
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.2), rgba(148, 163, 184, 0.06));
}

.fila-roster-card--service {
  border-color: rgba(34, 197, 94, 0.28);
}

.fila-roster-card--queue {
  border-color: rgba(245, 158, 11, 0.3);
}

.fila-roster-card--paused,
.fila-roster-card--assignment {
  border-color: rgba(248, 113, 113, 0.28);
}

.fila-module__metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.fila-module__metric-label {
  color: rgba(148, 163, 184, 0.95);
}

.fila-module__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.fila-debug-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.5);
}

.fila-debug-card summary {
  cursor: pointer;
  padding: 0.95rem 1rem;
  font-weight: 700;
}

.fila-debug-card__content {
  display: grid;
  gap: 1rem;
  padding: 0 1rem 1rem;
}

.fila-debug-card__group {
  display: grid;
  gap: 0.55rem;
}

.fila-debug-card__label {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: rgba(148, 163, 184, 0.95);
}

.fila-module__path {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.84rem;
  color: rgba(191, 219, 254, 0.94);
  word-break: break-all;
}

@media (max-width: 1100px) {
  .fila-board-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .fila-module__hero {
    flex-direction: column;
  }

  .fila-module__bridge-status {
    justify-content: flex-start;
  }

  .fila-queue-card {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }

  .fila-queue-card__meta,
  .fila-service-card__top,
  .fila-paused-card,
  .fila-roster-card__identity,
  .fila-roster-card__footer,
  .fila-list-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .fila-mini-metric-grid,
  .fila-settings-summary {
    grid-template-columns: 1fr;
  }
}
</style>
