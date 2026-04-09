interface ServerShortLinkItem {
  id: number
  slug: string
  targetUrl: string
  hits: number
  createdAt: string
  clientId: number
  clientName: string
}

interface ShortLinksRepositoryState {
  nextId: number
  items: ServerShortLinkItem[]
}

interface ListShortLinksOptions {
  page: number
  limit: number
  q?: string
  baseUrl?: string
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

interface CreateShortLinkInput {
  targetUrl: string
  slug?: string
  clientId?: number
  clientName?: string
  baseUrl?: string
}

interface OwnershipOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

const globalKey = '__omni_short_links_repo__'

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

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeBaseUrl(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    return parsed.origin
  } catch {
    return ''
  }
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
  const normalized = normalizeSearch(value)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)

  return normalized
}

function buildShortUrl(baseUrl: string, slug: string) {
  const origin = normalizeBaseUrl(baseUrl) || 'http://localhost:3000'
  return `${origin}/s/${slug}`
}

function getState(): ShortLinksRepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: ShortLinksRepositoryState }
  if (!globalRef[globalKey]) {
    const seeded: ServerShortLinkItem[] = [
      {
        id: 1,
        slug: 'uno-site-ia',
        targetUrl: 'https://gaotcsdj.manus.space/',
        hits: 1,
        createdAt: '2025-07-02T12:56:45.000Z',
        clientId: 105,
        clientName: 'Perola'
      },
      {
        id: 2,
        slug: 'uno-ia',
        targetUrl: 'https://gaotcsdj.manus.space/',
        hits: 1,
        createdAt: '2025-07-02T12:07:03.000Z',
        clientId: 105,
        clientName: 'Perola'
      },
      {
        id: 3,
        slug: 'jaca',
        targetUrl: 'https://search.google.com/local/writereview?placeid=ChIJmZ9ZT9yzGgcRtBUOkbv9LVE',
        hits: 0,
        createdAt: '2025-07-02T10:52:33.000Z',
        clientId: 104,
        clientName: 'Dr Antonio Tavares'
      },
      {
        id: 4,
        slug: 'perola-link',
        targetUrl: 'https://thecrow.com.br/perolajoias',
        hits: 1,
        createdAt: '2025-07-01T13:24:42.000Z',
        clientId: 105,
        clientName: 'Perola'
      }
    ]

    globalRef[globalKey] = {
      nextId: Math.max(...seeded.map(item => item.id)) + 1,
      items: seeded
    }
  }

  return globalRef[globalKey] as ShortLinksRepositoryState
}

function ensureUniqueSlug(rawSlug: string, skipId?: number) {
  const state = getState()
  const baseSlug = rawSlug || `link-${Date.now().toString().slice(-6)}`
  let candidate = baseSlug
  let suffix = 2

  while (state.items.some(item => item.slug === candidate && item.id !== skipId)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return candidate
}

function canAccessItem(item: ServerShortLinkItem, options?: OwnershipOptions) {
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

function toDto(item: ServerShortLinkItem, baseUrl: string) {
  return {
    id: item.id,
    slug: item.slug,
    targetUrl: item.targetUrl,
    shortUrl: buildShortUrl(baseUrl, item.slug),
    hits: item.hits,
    createdAt: item.createdAt,
    clientId: item.clientId,
    clientName: item.clientName
  }
}

export function listShortLinks(options: ListShortLinksOptions) {
  const state = getState()

  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 200) : 60
  const q = normalizeSearch(options.q)
  const baseUrl = normalizeBaseUrl(options.baseUrl)

  const filtered = state.items.filter((item) => {
    if (!canAccessItem(item, options)) return false

    if (!q) return true
    const haystack = normalizeSearch([item.slug, item.targetUrl, item.clientName].join(' '))
    return haystack.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.createdAt === b.createdAt) return b.id - a.id
    return a.createdAt < b.createdAt ? 1 : -1
  })

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const items = sorted.slice(start, start + limit).map(item => toDto(item, baseUrl))

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

export function createShortLink(input: CreateShortLinkInput) {
  const state = getState()
  const targetUrl = normalizeTargetUrl(input.targetUrl)
  if (!targetUrl) {
    throw new Error('URL de destino invalida.')
  }

  const slugBase = slugify(input.slug || '')
  const safeSlug = ensureUniqueSlug(slugBase || `link-${state.nextId}`)
  const clientId = normalizeClientId(input.clientId)
  const clientName = resolveClientName(clientId, input.clientName)

  const nextItem: ServerShortLinkItem = {
    id: state.nextId,
    slug: safeSlug,
    targetUrl,
    hits: 0,
    createdAt: nowIso(),
    clientId,
    clientName
  }

  state.nextId += 1
  state.items.unshift(nextItem)

  return toDto(nextItem, normalizeBaseUrl(input.baseUrl))
}

export function deleteShortLinkById(id: number, options?: OwnershipOptions) {
  const state = getState()
  const index = state.items.findIndex(item => item.id === id)
  if (index < 0) return false

  const target = state.items[index]
  if (!target) return false
  if (!canAccessItem(target, options)) {
    return false
  }

  state.items.splice(index, 1)
  return true
}

export function resolveShortLinkBySlug(rawSlug: string, baseUrl?: string) {
  const state = getState()
  const slug = slugify(rawSlug)
  if (!slug) return null

  const item = state.items.find(entry => entry.slug === slug)
  if (!item) return null

  item.hits += 1
  return toDto(item, normalizeBaseUrl(baseUrl))
}
