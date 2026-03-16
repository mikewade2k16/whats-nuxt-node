export interface FinanceLineAdjustment {
  id: string
  amount: number
  note: string
  date: string
}

export interface FinanceLineItem {
  id: string
  description: string
  category: string
  effective: boolean
  effectiveDate: string
  amount: number
  adjustmentAmount: number
  adjustments: FinanceLineAdjustment[]
  fixedAccountId: string
  details: string
}

export interface FinanceSheetSummary {
  expectedIn: number
  effectiveIn: number
  expectedOut: number
  effectiveOut: number
  expectedBalance: number
  effectiveBalance: number
}

export interface FinanceSheetItem {
  id: number
  title: string
  period: string
  status: string
  notes: string
  clientId: number
  clientName: string
  entradas: FinanceLineItem[]
  saidas: FinanceLineItem[]
  summary: FinanceSheetSummary
  preview: string
  createdAt: string
  updatedAt: string
}

export interface FinancesListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface FinancesListResponse {
  status: 'success'
  data: FinanceSheetItem[]
  meta: FinancesListMeta
}

export interface FinanceMutationResponse {
  status: 'success'
  data: FinanceSheetItem
}

export type FinanceConfigKind = 'entrada' | 'saida' | 'ambas'

export interface FinanceCategoryConfig {
  id: string
  name: string
  kind: FinanceConfigKind
  description: string
}

export interface FinanceFixedAccountMember {
  id: string
  name: string
  amount: number
}

export interface FinanceFixedAccountConfig {
  id: string
  name: string
  kind: FinanceConfigKind
  categoryId: string
  defaultAmount: number
  notes: string
  members: FinanceFixedAccountMember[]
}

export interface FinanceConfigData {
  clientId: number
  categories: FinanceCategoryConfig[]
  fixedAccounts: FinanceFixedAccountConfig[]
  recurringEntries: FinanceRecurringEntryConfig[]
  updatedAt: string
}

export interface FinanceConfigResponse {
  status: 'success'
  data: FinanceConfigData
}

export interface FinanceRecurringEntryConfig {
  sourceClientId: number
  adjustmentAmount: number
  notes: string
}
