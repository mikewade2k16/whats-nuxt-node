export interface ShortLinkItem {
  id: number
  slug: string
  targetUrl: string
  shortUrl: string
  hits: number
  createdAt: string
  clientId: number
  clientName: string
}

export interface ShortLinksListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface ShortLinksListResponse {
  status: 'success'
  data: ShortLinkItem[]
  meta: ShortLinksListMeta
}

export interface ShortLinkMutationResponse {
  status: 'success'
  data: ShortLinkItem
}
