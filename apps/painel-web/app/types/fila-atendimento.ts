export interface FilaAtendimentoStoreContext {
  id: string
  tenantId?: string
  code: string
  name: string
  city: string
}

export interface FilaAtendimentoTenantContext {
  id: string
  slug?: string
  name?: string
}

export interface FilaAtendimentoContextResponse {
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

export interface FilaAtendimentoSkippedPerson {
  id: string
  name: string
}

export interface FilaAtendimentoQueueEntry {
  id: string
  storeId?: string
  storeName?: string
  storeCode?: string
  name: string
  role: string
  initials: string
  color: string
  monthlyGoal?: number
  commissionRate?: number
  queueJoinedAt: number
}

export interface FilaAtendimentoActiveService extends FilaAtendimentoQueueEntry {
  serviceId: string
  serviceStartedAt: number
  queueWaitMs: number
  queuePositionAtStart: number
  startMode: string
  skippedPeople?: FilaAtendimentoSkippedPerson[]
}

export interface FilaAtendimentoPausedEmployee {
  personId: string
  storeId?: string
  storeName?: string
  storeCode?: string
  reason: string
  kind?: string
  startedAt: number
}

export interface FilaAtendimentoConsultantStatus {
  status: string
  startedAt: number
}

export interface FilaAtendimentoSnapshotResponse {
  storeId?: string
  waitingList?: FilaAtendimentoQueueEntry[]
  activeServices?: FilaAtendimentoActiveService[]
  pausedEmployees?: FilaAtendimentoPausedEmployee[]
  consultantCurrentStatus?: Record<string, FilaAtendimentoConsultantStatus>
  serviceHistory?: Array<Record<string, unknown>>
}

export interface FilaAtendimentoConsultantAccess {
  userId?: string
  email?: string
  active?: boolean
  initialPassword?: string
}

export interface FilaAtendimentoConsultantView {
  id: string
  storeId: string
  storeName?: string
  storeCode?: string
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
  access?: FilaAtendimentoConsultantAccess | null
}

export interface FilaAtendimentoConsultantsResponse {
  consultants?: FilaAtendimentoConsultantView[]
}

export interface FilaAtendimentoSettingsOptionItem {
  id: string
  label: string
}

export interface FilaAtendimentoSettingsProductItem {
  id: string
  name: string
  code?: string
  category?: string
  basePrice?: number
}

export interface FilaAtendimentoCampaign {
  id: string
  name: string
  description: string
  campaignType: 'interna' | 'comercial'
  isActive: boolean
  startsAt: string
  endsAt: string
  targetOutcome: 'qualquer' | 'compra' | 'reserva' | 'nao-compra' | 'compra-reserva'
  minSaleAmount: number
  maxServiceMinutes: number
  productCodes: string[]
  sourceIds: string[]
  reasonIds: string[]
  queueJumpOnly: boolean
  existingCustomerFilter: 'all' | 'yes' | 'no'
  bonusFixed: number
  bonusRate: number
}

export interface FilaAtendimentoCampaignMatch {
  campaignId?: string
  campaignName?: string
  matchedProductCodes?: string[]
  bonusValue?: number
}

export interface FilaAtendimentoSettingsTemplate {
  id: string
  label: string
  description?: string
  settings?: Partial<FilaAtendimentoSettingsAppSettings>
  modalConfig?: Partial<FilaAtendimentoModalConfig>
  visitReasonOptions?: FilaAtendimentoSettingsOptionItem[]
  customerSourceOptions?: FilaAtendimentoSettingsOptionItem[]
}

export type FilaAtendimentoSettingsOptionGroup =
  | 'visit-reasons'
  | 'customer-sources'
  | 'queue-jump-reasons'
  | 'loss-reasons'
  | 'professions'

export interface FilaAtendimentoServiceHistoryProduct {
  name?: string
  code?: string
}

export interface FilaAtendimentoServiceHistoryEntry {
  serviceId?: string
  storeId?: string
  storeName?: string
  personId?: string
  personName?: string
  consultantId?: string
  consultantName?: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  customerProfession?: string
  finishedAt?: number
  finishOutcome?: string
  outcome?: string
  saleAmount?: number
  durationMs?: number
  queueWaitMs?: number
  startMode?: string
  productSeen?: string
  productClosed?: string
  productDetails?: string
  visitReasons?: string[]
  customerSources?: string[]
  queueJumpReason?: string
  notes?: string
  hasNotes?: boolean
  completionLevel?: string
  completionRate?: number
  isExistingCustomer?: boolean
  isGift?: boolean
  isWindowService?: boolean
  productsClosed?: FilaAtendimentoServiceHistoryProduct[]
  campaignMatches?: FilaAtendimentoCampaignMatch[]
  campaignNames?: string[]
  campaignBonusTotal?: number
}

export interface FilaAtendimentoSettingsAppSettings {
  maxConcurrentServices: number
  timingFastCloseMinutes: number
  timingLongServiceMinutes: number
  timingLowSaleAmount: number
  testModeEnabled: boolean
  autoFillFinishModal: boolean
  alertMinConversionRate: number
  alertMaxQueueJumpRate: number
  alertMinPaScore: number
  alertMinTicketAverage: number
}

export interface FilaAtendimentoModalConfig {
  title: string
  productSeenLabel: string
  productSeenPlaceholder: string
  productClosedLabel: string
  productClosedPlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  queueJumpReasonLabel: string
  queueJumpReasonPlaceholder: string
  lossReasonLabel: string
  lossReasonPlaceholder: string
  customerSectionLabel: string
  showEmailField: boolean
  showProfessionField: boolean
  showNotesField: boolean
  visitReasonSelectionMode: string
  visitReasonDetailMode: string
  lossReasonSelectionMode: string
  lossReasonDetailMode: string
  customerSourceSelectionMode: string
  customerSourceDetailMode: string
  requireProduct: boolean
  requireVisitReason: boolean
  requireCustomerSource: boolean
  requireCustomerNamePhone: boolean
}

export interface FilaAtendimentoSettingsResponse {
  storeId?: string
  selectedOperationTemplateId?: string
  operationTemplates?: FilaAtendimentoSettingsTemplate[]
  settings?: Partial<FilaAtendimentoSettingsAppSettings>
  modalConfig?: Partial<FilaAtendimentoModalConfig>
  visitReasonOptions?: FilaAtendimentoSettingsOptionItem[]
  customerSourceOptions?: FilaAtendimentoSettingsOptionItem[]
  queueJumpReasonOptions?: FilaAtendimentoSettingsOptionItem[]
  lossReasonOptions?: FilaAtendimentoSettingsOptionItem[]
  professionOptions?: FilaAtendimentoSettingsOptionItem[]
  productCatalog?: FilaAtendimentoSettingsProductItem[]
  campaigns?: FilaAtendimentoCampaign[]
}

export interface FilaAtendimentoOperationOverviewStore {
  storeId: string
  storeName: string
  storeCode?: string
  city?: string
  waitingCount: number
  activeCount: number
  pausedCount: number
  availableCount: number
}

export interface FilaAtendimentoOperationOverviewPerson {
  storeId: string
  storeName: string
  storeCode?: string
  personId: string
  name: string
  role: string
  initials: string
  color: string
  monthlyGoal?: number
  commissionRate?: number
  status: string
  statusStartedAt: number
  queueJoinedAt?: number
  queuePosition?: number
  serviceId?: string
  serviceStartedAt?: number
  queueWaitMs?: number
  startMode?: string
  pauseReason?: string
  pauseKind?: string
}

export interface FilaAtendimentoOperationOverview {
  scope?: string
  stores?: FilaAtendimentoOperationOverviewStore[]
  waitingList?: FilaAtendimentoOperationOverviewPerson[]
  activeServices?: FilaAtendimentoOperationOverviewPerson[]
  pausedEmployees?: FilaAtendimentoOperationOverviewPerson[]
  availableConsultants?: FilaAtendimentoOperationOverviewPerson[]
}

export interface FilaAtendimentoOperationState {
  activeStoreId: string
  roster: FilaAtendimentoConsultantView[]
  waitingList: FilaAtendimentoQueueEntry[]
  activeServices: FilaAtendimentoActiveService[]
  pausedEmployees: FilaAtendimentoPausedEmployee[]
  consultantCurrentStatus: Record<string, FilaAtendimentoConsultantStatus>
  serviceHistory: FilaAtendimentoServiceHistoryEntry[]
  operationTemplates: FilaAtendimentoSettingsTemplate[]
  selectedOperationTemplateId: string
  settings: FilaAtendimentoSettingsAppSettings
  modalConfig: FilaAtendimentoModalConfig
  visitReasonOptions: FilaAtendimentoSettingsOptionItem[]
  customerSourceOptions: FilaAtendimentoSettingsOptionItem[]
  queueJumpReasonOptions: FilaAtendimentoSettingsOptionItem[]
  lossReasonOptions: FilaAtendimentoSettingsOptionItem[]
  professionOptions: FilaAtendimentoSettingsOptionItem[]
  productCatalog: FilaAtendimentoSettingsProductItem[]
  campaigns: FilaAtendimentoCampaign[]
  finishModalPersonId: string
}

export interface FilaAtendimentoOperationCommandResult {
  ok: boolean
  message?: string
}

export interface FilaAtendimentoConsultantProfilePayload {
  name: string
  role: string
  color: string
  monthlyGoal: number
  commissionRate: number
  conversionGoal: number
  avgTicketGoal: number
  paGoal: number
}

export interface FilaAtendimentoConsultantMutationResult extends FilaAtendimentoOperationCommandResult {
  consultant?: FilaAtendimentoConsultantView | null
  access?: FilaAtendimentoConsultantAccess | null
}

export interface FilaAtendimentoReportsOverviewMetrics {
  totalAttendances?: number
  conversions?: number
  conversionRate?: number
  soldValue?: number
  averageTicket?: number
  averageDurationMs?: number
  averageQueueWaitMs?: number
  queueJumpRate?: number
  campaignBonusTotal?: number
}

export interface FilaAtendimentoReportsConsultantAggRow {
  consultantId?: string
  consultantName?: string
  attendances?: number
  conversions?: number
  saleAmount?: number
}

export interface FilaAtendimentoReportsOverviewResponse {
  storeId?: string
  metrics?: FilaAtendimentoReportsOverviewMetrics
  chartData?: {
    consultantAgg?: FilaAtendimentoReportsConsultantAggRow[]
  }
}

export interface FilaAtendimentoReportsRecentServiceItem {
  serviceId?: string
  consultantName?: string
  customerName?: string
  outcome?: string
  saleAmount?: number
  finishedAt?: number
  productClosed?: string
}

export interface FilaAtendimentoReportsRecentServicesResponse {
  items?: FilaAtendimentoReportsRecentServiceItem[]
  total?: number
}

export interface FilaAtendimentoReportsResultItem extends FilaAtendimentoServiceHistoryEntry {
  completionLevel?: string
  completionRate?: number
  campaignBonusTotal?: number
}

export interface FilaAtendimentoReportsResultsResponse {
  total?: number
  rows?: FilaAtendimentoReportsResultItem[]
}

export interface FilaAtendimentoReportFilters {
  dateFrom: string
  dateTo: string
  search: string
}

export interface FilaAtendimentoManagedStore extends FilaAtendimentoStoreContext {
  tenantId: string
  isActive: boolean
  defaultTemplateId: string
  monthlyGoal: number
  weeklyGoal: number
  avgTicketGoal: number
  conversionGoal: number
  paGoal: number
}

export interface FilaAtendimentoStoreDeleteDependency {
  key?: string
  label?: string
  count?: number
}

export interface FilaAtendimentoMultiStoreOverviewSummary {
  activeStores?: number
  totalAttendances?: number
  totalSoldValue?: number
  totalQueue?: number
  totalActiveServices?: number
  averageHealthScore?: number
}

export interface FilaAtendimentoMultiStoreOverviewRow {
  storeId?: string
  storeName?: string
  storeCode?: string
  storeCity?: string
  consultants?: number
  queueCount?: number
  activeCount?: number
  pausedCount?: number
  attendances?: number
  conversionRate?: number
  soldValue?: number
  ticketAverage?: number
  paScore?: number
  averageQueueWaitMs?: number
  queueJumpRate?: number
  healthScore?: number
  monthlyGoal?: number
  weeklyGoal?: number
  avgTicketGoal?: number
  conversionGoal?: number
  paGoal?: number
  defaultTemplateId?: string
}

export interface FilaAtendimentoMultiStoreOverviewResponse {
  tenantId?: string
  summary?: FilaAtendimentoMultiStoreOverviewSummary
  stores?: FilaAtendimentoMultiStoreOverviewRow[]
}

export interface FilaAtendimentoMultiStoreMutationResult extends FilaAtendimentoOperationCommandResult {
  store?: FilaAtendimentoManagedStore | null
  storeId?: string
  warningMessage?: string
  noChange?: boolean
  blockedDependencies?: FilaAtendimentoStoreDeleteDependency[]
}

export interface FilaAtendimentoRoleDefinition {
  id?: string
  label?: string
  description?: string
  scope?: string
  grants?: string[]
}

export interface FilaAtendimentoRoleCatalogResponse {
  tenantModel?: string
  roles?: FilaAtendimentoRoleDefinition[]
}

export interface FilaAtendimentoUserOnboarding {
  status?: string
  hasPassword?: boolean
  mustChangePassword?: boolean
  invitationExpiresAt?: string
}

export interface FilaAtendimentoUserView {
  id: string
  coreUserId: string
  identityProvider: string
  displayName: string
  email: string
  role: string
  tenantId: string
  storeIds: string[]
  active: boolean
  managedBy: string
  managedResourceId: string
  onboarding?: FilaAtendimentoUserOnboarding | null
  createdAt?: string
  updatedAt?: string
}

export interface FilaAtendimentoUsersResponse {
  users?: FilaAtendimentoUserView[]
}

export interface FilaAtendimentoUserMutationResult extends FilaAtendimentoOperationCommandResult {
  user?: FilaAtendimentoUserView | null
  temporaryPassword?: string
  noChange?: boolean
}

export interface FilaAtendimentoAnalyticsRankingRow {
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

export interface FilaAtendimentoAnalyticsRankingAlert {
  consultantId?: string
  consultantName?: string
  type?: string
  value?: number
  threshold?: number
}

export interface FilaAtendimentoAnalyticsRankingResponse {
  monthlyRows?: FilaAtendimentoAnalyticsRankingRow[]
  dailyRows?: FilaAtendimentoAnalyticsRankingRow[]
  alerts?: FilaAtendimentoAnalyticsRankingAlert[]
}

export interface FilaAtendimentoAnalyticsCountRow {
  label?: string
  count?: number
}

export interface FilaAtendimentoAnalyticsHourlySalesRow {
  label?: string
  count?: number
  value?: number
}

export interface FilaAtendimentoAnalyticsTimeIntelligence {
  quickHighPotentialCount?: number
  longLowSaleCount?: number
  longNoSaleCount?: number
  quickNoSaleCount?: number
  avgQueueWaitMs?: number
  notUsingQueueRate?: number
  totalsByStatus?: {
    queue?: number
    available?: number
    paused?: number
    service?: number
  }
  consultantsInQueueMs?: number
  consultantsPausedMs?: number
  consultantsInServiceMs?: number
}

export interface FilaAtendimentoAnalyticsDataResponse {
  timeIntelligence?: FilaAtendimentoAnalyticsTimeIntelligence
  soldProducts?: FilaAtendimentoAnalyticsCountRow[]
  requestedProducts?: FilaAtendimentoAnalyticsCountRow[]
  visitReasons?: FilaAtendimentoAnalyticsCountRow[]
  customerSources?: FilaAtendimentoAnalyticsCountRow[]
  professions?: FilaAtendimentoAnalyticsCountRow[]
  outcomeSummary?: FilaAtendimentoAnalyticsCountRow[]
  hourlySales?: FilaAtendimentoAnalyticsHourlySalesRow[]
}

export interface FilaAtendimentoAnalyticsDiagnosisItem {
  id?: string
  level?: string
  title?: string
  reading?: string
  hypothesis?: string
  action?: string
}

export interface FilaAtendimentoAnalyticsIntelligenceResponse {
  healthScore?: number
  severityCounts?: {
    critical?: number
    attention?: number
    healthy?: number
  }
  totalAttendances?: number
  diagnosis?: FilaAtendimentoAnalyticsDiagnosisItem[]
  recommendedActions?: string[]
  time?: {
    avgQueueWaitMs?: number
    notUsingQueueRate?: number
  }
  ticketAverage?: number
  conversionRate?: number
}

export type FilaAtendimentoRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface FilaAtendimentoRealtimeTicketResponse {
  ticket: string
  expiresInSeconds: number
}

export interface FilaAtendimentoRealtimeEvent {
  type?: string
  topic?: string
  storeId?: string
  tenantId?: string
  message?: string
  ts?: string
}

export interface FilaAtendimentoFinishProduct {
  id?: string
  name?: string
  label?: string
  price?: number
  code?: string
  isCustom?: boolean
}

export interface FilaAtendimentoFinishPayload {
  personId: string
  storeId?: string
  outcome: string
  isWindowService?: boolean
  isGift?: boolean
  productsSeen?: FilaAtendimentoFinishProduct[]
  productsClosed?: FilaAtendimentoFinishProduct[]
  productsSeenNone?: boolean
  visitReasonsNotInformed?: boolean
  customerSourcesNotInformed?: boolean
  productSeen?: string
  productClosed?: string
  productDetails?: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  isExistingCustomer?: boolean
  visitReasons?: string[]
  visitReasonDetails?: Record<string, string>
  customerSources?: string[]
  customerSourceDetails?: Record<string, string>
  lossReasons?: string[]
  lossReasonId?: string
  lossReason?: string
  lossReasonDetails?: Record<string, string>
  saleAmount?: number
  customerProfession?: string
  queueJumpReason?: string
  notes?: string
  campaignMatches?: FilaAtendimentoCampaignMatch[]
  campaignBonusTotal?: number
}