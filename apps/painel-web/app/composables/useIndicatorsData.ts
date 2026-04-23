import type {
  IndicatorChartDatum,
  IndicatorDashboardModel,
  IndicatorEvaluationRecord,
  IndicatorRangePreset,
  IndicatorSectionModel,
  IndicatorSelectionOption,
  IndicatorStoreCard,
  IndicatorTeamSnapshot,
  IndicatorTone,
  IndicatorUnitOption
} from '~/types/indicators'
import type {
  IndicatorsConfigSnapshot,
  IndicatorsDefaultPolicy,
  IndicatorsEvidencePolicy,
  IndicatorsGovernancePolicyState,
  IndicatorsGovernanceStat,
  IndicatorsInputType,
  IndicatorsModuleSummary,
  IndicatorsProfileIndicatorConfig,
  IndicatorsProfileItemConfig,
  IndicatorsProviderHealth,
  IndicatorsProviderStatus,
  IndicatorsRoadmapCard,
  IndicatorsScopeMode,
  IndicatorsSourceKind,
  IndicatorsStoreOverride,
  IndicatorsTargetSetSummary,
  IndicatorsTargetStatus,
  IndicatorsTemplateCatalogItem,
  IndicatorsTemplateStatus,
  IndicatorsTenantAdoption,
  IndicatorsValueType
} from '~/types/indicators-management'

const INDICATORS_API_BASE = '/core/modules/indicators/v1'
const DEFAULT_FETCH_LIMIT = 200

const ACCENT_COLORS = [
  '#0f766e',
  '#b45309',
  '#0f4c81',
  '#166534',
  '#9a3412',
  '#1d4ed8'
]

const DEFAULT_TEAM_SNAPSHOT: IndicatorTeamSnapshot = {
  stiAverage: 8.5,
  survey360: 8.2
}

const DEFAULT_TARGET_SNAPSHOT = {
  returnTarget: 10,
  revenueTarget: 100,
  avgTicketTarget: 1800,
  discountTarget: 10
}

export const INDICATORS_RANGE_PRESETS: IndicatorRangePreset[] = [
  { id: 'current-month', label: 'Mes atual' },
  { id: 'last-30-days', label: 'Ultimos 30 dias' },
  { id: 'last-90-days', label: 'Ultimos 90 dias' },
  { id: 'year-to-date', label: 'Ano atual' }
]

export const INDICATORS_GOVERNANCE_ROADMAP: IndicatorsRoadmapCard[] = [
  {
    id: 'providers-first-class',
    title: 'Fechar contratos de providers derivados',
    description: 'Consolidar bindings dos modulos que vao publicar snapshots automaticos para indicadores.',
    stage: 'now',
    owner: 'Core',
    dependencies: ['providers', 'snapshots']
  },
  {
    id: 'multi-tenant-rollout',
    title: 'Abrir rollout multi-tenant real',
    description: 'Publicar mais de um template e rastrear aderencia por cliente em endpoint dedicado.',
    stage: 'next',
    owner: 'Plataforma',
    dependencies: ['templates', 'tenants']
  },
  {
    id: 'exports-bff',
    title: 'Implementar exportacao operacional',
    description: 'Levar CSV, XLSX e PDF para BFF dedicado com payload enxuto e filtros persistentes.',
    stage: 'later',
    owner: 'Painel web',
    dependencies: ['bff', 'relatorios']
  }
]

type ApiMap = Record<string, unknown>

interface ApiModuleSummary {
  clientLabel: string
  activeProfileName: string
  templateLabel: string
  storesConfigured: number
  providerOnlineCount: number
  providerTotal: number
  pendingChanges: number
  lastSyncLabel: string
}

interface ApiBlockingIndicatorTotal {
  indicatorId: string
  indicatorCode: string
  indicatorName: string
  total: number
}

interface ApiWeightStatus {
  hasBlockingIssues: boolean
  blockingItemTotals: ApiBlockingIndicatorTotal[]
}

interface ApiActiveProfileInfo {
  recordId: string
  name: string
  description?: string
  status: string
  scopeMode: string
  storeBreakdownEnabled: boolean
  providerSyncEnabled: boolean
  templateId?: string
  templateVersionId?: string
  templateCode?: string
  templateLabel?: string
  metadata?: ApiMap
}

interface ApiProfileItemConfig {
  recordId?: string
  id: string
  label: string
  inputType: string
  evidencePolicy: string
  required: boolean
  weight: number
  helper?: string
  sourceMetricKey?: string
  selectOptions?: ApiMap[]
  config?: ApiMap
  metadata?: ApiMap
}

interface ApiProfileIndicatorConfig {
  recordId?: string
  id: string
  code: string
  categoryCode: string
  categoryLabel: string
  name: string
  description?: string
  enabled: boolean
  weight: number
  scopeMode: string
  sourceKind: string
  sourceModule?: string
  sourceMetricKey?: string
  valueType: string
  evidencePolicy: string
  supportsStoreBreakdown: boolean
  required: boolean
  tags: string[]
  settings?: ApiMap
  metadata?: ApiMap
  items: ApiProfileItemConfig[]
}

interface ApiStoreOverrideRule {
  id: string
  label: string
  enabled?: boolean
  weight?: number
  note?: string
  changed: boolean
}

interface ApiStoreOverrideView {
  id: string
  unitName: string
  accentColor?: string
  managerName?: string
  ranking: number
  score: number
  scopeMode: string
  status: string
  note?: string
  overrides: ApiStoreOverrideRule[]
}

interface ApiTargetItemView {
  recordId?: string
  indicatorId?: string
  categoryCode?: string
  storeId?: string
  targetValueNumeric?: number
  targetValueText?: string
  comparator?: string
  weight: number
  metadata?: ApiMap
}

interface ApiTargetSetView {
  recordId?: string
  name: string
  periodKind: string
  startsAt?: string
  endsAt?: string
  scopeMode: string
  status: string
  metadata?: ApiMap
  items: ApiTargetItemView[]
}

interface ApiProviderHealth {
  id: string
  name: string
  sourceModule: string
  status: string
  freshnessLabel: string
  coverageLabel: string
  mappedIndicators: string[]
  note: string
}

interface ApiActiveProfileResponse {
  summary: ApiModuleSummary
  clientLabel: string
  profile: ApiActiveProfileInfo
  indicators: ApiProfileIndicatorConfig[]
  stores: ApiStoreOverrideView[]
  targetSets: ApiTargetSetView[]
  providers: ApiProviderHealth[]
}

interface ApiDashboardIndicatorScore {
  code: string
  name: string
  score: number
  evaluationsCount: number
  weight: number
  tone?: string
}

interface ApiDashboardStore {
  storeId: string
  unitCode?: string
  unitName: string
  accentColor?: string
  evaluationsCount: number
  score: number
  usedWeight: number
  scopeMode: string
  tone?: string
  indicators: ApiDashboardIndicatorScore[]
}

interface ApiDashboardIndicatorAggregate {
  code: string
  name: string
  score: number
  evaluationsCount: number
  weight: number
  tone?: string
}

export interface ApiDashboardResponse {
  summary: ApiModuleSummary
  rangeStart?: string
  rangeEnd?: string
  evaluationCount: number
  stores: ApiDashboardStore[]
  ranking: ApiDashboardStore[]
  indicators: ApiDashboardIndicatorAggregate[]
}

interface ApiEvaluationListItem {
  id: string
  evaluatorName: string
  storeId?: string
  unitCode?: string
  unitName?: string
  scopeMode: string
  periodStart: string
  periodEnd: string
  status: string
  overallScore: number
  totalWeight: number
  indicatorCodes: string[]
  indicatorLabels: string[]
}

export interface ApiEvaluationItemView {
  recordId: string
  code: string
  label: string
  inputType: string
  evidencePolicy: string
  valueText?: string
  valueNumeric?: number
  valueBoolean?: boolean
  valueJson?: ApiMap
  weight: number
  score: number
  notes?: string
}

export interface ApiEvaluationIndicatorView {
  recordId: string
  profileIndicatorId?: string
  code: string
  name: string
  sourceKind: string
  sourceModule?: string
  scopeMode: string
  aggregationMode: string
  valueType: string
  evidencePolicy: string
  score: number
  rawValueNumeric?: number
  weight: number
  items: ApiEvaluationItemView[]
}

interface ApiAssetView {
  recordId: string
  assetKind: string
  fileName?: string
  contentType?: string
  storageKey: string
  uploadedAt?: string
}

export interface ApiEvaluationDetail {
  id: string
  profileId: string
  evaluatorName: string
  storeId?: string
  unitCode?: string
  unitName?: string
  scopeMode: string
  periodStart: string
  periodEnd: string
  status: string
  overallScore: number
  totalWeight: number
  notes?: string
  createdAt?: string
  updatedAt?: string
  indicators: ApiEvaluationIndicatorView[]
  assets: ApiAssetView[]
}

interface ApiTemplateVersionSummary {
  recordId: string
  versionNumber: number
  status: string
  publishedAt?: string
  notes?: string
  updatedAt?: string
}

interface ApiTemplateListItem {
  recordId: string
  code: string
  name: string
  description?: string
  status: string
  taxonomyVersion: number
  isSystem: boolean
  defaultScopeMode: string
  metadata?: ApiMap
  categoryCount: number
  indicatorCount: number
  clientCount: number
  versions: ApiTemplateVersionSummary[]
  updatedAt?: string
}

interface ApiTemplateItemConfig {
  id: string
  label: string
  description?: string
  inputType: string
  evidencePolicy: string
  sourceMetricKey?: string
  weight: number
  required: boolean
  selectOptions?: ApiMap[]
  config?: ApiMap
  metadata?: ApiMap
}

interface ApiTemplateIndicatorConfig {
  id: string
  code: string
  name: string
  description?: string
  indicatorKind?: string
  sourceKind?: string
  sourceModule?: string
  sourceMetricKey?: string
  scopeMode?: string
  aggregationMode?: string
  valueType?: string
  evidencePolicy?: string
  weight: number
  required: boolean
  supportsStoreBreakdown: boolean
  settings?: ApiMap
  metadata?: ApiMap
  items: ApiTemplateItemConfig[]
}

interface ApiTemplateCategoryConfig {
  code: string
  name: string
  description?: string
  sortOrder: number
  weight: number
  scopeMode?: string
  metadata?: ApiMap
  indicators: ApiTemplateIndicatorConfig[]
}

export interface ApiTemplateDetail extends ApiTemplateListItem {
  workingVersion: ApiTemplateVersionSummary
  categories: ApiTemplateCategoryConfig[]
}

interface ApiGovernanceStat {
  id: string
  label: string
  value: string
  helper?: string
  tone?: string
}

interface ApiGovernancePolicy {
  id: string
  title: string
  description: string
  state: string
  value: string
  affectedArea: string
}

interface ApiGovernanceTenantAdoption {
  id: string
  clientLabel: string
  activeTemplate: string
  scopeMode: string
  rolloutStatus: string
  providerCoverage: string
  lastChangeLabel: string
}

interface ApiGovernanceRoadmapItem {
  id: string
  title: string
  description: string
  stage: string
  owner: string
  dependencies: string[]
}

interface ApiGovernanceOverview {
  stats: ApiGovernanceStat[]
  policies: ApiGovernancePolicy[]
  providers: ApiProviderHealth[]
  tenantAdoption: ApiGovernanceTenantAdoption[]
  roadmap: ApiGovernanceRoadmapItem[]
}

interface ApiEnvelope<T> {
  item: T
}

interface ApiItemsEnvelope<T> {
  items: T[]
  meta?: {
    total?: number
  }
}

export interface IndicatorsBlockingItemTotal {
  indicatorId: string
  indicatorCode: string
  indicatorName: string
  total: number
}

export interface IndicatorsWeightStatus {
  hasBlockingIssues: boolean
  blockingItemTotals: IndicatorsBlockingItemTotal[]
}

export interface IndicatorsProfileDraftMeta {
  recordId: string
  name: string
  description: string
  status: string
  scopeMode: IndicatorsScopeMode
  storeBreakdownEnabled: boolean
  providerSyncEnabled: boolean
  metadata: ApiMap
}

export interface IndicatorsActiveProfileState {
  summary: IndicatorsModuleSummary
  clientLabel: string
  profileMeta: IndicatorsProfileDraftMeta
  indicators: IndicatorsProfileIndicatorConfig[]
  stores: IndicatorsStoreOverride[]
  targetSets: IndicatorsTargetSetSummary[]
  providers: IndicatorsProviderHealth[]
}

export interface IndicatorsGovernanceOverviewState {
  stats: IndicatorsGovernanceStat[]
  policies: IndicatorsDefaultPolicy[]
  providers: IndicatorsProviderHealth[]
  tenantAdoption: IndicatorsTenantAdoption[]
  roadmap: IndicatorsRoadmapCard[]
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function asMap(value: unknown): ApiMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as ApiMap
}

function toInputType(value: unknown): IndicatorsInputType {
  const normalized = asString(value, 'text')
  switch (normalized) {
    case 'boolean':
    case 'score':
    case 'percent':
    case 'currency':
    case 'count':
    case 'text':
    case 'image':
    case 'image_required':
    case 'select':
    case 'provider_metric':
      return normalized
    default:
      return 'text'
  }
}

function toEvidencePolicy(value: unknown): IndicatorsEvidencePolicy {
  const normalized = asString(value, 'optional')
  switch (normalized) {
    case 'inherit':
    case 'none':
    case 'optional':
    case 'required':
      return normalized
    default:
      return 'optional'
  }
}

function toScopeMode(value: unknown): IndicatorsScopeMode {
  return asString(value) === 'per_store' ? 'per_store' : 'client_global'
}

function toSourceKind(value: unknown): IndicatorsSourceKind {
  const normalized = asString(value, 'manual')
  switch (normalized) {
    case 'provider':
    case 'hybrid':
      return normalized
    default:
      return 'manual'
  }
}

function toValueType(value: unknown): IndicatorsValueType {
  const normalized = asString(value, 'score')
  switch (normalized) {
    case 'score':
    case 'percent':
    case 'currency':
    case 'count':
    case 'boolean':
    case 'composite':
      return normalized
    default:
      return 'score'
  }
}

function toProviderStatus(value: unknown): IndicatorsProviderStatus {
  const normalized = asString(value, 'offline')
  switch (normalized) {
    case 'online':
    case 'attention':
      return normalized
    default:
      return 'offline'
  }
}

function toTemplateStatus(value: unknown): IndicatorsTemplateStatus {
  const normalized = asString(value, 'draft')
  switch (normalized) {
    case 'active':
      return 'active'
    case 'published':
      return 'active'
    case 'archived':
      return 'archived'
    default:
      return 'draft'
  }
}

function toIndicatorTone(value: unknown): IndicatorTone {
  const normalized = asString(value, 'neutral')
  switch (normalized) {
    case 'success':
    case 'warning':
    case 'error':
      return normalized
    default:
      return 'neutral'
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function formatDisplayDate(value: string) {
  const raw = asString(value)
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

function formatDisplayDateTime(value: string) {
  const raw = asString(value)
  if (!raw) return '--'

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed)
}

function formatPercent(value: number) {
  return `${asNumber(value).toFixed(1)}%`
}

function formatCount(value: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(asNumber(value)))
}

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(asNumber(value))
}

function formatMetricValue(value: number | undefined, valueType: IndicatorsValueType) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/D'
  }

  switch (valueType) {
    case 'currency':
      return formatCurrencyValue(value)
    case 'count':
      return formatCount(value)
    case 'boolean':
      return value >= 1 ? 'Sim' : 'Nao'
    default:
      return value.toFixed(1)
  }
}

function metricUnitLabel(valueType: IndicatorsValueType) {
  switch (valueType) {
    case 'currency':
      return 'R$'
    case 'count':
      return 'un'
    case 'boolean':
      return ''
    default:
      return '%'
  }
}

function formatScopeLabel(value: IndicatorsScopeMode) {
  return value === 'per_store' ? 'Por loja' : 'Cliente global'
}

function resolveAccentColor(seed: string, fallback?: string) {
  const explicit = asString(fallback)
  if (explicit) {
    return explicit
  }

  const normalized = asString(seed, 'indicators')
  const hash = normalized.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
  return ACCENT_COLORS[hash % ACCENT_COLORS.length] || ACCENT_COLORS[0]
}

function getCurrentDateISO() {
  return new Date().toISOString().slice(0, 10)
}

export function getCurrentIndicatorsMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  }
}

export function getIndicatorsPresetRange(presetId: string) {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  if (presetId === 'last-30-days') {
    const start = new Date(end)
    start.setDate(start.getDate() - 29)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }

  if (presetId === 'last-90-days') {
    const start = new Date(end)
    start.setDate(start.getDate() - 89)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }

  if (presetId === 'year-to-date') {
    const start = new Date(end.getFullYear(), 0, 1)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }

  return getCurrentIndicatorsMonthRange()
}

function buildPeriodLabel(startsAt?: string, endsAt?: string, periodKind?: string) {
  const start = asString(startsAt)
  const end = asString(endsAt)
  if (start && end) {
    return `${formatDisplayDate(start)} ate ${formatDisplayDate(end)}`
  }

  if (start) {
    return `A partir de ${formatDisplayDate(start)}`
  }

  if (end) {
    return `Valido ate ${formatDisplayDate(end)}`
  }

  return asString(periodKind, 'Periodo aberto')
}

function buildTemplateHighlights(template: ApiTemplateListItem, detail?: ApiTemplateDetail) {
  const highlights: string[] = []

  if (detail) {
    const categoryHighlights = detail.categories
      .slice(0, 3)
      .map(category => `${category.name}: ${category.indicators.length} indicador(es)`)
    highlights.push(...categoryHighlights)
    highlights.push(`Versao de trabalho v${detail.workingVersion.versionNumber}`)
  } else {
    highlights.push(`${template.categoryCount} categoria(s) mapeada(s)`)
    highlights.push(`${template.indicatorCount} indicador(es) disponivel(is)`)
  }

  highlights.push(template.isSystem ? 'Template do sistema' : 'Template customizavel')
  return Array.from(new Set(highlights)).slice(0, 4)
}

export function buildModuleSummary(summary?: Partial<IndicatorsModuleSummary>): IndicatorsModuleSummary {
  return {
    clientLabel: asString(summary?.clientLabel, 'Cliente nao selecionado'),
    activeProfileName: asString(summary?.activeProfileName, 'Perfil ativo nao carregado'),
    templateLabel: asString(summary?.templateLabel, 'Sem template publicado'),
    storesConfigured: asNumber(summary?.storesConfigured),
    providerOnlineCount: asNumber(summary?.providerOnlineCount),
    providerTotal: asNumber(summary?.providerTotal),
    pendingChanges: asNumber(summary?.pendingChanges),
    lastSyncLabel: asString(summary?.lastSyncLabel, `Sincronizado em ${formatDisplayDate(getCurrentDateISO())}`)
  }
}

export function buildModuleSummaryWithPending(summary: IndicatorsModuleSummary, extraPendingChanges: number) {
  return {
    ...summary,
    pendingChanges: Math.max(0, summary.pendingChanges + extraPendingChanges)
  }
}

export function buildCategories(indicators: IndicatorsProfileIndicatorConfig[]) {
  const seen = new Set<string>()
  return indicators
    .filter((indicator) => {
      if (seen.has(indicator.categoryCode)) {
        return false
      }

      seen.add(indicator.categoryCode)
      return true
    })
    .map(indicator => ({
      label: indicator.categoryLabel,
      value: indicator.categoryCode
    }))
}

export function buildConfigSnapshot(
  indicators: IndicatorsProfileIndicatorConfig[],
  stores: IndicatorsStoreOverride[]
): IndicatorsConfigSnapshot {
  const enabledIndicators = indicators.filter(indicator => indicator.enabled)
  const enabledWeight = Number(
    enabledIndicators.reduce((sum, indicator) => sum + indicator.weight, 0).toFixed(2)
  )

  return {
    enabledIndicators: enabledIndicators.length,
    enabledWeight,
    customStores: stores.filter(store => store.status === 'custom').length,
    providerBindings: enabledIndicators.filter(indicator => indicator.sourceKind !== 'manual' || indicator.sourceModule).length,
    requiredEvidence: enabledIndicators.reduce((sum, indicator) => {
      const itemRequired = indicator.items.filter(item => item.evidencePolicy === 'required').length
      return sum + (indicator.evidencePolicy === 'required' ? 1 : 0) + itemRequired
    }, 0)
  }
}

export function buildWeightStatus(indicators: IndicatorsProfileIndicatorConfig[]): IndicatorsWeightStatus {
  const blockingItemTotals = indicators
    .filter(indicator => indicator.enabled)
    .map((indicator) => ({
      indicatorId: indicator.id,
      indicatorCode: indicator.code,
      indicatorName: indicator.name,
      total: Number(indicator.items.reduce((sum, item) => sum + item.weight, 0).toFixed(2))
    }))
    .filter(item => Math.abs(item.total - 100) > 0.05)

  return {
    hasBlockingIssues: blockingItemTotals.length > 0,
    blockingItemTotals
  }
}

export function buildIndicatorOptions(indicators: IndicatorsProfileIndicatorConfig[]): IndicatorSelectionOption[] {
  return indicators
    .filter(indicator => indicator.enabled)
    .map(indicator => ({
      code: indicator.code,
      label: indicator.name,
      shortLabel: indicator.name.slice(0, 24),
      weight: indicator.weight
    }))
}

export function buildUnitOptions(stores: IndicatorsStoreOverride[]): IndicatorUnitOption[] {
  return stores.map(store => ({
    id: store.id,
    label: store.unitName,
    accentColor: store.accentColor,
    teamSnapshot: { ...DEFAULT_TEAM_SNAPSHOT },
    targetSnapshot: { ...DEFAULT_TARGET_SNAPSHOT }
  }))
}

function targetStatusFromNumbers(currentValue: number | undefined, targetValue: number | undefined, comparator: string): IndicatorsTargetStatus {
  if (currentValue === undefined || targetValue === undefined || Number.isNaN(currentValue) || Number.isNaN(targetValue)) {
    return 'risk'
  }

  const normalizedComparator = asString(comparator, 'gte')
  const difference = currentValue - targetValue

  if ((normalizedComparator === 'lte' && currentValue <= targetValue) || (normalizedComparator !== 'lte' && currentValue >= targetValue)) {
    return 'on_track'
  }

  if (Math.abs(difference) <= Math.max(Math.abs(targetValue) * 0.1, 5)) {
    return 'risk'
  }

  return 'off_track'
}

function mapProfileItem(item: ApiProfileItemConfig): IndicatorsProfileItemConfig {
  return {
    id: asString(item.id || item.recordId || crypto.randomUUID?.() || `item-${Date.now()}`),
    label: asString(item.label, 'Item'),
    inputType: toInputType(item.inputType),
    evidencePolicy: toEvidencePolicy(item.evidencePolicy),
    required: asBoolean(item.required),
    weight: asNumber(item.weight),
    helper: asString(item.helper),
    sourceMetricKey: asString(item.sourceMetricKey),
    selectOptions: Array.isArray(item.selectOptions) ? item.selectOptions.map(option => asMap(option)) : [],
    config: asMap(item.config),
    metadata: asMap(item.metadata)
  }
}

function mapProfileIndicator(indicator: ApiProfileIndicatorConfig): IndicatorsProfileIndicatorConfig {
  return {
    id: asString(indicator.id || indicator.recordId || indicator.code),
    code: asString(indicator.code),
    categoryCode: asString(indicator.categoryCode),
    categoryLabel: asString(indicator.categoryLabel, 'Categoria'),
    name: asString(indicator.name, indicator.code),
    description: asString(indicator.description),
    enabled: asBoolean(indicator.enabled, true),
    weight: asNumber(indicator.weight),
    scopeMode: toScopeMode(indicator.scopeMode),
    sourceKind: toSourceKind(indicator.sourceKind),
    sourceModule: asString(indicator.sourceModule),
    sourceMetricKey: asString(indicator.sourceMetricKey),
    valueType: toValueType(indicator.valueType),
    evidencePolicy: toEvidencePolicy(indicator.evidencePolicy),
    supportsStoreBreakdown: asBoolean(indicator.supportsStoreBreakdown),
    required: asBoolean(indicator.required),
    tags: Array.isArray(indicator.tags) ? indicator.tags.map(tag => asString(tag)).filter(Boolean) : [],
    settings: asMap(indicator.settings),
    metadata: asMap(indicator.metadata),
    items: Array.isArray(indicator.items) ? indicator.items.map(mapProfileItem) : []
  }
}

function mapStoreOverride(store: ApiStoreOverrideView): IndicatorsStoreOverride {
  return {
    id: asString(store.id),
    unitName: asString(store.unitName, 'Loja'),
    accentColor: resolveAccentColor(asString(store.id), store.accentColor),
    managerName: asString(store.managerName, 'Gestor nao informado'),
    ranking: Math.max(0, Math.round(asNumber(store.ranking))),
    score: asNumber(store.score),
    scopeMode: toScopeMode(store.scopeMode),
    status: asString(store.status, 'inherit') as IndicatorsStoreOverride['status'],
    note: asString(store.note),
    overrides: Array.isArray(store.overrides)
      ? store.overrides.map(rule => ({
          id: asString(rule.id),
          label: asString(rule.label, 'Indicador'),
          enabled: asBoolean(rule.enabled, true),
          weight: typeof rule.weight === 'number' ? rule.weight : null,
          note: asString(rule.note),
          changed: asBoolean(rule.changed)
        }))
      : []
  }
}

function mapProvider(provider: ApiProviderHealth): IndicatorsProviderHealth {
  return {
    id: asString(provider.id),
    name: asString(provider.name, 'Provider'),
    sourceModule: asString(provider.sourceModule, 'core'),
    status: toProviderStatus(provider.status),
    freshnessLabel: asString(provider.freshnessLabel, 'Sem coleta recente'),
    coverageLabel: asString(provider.coverageLabel, 'Cobertura nao informada'),
    mappedIndicators: Array.isArray(provider.mappedIndicators)
      ? provider.mappedIndicators.map(value => asString(value)).filter(Boolean)
      : [],
    note: asString(provider.note)
  }
}

function mapTargetSet(
  targetSet: ApiTargetSetView,
  indicators: IndicatorsProfileIndicatorConfig[],
  dashboard?: ApiDashboardResponse | null
): IndicatorsTargetSetSummary {
  const indicatorById = new Map(indicators.map(indicator => [indicator.id, indicator]))
  const aggregateByCode = new Map((dashboard?.indicators || []).map(item => [item.code, item]))

  return {
    id: asString(targetSet.recordId || `${targetSet.name}-${targetSet.periodKind}`),
    name: asString(targetSet.name, 'Target set'),
    periodLabel: buildPeriodLabel(targetSet.startsAt, targetSet.endsAt, targetSet.periodKind),
    scopeMode: toScopeMode(targetSet.scopeMode),
    status: toTemplateStatus(targetSet.status),
    items: Array.isArray(targetSet.items)
      ? targetSet.items.map((item, index) => {
          const indicator = indicatorById.get(asString(item.indicatorId))
          const aggregate = indicator ? aggregateByCode.get(indicator.code) : undefined
          const valueType = indicator?.valueType || 'score'
          const currentValue = aggregate?.score
          const targetValue = typeof item.targetValueNumeric === 'number' ? item.targetValueNumeric : undefined

          return {
            id: asString(item.recordId || `${targetSet.recordId || targetSet.name}-${index}`),
            label: indicator?.name || asString(item.categoryCode, 'Indicador'),
            currentValue: currentValue === undefined ? 'N/D' : formatMetricValue(currentValue, valueType),
            targetValue: targetValue === undefined ? asString(item.targetValueText, 'N/D') : formatMetricValue(targetValue, valueType),
            unitLabel: metricUnitLabel(valueType),
            status: targetStatusFromNumbers(currentValue, targetValue, asString(item.comparator, 'gte'))
          }
        })
      : []
  }
}

export function mapActiveProfileState(
  payload: ApiActiveProfileResponse,
  dashboard?: ApiDashboardResponse | null
): IndicatorsActiveProfileState {
  const indicators = Array.isArray(payload.indicators) ? payload.indicators.map(mapProfileIndicator) : []

  return {
    summary: buildModuleSummary(payload.summary),
    clientLabel: asString(payload.clientLabel || payload.summary?.clientLabel, 'Cliente nao selecionado'),
    profileMeta: {
      recordId: asString(payload.profile?.recordId),
      name: asString(payload.profile?.name, 'Perfil ativo'),
      description: asString(payload.profile?.description),
      status: asString(payload.profile?.status, 'active'),
      scopeMode: toScopeMode(payload.profile?.scopeMode),
      storeBreakdownEnabled: asBoolean(payload.profile?.storeBreakdownEnabled, true),
      providerSyncEnabled: asBoolean(payload.profile?.providerSyncEnabled, true),
      metadata: asMap(payload.profile?.metadata)
    },
    indicators,
    stores: Array.isArray(payload.stores) ? payload.stores.map(mapStoreOverride) : [],
    targetSets: Array.isArray(payload.targetSets)
      ? payload.targetSets.map(targetSet => mapTargetSet(targetSet, indicators, dashboard))
      : [],
    providers: Array.isArray(payload.providers) ? payload.providers.map(mapProvider) : []
  }
}

function averageScore(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
}

export function buildDashboardModel(
  dashboard: ApiDashboardResponse | null,
  clientLabel: string,
  indicators: IndicatorsProfileIndicatorConfig[] = []
): IndicatorDashboardModel {
  const chart: IndicatorChartDatum[] = dashboard
    ? dashboard.indicators.map(indicator => ({
        id: indicator.code,
        label: indicator.name,
        value: asNumber(indicator.score),
        color: resolveAccentColor(indicator.code),
        helper: `${formatCount(indicator.evaluationsCount)} avaliacao(oes)`
      }))
    : indicators
        .filter(indicator => indicator.enabled)
        .map(indicator => ({
          id: indicator.code,
          label: indicator.name,
          value: 0,
          color: resolveAccentColor(indicator.code),
          helper: 'Sem leitura no periodo'
        }))

  const storeScores = (dashboard?.stores || []).map(store => asNumber(store.score))
  const topIndicator = dashboard?.indicators[0]

  return {
    title: 'Resumo operacional do periodo',
    description: dashboard
      ? `${clientLabel} com ${formatCount(dashboard.evaluationCount)} avaliacao(oes) consolidadas no recorte aplicado.`
      : `${clientLabel} ainda nao possui consolidado para o recorte aplicado.`,
    chart,
    stats: [
      {
        id: 'evaluations',
        label: 'Avaliacoes',
        value: formatCount(dashboard?.evaluationCount || 0),
        helper: `${formatCount(dashboard?.stores.length || 0)} loja(s) com leitura no periodo`
      },
      {
        id: 'average-score',
        label: 'Media geral',
        value: formatPercent(averageScore(storeScores)),
        helper: storeScores.length > 0 ? 'Media do score consolidado por loja' : 'Sem score consolidado no recorte'
      },
      {
        id: 'top-indicator',
        label: 'Top indicador',
        value: topIndicator?.name || 'Sem indicador',
        helper: topIndicator ? `${formatPercent(topIndicator.score)} no periodo` : 'Aguardando avaliacao'
      },
      {
        id: 'template',
        label: 'Template ativo',
        value: dashboard?.summary.templateLabel || 'Sem template',
        helper: dashboard?.summary.activeProfileName || 'Perfil ativo nao identificado'
      }
    ],
    ranking: (dashboard?.ranking || []).map(store => ({
      id: store.storeId,
      unitName: store.unitName,
      score: asNumber(store.score),
      usedWeight: asNumber(store.usedWeight),
      accentColor: resolveAccentColor(store.storeId, store.accentColor),
      helper: `${formatCount(store.evaluationsCount)} avaliacao(oes) • ${formatScopeLabel(toScopeMode(store.scopeMode))}`
    }))
  }
}

export function mapEvaluationRecord(item: ApiEvaluationListItem): IndicatorEvaluationRecord {
  return {
    id: asString(item.id),
    evaluatorName: asString(item.evaluatorName, 'Nao informado'),
    unitId: asString(item.storeId, 'client-global'),
    unitName: asString(item.unitName, 'Cliente global'),
    periodStart: asString(item.periodStart),
    periodEnd: asString(item.periodEnd),
    indicatorCodes: Array.isArray(item.indicatorCodes) ? item.indicatorCodes.map(code => asString(code)).filter(Boolean) : [],
    indicatorLabels: Array.isArray(item.indicatorLabels) ? item.indicatorLabels.map(label => asString(label)).filter(Boolean) : []
  }
}

function evaluationLineValue(item: ApiEvaluationItemView) {
  const inputType = toInputType(item.inputType)

  if (inputType === 'boolean') {
    return item.valueBoolean ? 'Sim' : 'Nao'
  }

  if (typeof item.valueNumeric === 'number') {
    return formatMetricValue(item.valueNumeric, inputType === 'currency' ? 'currency' : inputType === 'count' ? 'count' : 'score')
  }

  const text = asString(item.valueText)
  if (text) {
    return text
  }

  return item.notes ? asString(item.notes) : 'Sem valor informado'
}

function detailToneFromScore(score: number) {
  if (score >= 90) return 'success'
  if (score >= 75) return 'warning'
  return 'error'
}

function assetPreviewLabel(asset: ApiAssetView) {
  const uploadedAt = asString(asset.uploadedAt)
  if (uploadedAt) {
    return `${asString(asset.contentType || asset.assetKind, 'arquivo')} • ${formatDisplayDateTime(uploadedAt)}`
  }

  return asString(asset.contentType || asset.assetKind, 'arquivo')
}

function buildStoreCard(
  indicator: IndicatorsProfileIndicatorConfig,
  store: IndicatorsStoreOverride,
  dashboardStore: ApiDashboardStore | undefined,
  detailEntries: ApiEvaluationDetail[]
): IndicatorStoreCard {
  const indicatorScore = dashboardStore?.indicators.find(item => item.code === indicator.code)
  const detailRows = detailEntries
    .map((detail) => {
      const indicatorDetail = detail.indicators.find(item => item.code === indicator.code)
      if (!indicatorDetail) {
        return null
      }

      return {
        id: `${detail.id}-${indicatorDetail.recordId}`,
        evaluatorName: asString(detail.evaluatorName, 'Nao informado'),
        evaluatedAt: formatDisplayDateTime(asString(detail.updatedAt || detail.createdAt || `${detail.periodEnd}T12:00:00`)),
        rawScore: indicatorDetail.rawValueNumeric === undefined ? 'N/D' : formatMetricValue(indicatorDetail.rawValueNumeric, indicator.valueType),
        finalScore: formatPercent(indicatorDetail.score),
        lines: indicatorDetail.items.map(item => ({
          id: item.recordId,
          label: item.label,
          value: evaluationLineValue(item),
          tone: detailToneFromScore(asNumber(item.score))
        })),
        assets: detail.assets.slice(0, 4).map(asset => ({
          id: asset.recordId,
          title: asString(asset.fileName, asset.assetKind),
          previewLabel: assetPreviewLabel(asset),
          accentColor: store.accentColor
        }))
      }
    })
    .filter(Boolean)

  const metrics = indicatorScore
    ? [
        {
          id: 'score',
          label: 'Score',
          value: formatPercent(indicatorScore.score),
          tone: toIndicatorTone(indicatorScore.tone)
        },
        {
          id: 'weight',
          label: 'Peso usado',
          value: formatPercent(indicatorScore.weight)
        },
        {
          id: 'evaluations',
          label: 'Avaliacoes',
          value: formatCount(indicatorScore.evaluationsCount)
        }
      ]
    : [
        {
          id: 'scope',
          label: 'Escopo',
          value: formatScopeLabel(store.scopeMode)
        },
        {
          id: 'status',
          label: 'Status',
          value: store.status
        }
      ]

  const bullets = [
    indicator.sourceKind === 'manual'
      ? 'Coleta manual mantida no perfil ativo.'
      : `Origem ${indicator.sourceKind}${indicator.sourceModule ? ` via ${indicator.sourceModule}` : ''}.`,
    indicator.supportsStoreBreakdown ? 'Aceita quebra por loja.' : 'Consolidado no cliente.',
    indicator.evidencePolicy === 'required' ? 'Evidencia obrigatoria.' : 'Evidencia flexivel.'
  ]

  if (store.note) {
    bullets.push(store.note)
  }

  return {
    id: `${store.id}-${indicator.code}`,
    unitId: store.id,
    unitName: store.unitName,
    accentColor: store.accentColor,
    scoreLabel: indicatorScore ? 'Score consolidado do indicador' : 'Sem score consolidado',
    scoreValue: indicatorScore ? formatPercent(indicatorScore.score) : '--',
    scoreDescription: indicatorScore
      ? `${formatCount(indicatorScore.evaluationsCount)} avaliacao(oes) para ${store.unitName} neste recorte.`
      : `Nenhuma leitura do indicador ${indicator.name} para ${store.unitName} no recorte aplicado.`,
    metrics,
    bulletTitle: 'Leituras do perfil',
    bullets,
    ctaLabel: detailRows.length > 0 ? `Ver ${detailRows.length} avaliacao(oes)` : undefined,
    detailEntries: detailRows,
    detailFooter: store.note || undefined,
    emptyMessage: !indicatorScore && detailRows.length === 0 ? 'Sem avaliacao detalhada para este indicador neste periodo.' : undefined
  }
}

export function buildIndicatorSections(
  indicators: IndicatorsProfileIndicatorConfig[],
  stores: IndicatorsStoreOverride[],
  dashboard: ApiDashboardResponse | null,
  details: ApiEvaluationDetail[]
): IndicatorSectionModel[] {
  const dashboardStoreById = new Map((dashboard?.stores || []).map(store => [store.storeId, store]))
  const detailsByStore = details.reduce<Record<string, ApiEvaluationDetail[]>>((accumulator, detail) => {
    const storeId = asString(detail.storeId, 'client-global')
    accumulator[storeId] = accumulator[storeId] || []
    accumulator[storeId]?.push(detail)
    return accumulator
  }, {})

  return indicators
    .filter(indicator => indicator.enabled)
    .map((indicator, index) => ({
      code: indicator.code,
      order: index + 1,
      title: indicator.name,
      weight: indicator.weight,
      description: indicator.description || `Indicador ${indicator.code} no perfil ativo.`,
      itemLabels: indicator.items.map(item => item.label),
      chart: stores.map((store) => {
        const dashboardStore = dashboardStoreById.get(store.id)
        const indicatorScore = dashboardStore?.indicators.find(item => item.code === indicator.code)

        return {
          id: `${indicator.code}-${store.id}`,
          label: store.unitName,
          value: asNumber(indicatorScore?.score),
          color: store.accentColor,
          helper: indicatorScore
            ? `${formatCount(indicatorScore.evaluationsCount)} avaliacao(oes)`
            : 'Sem leitura no periodo'
        }
      }),
      stores: stores.map(store => buildStoreCard(
        indicator,
        store,
        dashboardStoreById.get(store.id),
        detailsByStore[store.id] || []
      ))
    }))
}

function mapTemplateVersion(version: ApiTemplateVersionSummary) {
  return {
    id: asString(version.recordId),
    versionLabel: `v${Math.max(1, Math.round(asNumber(version.versionNumber, 1)))}`,
    status: toTemplateStatus(version.status),
    publishedAt: asString(version.publishedAt) ? formatDisplayDate(asString(version.publishedAt).slice(0, 10)) : undefined,
    note: asString(version.notes, 'Sem observacao')
  }
}

export function mapTemplateListItem(template: ApiTemplateListItem, detail?: ApiTemplateDetail): IndicatorsTemplateCatalogItem {
  return {
    id: asString(template.recordId),
    code: asString(template.code),
    name: asString(template.name, 'Template'),
    description: asString(template.description),
    status: toTemplateStatus(template.status),
    defaultScopeMode: toScopeMode(template.defaultScopeMode),
    categoryCount: asNumber(template.categoryCount),
    indicatorCount: asNumber(template.indicatorCount),
    clientCount: asNumber(template.clientCount),
    versions: Array.isArray(template.versions) ? template.versions.map(mapTemplateVersion) : [],
    highlights: buildTemplateHighlights(template, detail)
  }
}

function mapGovernanceStat(item: ApiGovernanceStat): IndicatorsGovernanceStat {
  const tone = asString(item.tone, 'neutral')
  return {
    id: asString(item.id),
    label: asString(item.label),
    value: asString(item.value),
    helper: asString(item.helper),
    tone: tone === 'success' || tone === 'warning' ? tone : 'neutral'
  }
}

function mapGovernancePolicy(item: ApiGovernancePolicy): IndicatorsDefaultPolicy {
  const state = asString(item.state, 'recommended')
  return {
    id: asString(item.id),
    title: asString(item.title),
    description: asString(item.description),
    state: state === 'system' || state === 'custom' ? state : 'recommended',
    value: asString(item.value),
    affectedArea: asString(item.affectedArea)
  }
}

function mapGovernanceTenantAdoption(item: ApiGovernanceTenantAdoption): IndicatorsTenantAdoption {
  const rolloutStatus = asString(item.rolloutStatus, 'pilot')
  return {
    id: asString(item.id),
    clientLabel: asString(item.clientLabel),
    activeTemplate: asString(item.activeTemplate),
    scopeMode: toScopeMode(item.scopeMode),
    rolloutStatus: rolloutStatus === 'stable' || rolloutStatus === 'rolling' ? rolloutStatus : 'pilot',
    providerCoverage: asString(item.providerCoverage),
    lastChangeLabel: asString(item.lastChangeLabel)
  }
}

function mapGovernanceRoadmapItem(item: ApiGovernanceRoadmapItem): IndicatorsRoadmapCard {
  const stage = asString(item.stage, 'later')
  return {
    id: asString(item.id),
    title: asString(item.title),
    description: asString(item.description),
    stage: stage === 'now' || stage === 'next' ? stage : 'later',
    owner: asString(item.owner),
    dependencies: Array.isArray(item.dependencies)
      ? item.dependencies.map(entry => asString(entry)).filter(Boolean)
      : []
  }
}

export function mapGovernanceOverview(payload: ApiGovernanceOverview): IndicatorsGovernanceOverviewState {
  return {
    stats: Array.isArray(payload.stats) ? payload.stats.map(mapGovernanceStat) : [],
    policies: Array.isArray(payload.policies) ? payload.policies.map(mapGovernancePolicy) : [],
    providers: Array.isArray(payload.providers) ? payload.providers.map(mapProvider) : [],
    tenantAdoption: Array.isArray(payload.tenantAdoption)
      ? payload.tenantAdoption.map(mapGovernanceTenantAdoption)
      : [],
    roadmap: Array.isArray(payload.roadmap) ? payload.roadmap.map(mapGovernanceRoadmapItem) : []
  }
}

function mapTemplateCategory(category: ApiTemplateCategoryConfig) {
  return {
    code: asString(category.code),
    name: asString(category.name),
    description: asString(category.description),
    sortOrder: Math.max(0, Math.round(asNumber(category.sortOrder))),
    weight: asNumber(category.weight),
    scopeMode: toScopeMode(category.scopeMode),
    metadata: asMap(category.metadata),
    indicators: Array.isArray(category.indicators)
      ? category.indicators.map(indicator => ({
          id: asString(indicator.id),
          code: asString(indicator.code),
          name: asString(indicator.name),
          description: asString(indicator.description),
          indicatorKind: asString(indicator.indicatorKind),
          sourceKind: asString(indicator.sourceKind),
          sourceModule: asString(indicator.sourceModule),
          sourceMetricKey: asString(indicator.sourceMetricKey),
          scopeMode: asString(indicator.scopeMode),
          aggregationMode: asString(indicator.aggregationMode),
          valueType: asString(indicator.valueType),
          evidencePolicy: asString(indicator.evidencePolicy),
          weight: asNumber(indicator.weight),
          required: asBoolean(indicator.required),
          supportsStoreBreakdown: asBoolean(indicator.supportsStoreBreakdown),
          settings: asMap(indicator.settings),
          metadata: asMap(indicator.metadata),
          items: Array.isArray(indicator.items)
            ? indicator.items.map(item => ({
                id: asString(item.id),
                label: asString(item.label),
                description: asString(item.description),
                inputType: asString(item.inputType),
                evidencePolicy: asString(item.evidencePolicy),
                sourceMetricKey: asString(item.sourceMetricKey),
                weight: asNumber(item.weight),
                required: asBoolean(item.required),
                selectOptions: Array.isArray(item.selectOptions) ? item.selectOptions.map(option => asMap(option)) : [],
                config: asMap(item.config),
                metadata: asMap(item.metadata)
              }))
            : []
        }))
      : []
  }
}

export function buildTemplateMutationPayload(
  detail: ApiTemplateDetail,
  overrides: Partial<{
    code: string
    name: string
    description: string
    status: string
    publish: boolean
    notes: string
  }> = {}
) {
  return {
    code: asString(overrides.code, detail.code),
    name: asString(overrides.name, detail.name),
    description: asString(overrides.description, detail.description),
    status: asString(overrides.status, detail.status),
    taxonomyVersion: Math.max(1, Math.round(asNumber(detail.taxonomyVersion, 1))),
    isSystem: asBoolean(detail.isSystem),
    defaultScopeMode: toScopeMode(detail.defaultScopeMode),
    metadata: asMap(detail.metadata),
    notes: asString(overrides.notes, detail.workingVersion?.notes || ''),
    publish: asBoolean(overrides.publish),
    categories: detail.categories.map(category => ({
      code: asString(category.code),
      name: asString(category.name),
      description: asString(category.description),
      sortOrder: Math.max(0, Math.round(asNumber(category.sortOrder))),
      weight: asNumber(category.weight),
      scopeMode: asString(category.scopeMode),
      metadata: asMap(category.metadata),
      indicators: category.indicators.map(indicator => ({
        id: asString(indicator.id),
        code: asString(indicator.code),
        name: asString(indicator.name),
        description: asString(indicator.description),
        indicatorKind: asString(indicator.indicatorKind),
        sourceKind: asString(indicator.sourceKind),
        sourceModule: asString(indicator.sourceModule),
        sourceMetricKey: asString(indicator.sourceMetricKey),
        scopeMode: asString(indicator.scopeMode),
        aggregationMode: asString(indicator.aggregationMode),
        valueType: asString(indicator.valueType),
        evidencePolicy: asString(indicator.evidencePolicy),
        weight: asNumber(indicator.weight),
        required: asBoolean(indicator.required),
        supportsStoreBreakdown: asBoolean(indicator.supportsStoreBreakdown),
        settings: asMap(indicator.settings),
        metadata: asMap(indicator.metadata),
        items: indicator.items.map(item => ({
          id: asString(item.id),
          label: asString(item.label),
          description: asString(item.description),
          inputType: asString(item.inputType),
          evidencePolicy: asString(item.evidencePolicy),
          sourceMetricKey: asString(item.sourceMetricKey),
          weight: asNumber(item.weight),
          required: asBoolean(item.required),
          selectOptions: Array.isArray(item.selectOptions) ? item.selectOptions.map(option => asMap(option)) : [],
          config: asMap(item.config),
          metadata: asMap(item.metadata)
        }))
      }))
    }))
  }
}

export function buildGovernanceStats(
  templates: IndicatorsTemplateCatalogItem[],
  providers: IndicatorsProviderHealth[],
  selectedTemplate: IndicatorsTemplateCatalogItem | null
): IndicatorsGovernanceStat[] {
  const activeTemplates = templates.filter(template => template.status === 'active').length
  const draftTemplates = templates.filter(template => template.status === 'draft').length
  const publishedVersions = templates.reduce((sum, template) => {
    return sum + template.versions.filter(version => version.status === 'active').length
  }, 0)
  const onlineProviders = providers.filter(provider => provider.status === 'online').length

  return [
    {
      id: 'templates',
      label: 'Templates',
      value: formatCount(templates.length),
      helper: `${formatCount(activeTemplates)} ativos • ${formatCount(draftTemplates)} em draft`,
      tone: draftTemplates > 0 ? 'warning' : 'success'
    },
    {
      id: 'versions',
      label: 'Versoes publicadas',
      value: formatCount(publishedVersions),
      helper: selectedTemplate ? selectedTemplate.name : 'Nenhum template selecionado',
      tone: publishedVersions > 0 ? 'success' : 'neutral'
    },
    {
      id: 'providers',
      label: 'Providers online',
      value: `${formatCount(onlineProviders)}/${formatCount(providers.length)}`,
      helper: providers.length > 0 ? 'Saude do cliente em foco' : 'Sem cliente em foco para providers',
      tone: providers.length > 0 && onlineProviders === providers.length ? 'success' : 'warning'
    },
    {
      id: 'coverage',
      label: 'Clientes cobertos',
      value: formatCount(templates.reduce((sum, template) => Math.max(sum, template.clientCount), 0)),
      helper: 'Maior alcance declarado no catalogo',
      tone: 'neutral'
    }
  ]
}

export function buildGovernancePolicies(
  selectedTemplate: IndicatorsTemplateCatalogItem | null,
  policyStateOverrides: Record<string, IndicatorsGovernancePolicyState>
): IndicatorsDefaultPolicy[] {
  const templateName = selectedTemplate?.name || 'Sem template'

  return [
    {
      id: 'default-scope',
      title: 'Escopo default',
      description: `Escopo recomendado para o template ${templateName}.`,
      state: policyStateOverrides['default-scope'] || 'system',
      value: selectedTemplate ? formatScopeLabel(selectedTemplate.defaultScopeMode) : 'Nao definido',
      affectedArea: 'Perfil ativo'
    },
    {
      id: 'publication-flow',
      title: 'Fluxo de publicacao',
      description: 'Regra visual para distinguir draft, ativo e arquivado no catalogo global.',
      state: policyStateOverrides['publication-flow'] || 'recommended',
      value: selectedTemplate?.status || 'draft',
      affectedArea: 'Templates'
    },
    {
      id: 'provider-sync',
      title: 'Sincronizacao de providers',
      description: 'Padrao minimo esperado antes de publicar templates com indicadores derivados.',
      state: policyStateOverrides['provider-sync'] || 'custom',
      value: selectedTemplate?.highlights[0] || 'Sem binding destacado',
      affectedArea: 'Providers'
    }
  ]
}

export function buildTenantAdoption(
  summary: IndicatorsModuleSummary | null,
  selectedTemplate: IndicatorsTemplateCatalogItem | null,
  providers: IndicatorsProviderHealth[]
): IndicatorsTenantAdoption[] {
  if (!summary || !selectedTemplate) {
    return []
  }

  return [
    {
      id: `${summary.clientLabel}-${selectedTemplate.id}`,
      clientLabel: summary.clientLabel,
      activeTemplate: selectedTemplate.name,
      scopeMode: selectedTemplate.defaultScopeMode,
      rolloutStatus: selectedTemplate.status === 'active' ? 'stable' : selectedTemplate.status === 'draft' ? 'rolling' : 'pilot',
      providerCoverage: `${providers.filter(provider => provider.status === 'online').length}/${providers.length}`,
      lastChangeLabel: summary.lastSyncLabel
    }
  ]
}

export function createTemplateDuplicateCode(code: string) {
  const normalized = asString(code, 'indicators-template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalized || 'indicators-template'}-copy-${Date.now().toString().slice(-6)}`
}

export function createTemplateDuplicateName(name: string) {
  const normalized = asString(name, 'Template')
  return `${normalized} Copia ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date())}`
}

export function buildProfileSavePayload(
  meta: IndicatorsProfileDraftMeta,
  indicators: IndicatorsProfileIndicatorConfig[]
) {
  return {
    name: meta.name,
    description: meta.description,
    status: meta.status,
    scopeMode: meta.scopeMode,
    storeBreakdownEnabled: meta.storeBreakdownEnabled,
    providerSyncEnabled: meta.providerSyncEnabled,
    metadata: deepClone(meta.metadata),
    indicators: indicators.map(indicator => ({
      id: indicator.id,
      code: indicator.code,
      categoryCode: indicator.categoryCode,
      categoryLabel: indicator.categoryLabel,
      name: indicator.name,
      description: indicator.description,
      enabled: indicator.enabled,
      weight: indicator.weight,
      scopeMode: indicator.scopeMode,
      sourceKind: indicator.sourceKind,
      sourceModule: indicator.sourceModule,
      sourceMetricKey: indicator.sourceMetricKey,
      valueType: indicator.valueType,
      evidencePolicy: indicator.evidencePolicy,
      supportsStoreBreakdown: indicator.supportsStoreBreakdown,
      required: Boolean(indicator.required),
      tags: [...indicator.tags],
      settings: deepClone(indicator.settings || {}),
      metadata: deepClone(indicator.metadata || {}),
      items: indicator.items.map(item => ({
        id: item.id,
        label: item.label,
        inputType: item.inputType,
        evidencePolicy: item.evidencePolicy,
        required: item.required,
        weight: item.weight,
        helper: item.helper,
        sourceMetricKey: item.sourceMetricKey,
        selectOptions: deepClone(item.selectOptions || []),
        config: deepClone(item.config || {}),
        metadata: deepClone(item.metadata || {})
      }))
    }))
  }
}

export function buildStoreOverrideSavePayload(store: IndicatorsStoreOverride) {
  return {
    scopeMode: store.scopeMode,
    status: store.status,
    note: store.note,
    rules: store.overrides.map(rule => ({
        indicatorId: rule.id,
        enabled: rule.enabled,
        weight: rule.weight,
        note: rule.note
      }))
  }
}

export function cloneIndicators<T>(value: T): T {
  return deepClone(value)
}

export function useIndicatorsApi() {
  const sessionSimulation = useSessionSimulationStore()
  const { coreApiFetch } = useCoreApi()

  function scopedClientId() {
    const parsed = Number(sessionSimulation.effectiveClientId || 0)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }

  function scopedCoreTenantId() {
    const normalized = String(sessionSimulation.activeClientCoreTenantId || '').trim()
    return normalized || ''
  }

  async function request<T>(
    path: string,
    options: Record<string, unknown> = {},
    config: { scoped?: boolean } = {}
  ) {
    const query = asMap(options.query)
    const clientId = scopedClientId()
    const coreTenantId = scopedCoreTenantId()
    const resolvedQuery = config.scoped === false || (clientId <= 0 && !coreTenantId)
      ? query
      : {
          ...query,
          clientId: clientId > 0 ? clientId : query.clientId,
          coreTenantId: coreTenantId || query.coreTenantId
        }

    return coreApiFetch<T>(`${INDICATORS_API_BASE}${path}`, {
      ...options,
      query: resolvedQuery
    } as never)
  }

  async function getActiveProfile() {
    const response = await request<ApiEnvelope<ApiActiveProfileResponse>>('/profiles/active')
    return response.item
  }

  async function replaceActiveProfile(body: ReturnType<typeof buildProfileSavePayload>) {
    const response = await request<ApiEnvelope<ApiActiveProfileResponse>>('/profiles/active', {
      method: 'PUT',
      body
    })
    return response.item
  }

  async function replaceStoreOverride(storeId: string, body: ReturnType<typeof buildStoreOverrideSavePayload>) {
    const response = await request<ApiEnvelope<ApiStoreOverrideView>>(`/profiles/active/stores/${storeId}`, {
      method: 'PUT',
      body
    })
    return response.item
  }

  async function getDashboard(startDate: string, endDate: string) {
    const response = await request<ApiEnvelope<ApiDashboardResponse>>('/dashboard', {
      query: { startDate, endDate }
    })
    return response.item
  }

  async function getGovernanceOverview() {
    const response = await request<ApiEnvelope<ApiGovernanceOverview>>('/governance', {}, {
      scoped: false
    })
    return response.item
  }

  async function updateGovernancePolicy(policyId: string, state: IndicatorsGovernancePolicyState) {
    const response = await request<ApiEnvelope<ApiGovernancePolicy>>(`/governance/policies/${policyId}`, {
      method: 'PATCH',
      body: { state }
    }, {
      scoped: false
    })
    return response.item
  }

  async function listEvaluations(startDate: string, endDate: string) {
    const response = await request<ApiItemsEnvelope<ApiEvaluationListItem>>('/evaluations', {
      query: {
        startDate,
        endDate,
        page: 1,
        limit: DEFAULT_FETCH_LIMIT
      }
    })

    return Array.isArray(response.items) ? response.items : []
  }

  async function getEvaluation(evaluationId: string) {
    const response = await request<ApiEnvelope<ApiEvaluationDetail>>(`/evaluations/${evaluationId}`)
    return response.item
  }

  async function createEvaluation(body: Record<string, unknown>) {
    const response = await request<ApiEnvelope<ApiEvaluationDetail>>('/evaluations', {
      method: 'POST',
      body
    })
    return response.item
  }

  async function deleteEvaluation(evaluationId: string) {
    await request<{ ok: boolean }>(`/evaluations/${evaluationId}`, {
      method: 'DELETE'
    })
  }

  async function listTemplates() {
    const response = await request<ApiItemsEnvelope<ApiTemplateListItem>>('/templates', {
      query: {
        page: 1,
        limit: 50
      }
    }, {
      scoped: false
    })

    return Array.isArray(response.items) ? response.items : []
  }

  async function getTemplate(templateId: string) {
    const response = await request<ApiEnvelope<ApiTemplateDetail>>(`/templates/${templateId}`, {}, {
      scoped: false
    })
    return response.item
  }

  async function createTemplate(body: Record<string, unknown>) {
    const response = await request<ApiEnvelope<ApiTemplateDetail>>('/templates', {
      method: 'POST',
      body
    }, {
      scoped: false
    })
    return response.item
  }

  async function updateTemplate(templateId: string, body: Record<string, unknown>) {
    const response = await request<ApiEnvelope<ApiTemplateDetail>>(`/templates/${templateId}`, {
      method: 'PATCH',
      body
    }, {
      scoped: false
    })
    return response.item
  }

  return {
    scopedClientId,
    getActiveProfile,
    replaceActiveProfile,
    replaceStoreOverride,
    getDashboard,
    getGovernanceOverview,
    updateGovernancePolicy,
    listEvaluations,
    getEvaluation,
    createEvaluation,
    deleteEvaluation,
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate
  }
}