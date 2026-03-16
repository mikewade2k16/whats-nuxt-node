export type ServerCandidateStatusCode =
  | 'nao_iniciado'
  | 'solicitacao_de_video'
  | 'entrevista_online'
  | 'entrevista_presencial'
  | 'aprovado'
  | 'reprovado'
  | 'stand_by'
  | 'em_reparo'

export interface ServerCandidate {
  id: number
  clientId: number
  nome: string
  email: string
  telefone: string
  vaga: string
  dataNascimento: string
  experiencia: string
  pontos: number
  status: ServerCandidateStatusCode
  loja: string
  comment: string
  videoUrl: string
  curriculoUrl: string
  lastUpdateBy: string
  createdAt: string
  updatedAt: string
}

export interface CandidatesListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface CandidateListOptions {
  page: number
  limit: number
  q?: string
  status?: string
  vaga?: string
  loja?: string
  clientId?: string | number
  hasVideo?: string
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

export interface CandidateCreateInput {
  nome?: string
  clientId?: string | number
  vaga?: string
}

export interface CandidateAccessOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

const STATUS_LABELS: Record<ServerCandidateStatusCode, string> = {
  nao_iniciado: 'Nao Iniciado',
  solicitacao_de_video: 'Solicitacao de video',
  entrevista_online: 'Entrevista online',
  entrevista_presencial: 'Entrevista presencial',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  stand_by: 'Stand-by',
  em_reparo: 'Em reparo'
}

const globalKey = '__omni_candidates_repo__'

interface RepositoryState {
  candidates: ServerCandidate[]
  nextId: number
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeEmail(value: unknown) {
  return normalizeText(value, 255).toLowerCase()
}

function normalizeStatus(value: unknown): ServerCandidateStatusCode {
  const normalized = String(value ?? '').trim().toLowerCase() as ServerCandidateStatusCode
  if (normalized in STATUS_LABELS) {
    return normalized
  }

  return 'nao_iniciado'
}

function normalizePoints(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function normalizeViewerClientId(value: unknown) {
  return normalizeClientId(value)
}

function canAccessCandidate(candidate: ServerCandidate, options?: CandidateAccessOptions) {
  const viewerUserType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  if (viewerUserType !== 'client') {
    return true
  }

  const viewerClientId = normalizeViewerClientId(options?.viewerClientId)
  if (viewerClientId <= 0) {
    return false
  }

  return candidate.clientId === viewerClientId
}

function parseDateParts(value: string) {
  const input = String(value || '').trim()
  if (!input) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const [yearRaw, monthRaw, dayRaw] = input.slice(0, 10).split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return { year, month, day }
  }

  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    const day = Number(br[1])
    const month = Number(br[2])
    const year = Number(br[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return { year, month, day }
  }

  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

function calcAge(value: string) {
  const parts = parseDateParts(value)
  if (!parts) return null

  const now = new Date()
  let age = now.getUTCFullYear() - parts.year
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()

  if (month < parts.month || (month === parts.month && day < parts.day)) {
    age -= 1
  }

  if (!Number.isFinite(age) || age < 0) return null
  return age
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return `${day}/${month}/${year}`
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function optionSort(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function toDto(candidate: ServerCandidate) {
  const idade = calcAge(candidate.dataNascimento)
  const hasVideo = Boolean(candidate.videoUrl.trim())

  return {
    id: candidate.id,
    clientId: candidate.clientId,
    nome: candidate.nome,
    email: candidate.email,
    telefone: candidate.telefone,
    vaga: candidate.vaga,
    idade,
    experiencia: candidate.experiencia,
    pontos: candidate.pontos,
    status: candidate.status,
    statusLabel: STATUS_LABELS[candidate.status],
    loja: candidate.loja,
    comment: candidate.comment,
    formattedDate: formatDate(candidate.createdAt),
    lastActions: candidate.lastUpdateBy ? `Ultima edicao: ${candidate.lastUpdateBy}` : '-',
    hasVideo,
    videoUrl: candidate.videoUrl,
    curriculoUrl: candidate.curriculoUrl,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

function seedCandidates(): ServerCandidate[] {
  return [
    {
      id: 901,
      clientId: 105,
      nome: 'Ana Melo',
      email: 'ana.melo@teste.com',
      telefone: '(11) 98888-1111',
      vaga: 'consultor',
      dataNascimento: '1996-07-11',
      experiencia: 'Vendas e atendimento premium',
      pontos: 18,
      status: 'solicitacao_de_video',
      loja: 'Perola Garcia',
      comment: 'Perfil com boa comunicacao e postura.',
      videoUrl: 'https://cdn.fake/video/ana-melo.mp4',
      curriculoUrl: 'https://cdn.fake/cv/ana-melo.pdf',
      lastUpdateBy: 'Mike',
      createdAt: '2026-02-14T12:10:00.000Z',
      updatedAt: '2026-02-14T14:30:00.000Z'
    },
    {
      id: 902,
      clientId: 105,
      nome: 'Bruno Costa',
      email: 'bruno.costa@teste.com',
      telefone: '(11) 97777-2222',
      vaga: 'consultor',
      dataNascimento: '1999-10-01',
      experiencia: 'Operacao de loja e caixa',
      pontos: 14,
      status: 'entrevista_online',
      loja: 'Perola Riomar',
      comment: 'Boa energia, precisa reforcar tecnica.',
      videoUrl: '',
      curriculoUrl: 'https://cdn.fake/cv/bruno-costa.pdf',
      lastUpdateBy: 'Jessica',
      createdAt: '2026-02-13T09:22:00.000Z',
      updatedAt: '2026-02-14T11:04:00.000Z'
    },
    {
      id: 903,
      clientId: 104,
      nome: 'Carla Dias',
      email: 'carla.dias@teste.com',
      telefone: '(85) 96666-3333',
      vaga: 'financeiro',
      dataNascimento: '1992-03-19',
      experiencia: 'Rotinas de contas a pagar',
      pontos: 21,
      status: 'aprovado',
      loja: 'Clinica Centro',
      comment: 'Aprovada para proposta.',
      videoUrl: 'https://cdn.fake/video/carla-dias.mp4',
      curriculoUrl: '',
      lastUpdateBy: 'Antonio',
      createdAt: '2026-02-10T16:00:00.000Z',
      updatedAt: '2026-02-14T18:00:00.000Z'
    },
    {
      id: 904,
      clientId: 103,
      nome: 'Diego Rocha',
      email: 'diego.rocha@teste.com',
      telefone: '(21) 95555-4444',
      vaga: 'marketing',
      dataNascimento: '2000-01-27',
      experiencia: 'Conteudo para social media',
      pontos: 10,
      status: 'nao_iniciado',
      loja: 'Online',
      comment: '',
      videoUrl: '',
      curriculoUrl: 'https://cdn.fake/cv/diego-rocha.docx',
      lastUpdateBy: '',
      createdAt: '2026-02-15T02:00:00.000Z',
      updatedAt: '2026-02-15T02:00:00.000Z'
    }
  ]
}

function getState(): RepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: RepositoryState }
  if (!globalRef[globalKey]) {
    const seeded = seedCandidates().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    globalRef[globalKey] = {
      candidates: seeded,
      nextId: Math.max(...seeded.map(item => item.id)) + 1
    }
  }

  return globalRef[globalKey] as RepositoryState
}

export function listCandidates(options: CandidateListOptions) {
  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 200) : 50
  const q = normalizeSearch(options.q)
  const status = normalizeSearch(options.status)
  const vaga = normalizeSearch(options.vaga)
  const loja = normalizeSearch(options.loja)
  const clientId = normalizeClientId(options.clientId)
  const hasVideo = String(options.hasVideo ?? '').trim()

  const filtered = state.candidates.filter((candidate) => {
    if (!canAccessCandidate(candidate, options)) return false

    if (status && normalizeSearch(candidate.status) !== status) return false
    if (vaga && normalizeSearch(candidate.vaga) !== vaga) return false
    if (loja && normalizeSearch(candidate.loja) !== loja) return false
    if (clientId > 0 && candidate.clientId !== clientId) return false

    const candidateHasVideo = Boolean(candidate.videoUrl.trim())
    if (hasVideo === '1' && !candidateHasVideo) return false
    if (hasVideo === '0' && candidateHasVideo) return false

    if (!q) return true

    const haystack = normalizeSearch([
      candidate.nome,
      candidate.email,
      candidate.telefone,
      candidate.vaga,
      candidate.experiencia,
      candidate.loja,
      candidate.comment,
      STATUS_LABELS[candidate.status]
    ].join(' '))

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
  const items = sorted.slice(start, start + limit).map(toDto)

  const baseForOptions = state.candidates.filter(candidate => canAccessCandidate(candidate, options))
  const vagas = Array.from(new Set(baseForOptions.map(item => normalizeText(item.vaga, 120)).filter(Boolean))).sort(optionSort)
  const lojas = Array.from(new Set(baseForOptions.map(item => normalizeText(item.loja, 120)).filter(Boolean))).sort(optionSort)
  const clientIds = Array.from(new Set(baseForOptions.map(item => item.clientId))).sort((a, b) => a - b)

  return {
    items,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasMore: safePage < totalPages
    } satisfies CandidatesListMeta,
    filters: {
      vagas,
      lojas,
      clientIds
    }
  }
}

export function createCandidate(input: CandidateCreateInput = {}, options?: CandidateAccessOptions) {
  const state = getState()
  const id = state.nextId++
  const createdAt = nowIso()

  const viewerUserType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  const viewerClientId = normalizeViewerClientId(options?.viewerClientId)
  const requestedClientId = normalizeClientId(input.clientId)
  const resolvedClientId = viewerUserType === 'client'
    ? (viewerClientId > 0 ? viewerClientId : 105)
    : (requestedClientId > 0 ? requestedClientId : (viewerClientId > 0 ? viewerClientId : 105))

  const created: ServerCandidate = {
    id,
    clientId: resolvedClientId,
    nome: normalizeText(input.nome, 255) || `Novo candidato ${id}`,
    email: normalizeEmail(`candidato.${id}@mail.com`),
    telefone: '',
    vaga: normalizeText(input.vaga, 120) || 'consultor',
    dataNascimento: '',
    experiencia: '',
    pontos: 0,
    status: 'nao_iniciado',
    loja: '',
    comment: '',
    videoUrl: '',
    curriculoUrl: '',
    lastUpdateBy: 'Sistema',
    createdAt,
    updatedAt: createdAt
  }

  state.candidates.unshift(created)
  return toDto(created)
}

export function updateCandidateField(id: number, field: string, value: unknown, options?: CandidateAccessOptions) {
  const state = getState()
  const target = state.candidates.find(candidate => candidate.id === id)
  if (!target) return null
  if (!canAccessCandidate(target, options)) return null

  if (field === 'nome') {
    target.nome = normalizeText(value, 255)
  }

  if (field === 'vaga') {
    target.vaga = normalizeText(value, 120)
  }

  if (field === 'pontos') {
    target.pontos = normalizePoints(value)
  }

  if (field === 'status') {
    target.status = normalizeStatus(value)
  }

  if (field === 'loja') {
    target.loja = normalizeText(value, 120)
  }

  if (field === 'comment') {
    target.comment = normalizeText(value, 4000)
  }

  target.updatedAt = nowIso()
  target.lastUpdateBy = 'Admin'

  return toDto(target)
}

export function deleteCandidateById(id: number, options?: CandidateAccessOptions) {
  const state = getState()
  const index = state.candidates.findIndex(candidate => candidate.id === id)
  if (index < 0) return false

  const target = state.candidates[index]
  if (!target) return false
  if (!canAccessCandidate(target, options)) return false

  state.candidates.splice(index, 1)
  return true
}

export function listCandidateStatusOptions() {
  return Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value: value as ServerCandidateStatusCode,
    label
  }))
}
