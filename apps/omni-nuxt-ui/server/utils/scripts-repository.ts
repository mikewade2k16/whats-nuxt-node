interface ServerScriptRowItem {
  id: string
  audio: string
  video: string
}

interface ServerScriptDocumentItem {
  id: number
  title: string
  status: string
  notes: string
  rows: ServerScriptRowItem[]
  clientId: number
  clientName: string
  createdAt: string
  updatedAt: string
}

interface ScriptsRepositoryState {
  nextId: number
  items: ServerScriptDocumentItem[]
}

interface ScriptsOwnershipOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

interface ListScriptsOptions extends ScriptsOwnershipOptions {
  page: number
  limit: number
  q?: string
  clientId?: number
}

interface CreateScriptInput {
  title?: string
  status?: string
  notes?: string
  rows?: unknown
  clientId?: number
  clientName?: string
}

interface UpdateScriptInput {
  title?: string
  status?: string
  notes?: string
  rows?: unknown
  clientId?: number
  clientName?: string
}

const globalKey = '__omni_scripts_repo__'

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

function normalizeText(value: unknown, max = 6000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function normalizeRows(value: unknown) {
  const raw = Array.isArray(value) ? value : []
  const rows = raw
    .map((item, index) => {
      const source = item && typeof item === 'object'
        ? item as { id?: unknown, audio?: unknown, video?: unknown }
        : {}

      const id = normalizeText(source.id, 80) || `row-${Date.now()}-${index + 1}`
      const audio = normalizeText(source.audio, 12000)
      const video = normalizeText(source.video, 12000)

      return {
        id,
        audio,
        video
      } satisfies ServerScriptRowItem
    })
    .filter(row => row.audio || row.video || row.id)

  if (rows.length > 0) return rows

  return [{
    id: `row-${Date.now()}-1`,
    audio: '',
    video: ''
  }]
}

function normalizeStatus(value: unknown) {
  const normalized = normalizeText(value, 80)
  if (!normalized) return 'em_criacao'
  return normalized
}

function toPreview(item: ServerScriptDocumentItem) {
  const rowText = item.rows
    .map(row => `${row.audio} ${row.video}`)
    .join(' ')
  const merged = normalizeText(`${item.notes} ${rowText}`, 200)
  if (!merged) return 'Sem conteudo'
  return merged
}

function canAccessItem(item: ServerScriptDocumentItem, options?: ScriptsOwnershipOptions) {
  const userType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  if (userType !== 'client') return true

  const viewerClientId = normalizeClientId(options?.viewerClientId)
  if (viewerClientId <= 0) return false

  return item.clientId === viewerClientId
}

function toDto(item: ServerScriptDocumentItem) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    notes: item.notes,
    rows: item.rows.map(row => ({ ...row })),
    preview: toPreview(item),
    clientId: item.clientId,
    clientName: item.clientName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

function seedItems() {
  const now = nowIso()
  return [
    {
      id: 1,
      title: 'Novo roteiro',
      status: 'em_criacao',
      notes: 'Introducao e contexto do video.',
      rows: [
        { id: 'row-1-1', audio: 'Abertura do video', video: 'Logo da marca em destaque' },
        { id: 'row-1-2', audio: 'Mensagem principal da campanha', video: 'Cenas de produto e bastidores' }
      ],
      clientId: 105,
      clientName: 'Perola',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 2,
      title: 'Script campanha local',
      status: 'em_revisao',
      notes: 'Versao para stories com CTA rapido.',
      rows: [
        { id: 'row-2-1', audio: 'Chamada para oferta da semana', video: 'Close dos produtos em destaque' }
      ],
      clientId: 104,
      clientName: 'Dr Antonio Tavares',
      createdAt: now,
      updatedAt: now
    }
  ] satisfies ServerScriptDocumentItem[]
}

function getState() {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: ScriptsRepositoryState }
  if (!globalRef[globalKey]) {
    const seeded = seedItems()
    globalRef[globalKey] = {
      nextId: Math.max(...seeded.map(item => item.id)) + 1,
      items: seeded
    }
  }

  return globalRef[globalKey] as ScriptsRepositoryState
}

export function listScripts(options: ListScriptsOptions) {
  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 300) : 120
  const q = normalizeSearch(options.q)
  const filterClientId = normalizeClientId(options.clientId)

  const filtered = state.items.filter((item) => {
    if (!canAccessItem(item, options)) return false
    if (filterClientId > 0 && item.clientId !== filterClientId) return false

    if (!q) return true
    const haystack = normalizeSearch([
      item.title,
      item.status,
      item.notes,
      item.clientName,
      item.rows.map(row => `${row.audio} ${row.video}`).join(' ')
    ].join(' '))

    return haystack.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return b.id - a.id
    return a.updatedAt < b.updatedAt ? 1 : -1
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

export function createScript(input: CreateScriptInput) {
  const state = getState()
  const id = state.nextId
  const clientId = normalizeClientId(input.clientId)
  const createdAt = nowIso()

  const next: ServerScriptDocumentItem = {
    id,
    title: normalizeText(input.title, 180) || `Novo roteiro ${id}`,
    status: normalizeStatus(input.status),
    notes: normalizeText(input.notes, 12000),
    rows: normalizeRows(input.rows),
    clientId,
    clientName: resolveClientName(clientId, input.clientName),
    createdAt,
    updatedAt: createdAt
  }

  state.nextId += 1
  state.items.unshift(next)
  return toDto(next)
}

export function updateScriptById(id: number, input: UpdateScriptInput, options?: ScriptsOwnershipOptions) {
  const state = getState()
  const target = state.items.find(item => item.id === id)
  if (!target) return null
  if (!canAccessItem(target, options)) return null

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    target.title = normalizeText(input.title, 180) || target.title
  }

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    target.status = normalizeStatus(input.status)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    target.notes = normalizeText(input.notes, 12000)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'rows')) {
    target.rows = normalizeRows(input.rows)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'clientId')) {
    const nextClientId = normalizeClientId(input.clientId)
    if (nextClientId > 0) {
      target.clientId = nextClientId
      target.clientName = resolveClientName(nextClientId, input.clientName)
    }
  }

  target.updatedAt = nowIso()
  return toDto(target)
}

export function deleteScriptById(id: number, options?: ScriptsOwnershipOptions) {
  const state = getState()
  const index = state.items.findIndex(item => item.id === id)
  if (index < 0) return false

  const target = state.items[index]
  if (!target) return false
  if (!canAccessItem(target, options)) return false

  state.items.splice(index, 1)
  return true
}
