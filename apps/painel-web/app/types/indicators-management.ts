export type IndicatorsScopeMode = 'client_global' | 'per_store'

export type IndicatorsSourceKind = 'manual' | 'provider' | 'hybrid'

export type IndicatorsEvidencePolicy = 'inherit' | 'none' | 'optional' | 'required'

export type IndicatorsValueType = 'score' | 'percent' | 'currency' | 'count' | 'boolean' | 'composite'

export type IndicatorsInputType = 'boolean' | 'score' | 'percent' | 'currency' | 'count' | 'text' | 'image' | 'image_required' | 'select' | 'provider_metric'

export type IndicatorsProviderStatus = 'online' | 'attention' | 'offline'

export type IndicatorsTemplateStatus = 'draft' | 'active' | 'archived'

export type IndicatorsGovernancePolicyState = 'system' | 'recommended' | 'custom'

export type IndicatorsStoreOverrideStatus = 'inherit' | 'custom' | 'paused'

export type IndicatorsTargetStatus = 'on_track' | 'risk' | 'off_track'

export type IndicatorsRolloutStatus = 'pilot' | 'rolling' | 'stable'

export type IndicatorsRoadmapStage = 'now' | 'next' | 'later'

export interface IndicatorsModuleSummary {
  clientLabel: string
  activeProfileName: string
  templateLabel: string
  storesConfigured: number
  providerOnlineCount: number
  providerTotal: number
  pendingChanges: number
  lastSyncLabel: string
}

export interface IndicatorsProfileItemConfig {
  id: string
  label: string
  inputType: IndicatorsInputType
  evidencePolicy: IndicatorsEvidencePolicy
  required: boolean
  weight: number
  helper?: string
  sourceMetricKey?: string
  selectOptions?: Array<Record<string, unknown>>
  config?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface IndicatorsProfileIndicatorConfig {
  id: string
  code: string
  categoryCode: string
  categoryLabel: string
  name: string
  description: string
  enabled: boolean
  weight: number
  scopeMode: IndicatorsScopeMode
  sourceKind: IndicatorsSourceKind
  sourceModule?: string
  sourceMetricKey?: string
  valueType: IndicatorsValueType
  evidencePolicy: IndicatorsEvidencePolicy
  supportsStoreBreakdown: boolean
  required?: boolean
  tags: string[]
  settings?: Record<string, unknown>
  metadata?: Record<string, unknown>
  items: IndicatorsProfileItemConfig[]
}

export interface IndicatorsStoreOverrideRule {
  id: string
  label: string
  enabled: boolean
  weight: number | null
  note: string
  changed: boolean
}

export interface IndicatorsStoreOverride {
  id: string
  unitName: string
  accentColor: string
  managerName: string
  ranking: number
  score: number
  scopeMode: IndicatorsScopeMode
  status: IndicatorsStoreOverrideStatus
  note: string
  overrides: IndicatorsStoreOverrideRule[]
}

export interface IndicatorsTargetItem {
  id: string
  label: string
  currentValue: string
  targetValue: string
  unitLabel: string
  status: IndicatorsTargetStatus
}

export interface IndicatorsTargetSetSummary {
  id: string
  name: string
  periodLabel: string
  scopeMode: IndicatorsScopeMode
  status: IndicatorsTemplateStatus
  items: IndicatorsTargetItem[]
}

export interface IndicatorsProviderHealth {
  id: string
  name: string
  sourceModule: string
  status: IndicatorsProviderStatus
  freshnessLabel: string
  coverageLabel: string
  mappedIndicators: string[]
  note: string
}

export interface IndicatorsConfigSnapshot {
  enabledIndicators: number
  enabledWeight: number
  customStores: number
  providerBindings: number
  requiredEvidence: number
}

export interface IndicatorsTemplateVersion {
  id: string
  versionLabel: string
  status: IndicatorsTemplateStatus
  publishedAt?: string
  note: string
}

export interface IndicatorsTemplateCatalogItem {
  id: string
  code: string
  name: string
  description: string
  status: IndicatorsTemplateStatus
  defaultScopeMode: IndicatorsScopeMode
  categoryCount: number
  indicatorCount: number
  clientCount: number
  versions: IndicatorsTemplateVersion[]
  highlights: string[]
}

export interface IndicatorsGovernanceStat {
  id: string
  label: string
  value: string
  helper?: string
  tone?: 'neutral' | 'success' | 'warning'
}

export interface IndicatorsDefaultPolicy {
  id: string
  title: string
  description: string
  state: IndicatorsGovernancePolicyState
  value: string
  affectedArea: string
}

export interface IndicatorsTenantAdoption {
  id: string
  clientLabel: string
  activeTemplate: string
  scopeMode: IndicatorsScopeMode
  rolloutStatus: IndicatorsRolloutStatus
  providerCoverage: string
  lastChangeLabel: string
}

export interface IndicatorsRoadmapCard {
  id: string
  title: string
  description: string
  stage: IndicatorsRoadmapStage
  owner: string
  dependencies: string[]
}