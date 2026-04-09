export type QaItemStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done'
export type QaItemPriority = 'alta' | 'media' | 'baixa'
export type QaItemSource = 'novo' | 'legado_refatorar' | 'ja_existe'
export type QaItemEffort = 'S' | 'M' | 'L' | 'XL'

export type QaFieldKey =
  | 'block'
  | 'sprint'
  | 'squad'
  | 'feature'
  | 'status'
  | 'priority'
  | 'source'
  | 'owner'
  | 'targetPage'
  | 'effort'
  | 'notes'

export interface QaFeatureItem {
  id: number
  block: string
  sprint: string
  squad: string
  feature: string
  status: QaItemStatus
  priority: QaItemPriority
  source: QaItemSource
  owner: string
  targetPage: string
  effort: QaItemEffort
  notes: string
  updatedAt: string
}

export interface QaCapabilityBlock {
  title: string
  objective: string
  items: string[]
}

export const QA_STATUS_OPTIONS: Array<{ label: string, value: QaItemStatus }> = [
  { label: 'To do', value: 'todo' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' }
]

export const QA_PRIORITY_OPTIONS: Array<{ label: string, value: QaItemPriority }> = [
  { label: 'Alta', value: 'alta' },
  { label: 'Media', value: 'media' },
  { label: 'Baixa', value: 'baixa' }
]

export const QA_SOURCE_OPTIONS: Array<{ label: string, value: QaItemSource }> = [
  { label: 'Novo', value: 'novo' },
  { label: 'Legado para refatorar', value: 'legado_refatorar' },
  { label: 'Ja existe (ajuste)', value: 'ja_existe' }
]

export const QA_EFFORT_OPTIONS: Array<{ label: string, value: QaItemEffort }> = [
  { label: 'S', value: 'S' },
  { label: 'M', value: 'M' },
  { label: 'L', value: 'L' },
  { label: 'XL', value: 'XL' }
]

export interface QaListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface QaListFilters {
  blocks: string[]
  sprints: string[]
  squads: string[]
}

export interface QaListResponse {
  status: 'success'
  data: QaFeatureItem[]
  meta: QaListMeta
  filters: QaListFilters
  capabilities: QaCapabilityBlock[]
}

export interface QaMutationResponse {
  status: 'success'
  data: QaFeatureItem
}
