export interface ScriptRowItem {
  id: string
  audio: string
  video: string
}

export interface ScriptDocumentItem {
  id: number
  title: string
  status: string
  notes: string
  rows: ScriptRowItem[]
  preview: string
  clientId: number
  clientName: string
  createdAt: string
  updatedAt: string
}

export interface ScriptsListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface ScriptsListResponse {
  status: 'success'
  data: ScriptDocumentItem[]
  meta: ScriptsListMeta
}

export interface ScriptMutationResponse {
  status: 'success'
  data: ScriptDocumentItem
}
