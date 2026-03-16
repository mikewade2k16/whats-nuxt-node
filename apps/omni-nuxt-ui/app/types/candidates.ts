export type CandidateStatusCode =
  | 'nao_iniciado'
  | 'solicitacao_de_video'
  | 'entrevista_online'
  | 'entrevista_presencial'
  | 'aprovado'
  | 'reprovado'
  | 'stand_by'
  | 'em_reparo'

export interface CandidateStatusOption {
  label: string
  value: CandidateStatusCode
}

export const CANDIDATE_STATUS_OPTIONS: CandidateStatusOption[] = [
  { value: 'nao_iniciado', label: 'Nao Iniciado' },
  { value: 'solicitacao_de_video', label: 'Solicitacao de video' },
  { value: 'entrevista_online', label: 'Entrevista online' },
  { value: 'entrevista_presencial', label: 'Entrevista presencial' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'stand_by', label: 'Stand-by' },
  { value: 'em_reparo', label: 'Em reparo' }
]

export type CandidateFieldKey =
  | 'nome'
  | 'vaga'
  | 'pontos'
  | 'status'
  | 'loja'
  | 'comment'

export interface CandidateItem {
  id: number
  clientId: number
  nome: string
  email: string
  telefone: string
  vaga: string
  idade: number | null
  experiencia: string
  pontos: number
  status: CandidateStatusCode
  statusLabel: string
  loja: string
  comment: string
  formattedDate: string
  lastActions: string
  hasVideo: boolean
  videoUrl: string
  curriculoUrl: string
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

export interface CandidatesListFilters {
  vagas: string[]
  lojas: string[]
  clientIds: number[]
}

export interface CandidatesListResponse {
  status: 'success'
  data: CandidateItem[]
  meta: CandidatesListMeta
  filters: CandidatesListFilters
}

export interface CandidateMutationResponse {
  status: 'success'
  data: CandidateItem
}
