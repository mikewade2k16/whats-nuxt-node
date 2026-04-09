import QRCode from 'qrcode'

interface ServerQrCodeItem {
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

interface QrCodesRepositoryState {
  nextId: number
  items: ServerQrCodeItem[]
}

interface ListQrCodesOptions {
  page: number
  limit: number
  q?: string
  status?: string
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

interface CreateQrCodeInput {
  slug: string
  targetUrl: string
  isActive?: boolean
  fillColor?: string
  backColor?: string
  size?: number
  clientId?: number
  clientName?: string
}

interface UpdateQrCodeInput {
  slug?: string
  targetUrl?: string
  isActive?: boolean
  fillColor?: string
  backColor?: string
  size?: number
  clientId?: number
  clientName?: string
}

interface OwnershipOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

const globalKey = '__omni_qrcodes_repo__'

const CLIENT_NAMES: Record<number, string> = {
  106: 'crow',
  105: 'Perola',
  104: 'Dr Antonio Tavares',
  103: 'Zen as Fuck',
  102: 'Duby',
  101: 'sdfsodifho'
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function resolveClientName(clientId: number, explicitName?: unknown) {
  const normalizedName = normalizeText(explicitName, 120)
  if (normalizedName) {
    return normalizedName
  }

  if (clientId > 0 && CLIENT_NAMES[clientId]) {
    return CLIENT_NAMES[clientId]
  }

  if (clientId > 0) {
    return `Cliente #${clientId}`
  }

  return 'Sem cliente'
}

function normalizeTargetUrl(value: unknown) {
  const raw = normalizeText(value, 2000)
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) {
    return raw
  }

  return `https://${raw}`
}

function slugify(value: unknown) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
}

function normalizeColor(value: unknown, fallback: string) {
  const raw = String(value ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }

  return fallback
}

function normalizeSize(value: unknown, fallback = 220) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < 120) return 120
  if (parsed > 1000) return 1000
  return parsed
}

async function generateQrImagePath(targetUrl: string, fillColor: string, backColor: string, size: number) {
  return QRCode.toDataURL(targetUrl, {
    width: size,
    margin: 1,
    color: {
      dark: fillColor,
      light: backColor
    },
    errorCorrectionLevel: 'H'
  })
}

function getState(): QrCodesRepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: QrCodesRepositoryState }
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = {
      nextId: 98,
      items: []
    }
  }

  return globalRef[globalKey] as QrCodesRepositoryState
}

function ensureUniqueSlug(rawSlug: string, skipId?: number) {
  const state = getState()
  const baseSlug = rawSlug || `qr-${Date.now().toString().slice(-6)}`
  let candidate = baseSlug
  let suffix = 2

  while (state.items.some(item => item.slug === candidate && item.id !== skipId)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return candidate
}

function canAccessItem(item: ServerQrCodeItem, options?: OwnershipOptions) {
  const userType = String(options?.viewerUserType ?? 'admin').toLowerCase()
  if (userType !== 'client') {
    return true
  }

  const viewerClientId = normalizeClientId(options?.viewerClientId)
  if (viewerClientId <= 0) {
    return false
  }

  return item.clientId === viewerClientId
}

function toDto(item: ServerQrCodeItem) {
  return {
    id: item.id,
    slug: item.slug,
    targetUrl: item.targetUrl,
    qrImagePath: item.qrImagePath,
    isActive: item.isActive,
    scanCount: item.scanCount,
    lastScannedAt: item.lastScannedAt,
    clientId: item.clientId,
    clientName: item.clientName,
    fillColor: item.fillColor,
    backColor: item.backColor,
    size: item.size,
    createdAt: item.createdAt
  }
}

async function seedIfNeeded() {
  const state = getState()
  if (state.items.length > 0) return

  const seededBase: Array<Omit<ServerQrCodeItem, 'qrImagePath'>> = [
    {
      id: 97,
      slug: 'jacassasadasda',
      targetUrl: 'https://perolajoias.com/',
      isActive: true,
      scanCount: 31,
      lastScannedAt: '2026-02-14T10:11:00.000Z',
      clientId: 105,
      clientName: 'Perola',
      fillColor: '#ff0000',
      backColor: '#ffffff',
      size: 220,
      createdAt: '2026-02-10T09:32:00.000Z'
    },
    {
      id: 96,
      slug: 'teste',
      targetUrl: 'https://perolajoias.com/',
      isActive: true,
      scanCount: 14,
      lastScannedAt: '2026-02-11T08:22:00.000Z',
      clientId: 105,
      clientName: 'Perola',
      fillColor: '#00ff3a',
      backColor: '#ffffff',
      size: 220,
      createdAt: '2026-02-08T16:15:00.000Z'
    }
  ]

  const seededItems: ServerQrCodeItem[] = []
  for (const item of seededBase) {
    const qrImagePath = await generateQrImagePath(item.targetUrl, item.fillColor, item.backColor, item.size)
    seededItems.push({
      ...item,
      qrImagePath
    })
  }

  state.items = seededItems.sort((a, b) => b.id - a.id)
  state.nextId = Math.max(...seededItems.map(item => item.id)) + 1
}

export async function listQrCodes(options: ListQrCodesOptions) {
  await seedIfNeeded()

  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 200) : 60
  const q = normalizeSearch(options.q)
  const status = normalizeSearch(options.status)

  const filtered = state.items.filter((item) => {
    if (!canAccessItem(item, options)) return false
    if (status === 'active' && !item.isActive) return false
    if (status === 'inactive' && item.isActive) return false

    if (!q) return true
    const haystack = normalizeSearch([item.slug, item.targetUrl, item.clientName].join(' '))
    return haystack.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.id !== b.id) return b.id - a.id
    return a.createdAt < b.createdAt ? 1 : -1
  })

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const items = sorted.slice(start, start + limit).map(toDto)

  return {
    items,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasMore: safePage < totalPages
    }
  }
}

export async function createQrCode(input: CreateQrCodeInput) {
  await seedIfNeeded()

  const state = getState()
  const targetUrl = normalizeTargetUrl(input.targetUrl)
  if (!targetUrl) {
    throw new Error('URL de destino invalida.')
  }

  const safeSlug = ensureUniqueSlug(slugify(input.slug || '') || `qr-${state.nextId}`)
  const fillColor = normalizeColor(input.fillColor, '#000000')
  const backColor = normalizeColor(input.backColor, '#ffffff')
  const size = normalizeSize(input.size, 220)
  const isActive = Boolean(input.isActive ?? true)
  const qrImagePath = await generateQrImagePath(targetUrl, fillColor, backColor, size)
  const clientId = normalizeClientId(input.clientId)
  const clientName = resolveClientName(clientId, input.clientName)

  const nextItem: ServerQrCodeItem = {
    id: state.nextId,
    slug: safeSlug,
    targetUrl,
    qrImagePath,
    isActive,
    scanCount: 0,
    lastScannedAt: '',
    clientId,
    clientName,
    fillColor,
    backColor,
    size,
    createdAt: nowIso()
  }

  state.nextId += 1
  state.items.unshift(nextItem)
  return toDto(nextItem)
}

export async function updateQrCodeById(id: number, patch: UpdateQrCodeInput, options?: OwnershipOptions) {
  await seedIfNeeded()

  const state = getState()
  const target = state.items.find(item => item.id === id)
  if (!target) return null
  if (!canAccessItem(target, options)) return null

  let mustRegenerate = false

  if (Object.prototype.hasOwnProperty.call(patch, 'slug')) {
    const nextSlug = ensureUniqueSlug(slugify(patch.slug || '') || target.slug, id)
    target.slug = nextSlug
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'targetUrl')) {
    const normalizedTargetUrl = normalizeTargetUrl(patch.targetUrl)
    if (!normalizedTargetUrl) {
      throw new Error('URL de destino invalida.')
    }

    if (normalizedTargetUrl !== target.targetUrl) {
      target.targetUrl = normalizedTargetUrl
      mustRegenerate = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'fillColor')) {
    const nextFill = normalizeColor(patch.fillColor, target.fillColor)
    if (nextFill !== target.fillColor) {
      target.fillColor = nextFill
      mustRegenerate = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'backColor')) {
    const nextBack = normalizeColor(patch.backColor, target.backColor)
    if (nextBack !== target.backColor) {
      target.backColor = nextBack
      mustRegenerate = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'size')) {
    const nextSize = normalizeSize(patch.size, target.size)
    if (nextSize !== target.size) {
      target.size = nextSize
      mustRegenerate = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'isActive')) {
    target.isActive = Boolean(patch.isActive)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'clientId')) {
    const nextClientId = normalizeClientId(patch.clientId)
    if (nextClientId > 0) {
      target.clientId = nextClientId
      target.clientName = resolveClientName(nextClientId, patch.clientName)
    }
  } else if (Object.prototype.hasOwnProperty.call(patch, 'clientName')) {
    target.clientName = resolveClientName(target.clientId, patch.clientName)
  }

  if (mustRegenerate) {
    target.qrImagePath = await generateQrImagePath(target.targetUrl, target.fillColor, target.backColor, target.size)
  }

  return toDto(target)
}

export async function deleteQrCodeById(id: number, options?: OwnershipOptions) {
  await seedIfNeeded()

  const state = getState()
  const index = state.items.findIndex(item => item.id === id)
  if (index < 0) return false

  const target = state.items[index]
  if (!target) return false
  if (!canAccessItem(target, options)) return false

  state.items.splice(index, 1)
  return true
}
