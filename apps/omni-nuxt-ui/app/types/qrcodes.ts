export interface QrCodeItem {
  id: number
  slug: string
  targetUrl: string
  qrImagePath: string
  isActive: boolean
  scanCount: number
  lastScannedAt: string
  clientId: number
  clientName: string
  fillColor: string
  backColor: string
  size: number
  createdAt: string
}

export interface QrCodesListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface QrCodesListResponse {
  status: 'success'
  data: QrCodeItem[]
  meta: QrCodesListMeta
}

export interface QrCodeMutationResponse {
  status: 'success'
  data: QrCodeItem
}
