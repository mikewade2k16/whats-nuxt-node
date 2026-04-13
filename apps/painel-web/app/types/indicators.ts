export type IndicatorCode = string

export type IndicatorTone = 'neutral' | 'success' | 'warning' | 'error'

export type IndicatorExportFormat = 'csv' | 'xlsx' | 'pdf'

export interface IndicatorExportRequest {
  format: IndicatorExportFormat
  unitId?: string
}

export interface IndicatorRangePreset {
  id: string
  label: string
}

export interface IndicatorSelectionOption {
  code: IndicatorCode
  label: string
  shortLabel: string
  weight: number
}

export interface IndicatorTeamSnapshot {
  stiAverage: number
  survey360: number
}

export interface IndicatorTargetSnapshot {
  returnTarget: number
  revenueTarget: number
  avgTicketTarget: number
  discountTarget: number
}

export interface IndicatorUnitOption {
  id: string
  label: string
  accentColor: string
  teamSnapshot: IndicatorTeamSnapshot
  targetSnapshot: IndicatorTargetSnapshot
}

export interface IndicatorEvaluationRecord {
  id: string | number
  evaluatorName: string
  unitId: string
  unitName: string
  periodStart: string
  periodEnd: string
  indicatorCodes: IndicatorCode[]
  indicatorLabels: string[]
}

export interface IndicatorChartDatum {
  id: string
  label: string
  value: number
  color: string
  helper?: string
}

export interface IndicatorDashboardStat {
  id: string
  label: string
  value: string
  helper?: string
}

export interface IndicatorDashboardRankingItem {
  id: string
  unitName: string
  score: number
  usedWeight: number
  accentColor: string
  helper?: string
}

export interface IndicatorDashboardModel {
  title: string
  description: string
  chart: IndicatorChartDatum[]
  stats: IndicatorDashboardStat[]
  ranking: IndicatorDashboardRankingItem[]
}

export interface IndicatorStoreMetric {
  id: string
  label: string
  value: string
  tone?: IndicatorTone
}

export interface IndicatorDetailLine {
  id: string
  label: string
  value: string
  tone?: IndicatorTone
}

export interface IndicatorDetailAsset {
  id: string
  title: string
  previewLabel: string
  accentColor?: string
}

export interface IndicatorDetailEntry {
  id: string
  evaluatorName: string
  evaluatedAt: string
  rawScore: string
  finalScore: string
  lines: IndicatorDetailLine[]
  assets?: IndicatorDetailAsset[]
}

export interface IndicatorStoreCard {
  id: string
  unitId: string
  unitName: string
  accentColor: string
  scoreLabel: string
  scoreValue: string
  scoreDescription?: string
  metrics: IndicatorStoreMetric[]
  bulletTitle?: string
  bullets: string[]
  ctaLabel?: string
  detailEntries: IndicatorDetailEntry[]
  detailFooter?: string
  emptyMessage?: string
}

export interface IndicatorSectionModel {
  code: IndicatorCode
  order: number
  title: string
  weight: number
  description: string
  itemLabels: string[]
  chart: IndicatorChartDatum[]
  stores: IndicatorStoreCard[]
}

export interface IndicatorEvaluationDraftPayload {
  evaluatorName: string
  unitId: string
  unitName: string
  periodStart: string
  periodEnd: string
  indicatorCodes: IndicatorCode[]
}