export type ServerQaStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done'
export type ServerQaPriority = 'alta' | 'media' | 'baixa'
export type ServerQaSource = 'novo' | 'legado_refatorar' | 'ja_existe'
export type ServerQaEffort = 'S' | 'M' | 'L' | 'XL'

export interface ServerQaItem {
  id: number
  block: string
  sprint: string
  squad: string
  feature: string
  status: ServerQaStatus
  priority: ServerQaPriority
  source: ServerQaSource
  owner: string
  targetPage: string
  effort: ServerQaEffort
  notes: string
  updatedAt: string
}

export interface ServerQaCapabilityBlock {
  title: string
  objective: string
  items: string[]
}

interface QaRepositoryState {
  nextId: number
  items: ServerQaItem[]
}

export interface QaListOptions {
  page: number
  limit: number
  q?: string
  block?: string
  sprint?: string
  squad?: string
  status?: string
  priority?: string
  source?: string
}

export interface QaCreateInput {
  block?: unknown
  sprint?: unknown
  squad?: unknown
  feature?: unknown
  status?: unknown
  priority?: unknown
  source?: unknown
  owner?: unknown
  targetPage?: unknown
  effort?: unknown
  notes?: unknown
}

const globalKey = '__omni_qa_repo__'

const QA_CAPABILITY_BLOCKS: ServerQaCapabilityBlock[] = [
  {
    title: 'Acesso e Fluxo de Paginas',
    objective: 'Fechar o fluxo de autorizacao do painel com UX clara e sem regressao de permissao.',
    items: [
      'Terminar fluxo de acesso e bloqueio visual por pagina',
      'Garantir gates por root admin, client admin e usuario comum',
      'Revisar menu, redirects e mensagens de acesso negado',
      'Consolidar matriz de acesso como fonte unica',
      'Aplicar loading global e loading contextual para evitar flicker e UI parcial'
    ]
  },
  {
    title: 'Seguranca',
    objective: 'Blindar autenticacao, autorizacao e isolamento entre clientes.',
    items: [
      'Rate limit em login e rotas sensiveis',
      'Auditoria de acesso e mudancas criticas',
      'Fail-closed no BFF e no core',
      'Revisao de bypass por frontend e headers simulados',
      'Ajustar Redis para noeviction ou separar instancias de cache, fila e rate limit',
      'Adicionar replay protection e idempotency de webhook'
    ]
  },
  {
    title: 'Atendimento Multi-tenant',
    objective: 'Definir limites e isolamento do modulo de atendimento por cliente.',
    items: [
      'Usar apenas o auth central do core; o modulo de atendimento nao tera auth proprio',
      'Padrao inicial de 1 numero WhatsApp por cliente',
      'Padrao inicial de 3 usuarios com acesso ao modulo',
      'Separacao total por tenant sem mistura de sessoes e dados',
      'Controle de limites por modulo no core'
    ]
  },
  {
    title: 'Finance Modulo',
    objective: 'Criar o backend do financeiro desacoplado e plugavel, seguindo o mesmo padrao do atendimento.',
    items: [
      'Backend MVP do financeiro para suportar o front atual',
      'Persistencia e servicos desacoplados do painel',
      'RBAC e limites por cliente/modulo',
      'Preparar integracao com billing e cobranca'
    ]
  },
  {
    title: 'Gestao de Modulos',
    objective: 'Centralizar a administracao dos modulos plugaveis da plataforma.',
    items: [
      'Criar pagina de modulos da aplicacao',
      'Gerenciar status, limite padrao e precificacao base',
      'Permitir override por cliente',
      'Usar isso como base para liberar paginas e features',
      'Controlar quantidade de usuarios por modulo para cada cliente'
    ]
  },
  {
    title: 'Tasks MVP',
    objective: 'Entregar o primeiro recorte do modulo tasks como Notion-like com foco inicial em Kanban.',
    items: [
      'MVP com Kanban como primeira entrega',
      'Base desacoplada para evoluir para doc, database e views',
      'Relacionar tarefas com tracking e produtividade',
      'Preparar estrutura para virar modulo independente'
    ]
  },
  {
    title: 'CRM Simples',
    objective: 'Conectar atendimento e cadastro de leads/clientes em um CRM inicial.',
    items: [
      'Cadastrar lead/cliente a partir do atendimento',
      'Integrar conversas e historico do omnichannel',
      'Permitir disparo e acompanhamento dentro do CRM',
      'Evoluir depois para funil e automacoes'
    ]
  },
  {
    title: 'Lista da Vez',
    objective: 'Preparar a plataforma para receber o sistema de lista da vez como modulo futuro.',
    items: [
      'Documentar dependencia e regra de negocio inicial',
      'Reservar espaco no roadmap e QA',
      'Definir pontos de acoplamento com core, auth e clientes',
      'Detalhar quando a especificacao chegar'
    ]
  },
  {
    title: 'Autenticacao e Conta',
    objective: 'Controle de entrada seguro e onboarding de usuarios.',
    items: [
      'Login com MFA opcional por cliente',
      'Convite por email para criacao de conta',
      'Recuperacao de senha com token e expiracao',
      'Controle de sessoes/dispositivos'
    ]
  },
  {
    title: 'Permissao e Multi-tenant',
    objective: 'Garantir isolamento entre clientes e politicas por papel.',
    items: [
      'RBAC granular por rota e acao',
      'Ownership por client_id em todos os CRUDs',
      'Admin escolhe cliente alvo; client nao escolhe',
      'Auditoria completa de alteracoes'
    ]
  },
  {
    title: 'Operacao Marketing',
    objective: 'Cobrir ciclo completo de captacao, producao e entrega.',
    items: [
      'Leads + Candidatos + funil de status',
      'Produtos/site com campanhas e categorias',
      'Kanban de tasks com tracking realtime',
      'Financeiro integrado com produtividade',
      'Conectar paginas de team, tools e site com banco e webhooks reais'
    ]
  },
  {
    title: 'Tools e Automacao',
    objective: 'Escalar operacao com utilitarios e gatilhos.',
    items: [
      'QR Code e link curto por tenant',
      'Webhook por cliente e rotacao de chave',
      'Automacoes por evento (v2)',
      'Notificacoes internas e externas'
    ]
  },
  {
    title: 'BI e Qualidade',
    objective: 'Decisao orientada por dados com seguranca e confiabilidade.',
    items: [
      'Dashboard executivo com KPIs',
      'Relatorios de tempo, SLA e ROI',
      'Rate limit, validacao e observabilidade',
      'Suite de testes E2E e regressao'
    ]
  }
]

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10)
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

function normalizeStatus(value: unknown): ServerQaStatus {
  const normalized = String(value ?? '').trim() as ServerQaStatus
  if (normalized === 'todo' || normalized === 'in_progress' || normalized === 'blocked' || normalized === 'review' || normalized === 'done') {
    return normalized
  }
  return 'todo'
}

function normalizePriority(value: unknown): ServerQaPriority {
  const normalized = String(value ?? '').trim() as ServerQaPriority
  if (normalized === 'alta' || normalized === 'media' || normalized === 'baixa') {
    return normalized
  }
  return 'media'
}

function normalizeSource(value: unknown): ServerQaSource {
  const normalized = String(value ?? '').trim() as ServerQaSource
  if (normalized === 'novo' || normalized === 'legado_refatorar' || normalized === 'ja_existe') {
    return normalized
  }
  return 'novo'
}

function normalizeEffort(value: unknown): ServerQaEffort {
  const normalized = String(value ?? '').trim().toUpperCase() as ServerQaEffort
  if (normalized === 'S' || normalized === 'M' || normalized === 'L' || normalized === 'XL') {
    return normalized
  }
  return 'M'
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set((values || []).map(value => normalizeText(value, 120)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function toDto(item: ServerQaItem) {
  return {
    id: item.id,
    block: item.block,
    sprint: item.sprint,
    squad: item.squad,
    feature: item.feature,
    status: item.status,
    priority: item.priority,
    source: item.source,
    owner: item.owner,
    targetPage: item.targetPage,
    effort: item.effort,
    notes: item.notes,
    updatedAt: item.updatedAt
  }
}

function seedItems() {
  const date = nowIsoDate()
  const base: ServerQaItem[] = [
    { id: 25, block: 'Acesso e Fluxo de Paginas', sprint: 'Fase 01', squad: 'Core', feature: 'Terminar fluxo de acesso e navegacao das paginas', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/*', effort: 'L', notes: 'Fechar gates, fallback visual de acesso negado e consistencia do menu.', updatedAt: date },
    { id: 26, block: 'Seguranca', sprint: 'Fase 01', squad: 'Backend', feature: 'Blindar autenticacao, autorizacao e isolamento por tenant', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/core/*', effort: 'L', notes: 'Incluir rate limit, fail-closed, auditoria e revisao de bypass.', updatedAt: date },
    { id: 27, block: 'Atendimento Multi-tenant', sprint: 'Fase 02', squad: 'Omnichannel', feature: 'Definir limites do modulo de atendimento por cliente', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Omnichannel', targetPage: '/admin/omnichannel/*', effort: 'L', notes: 'Base entregue nesta fase: auth central no core, padrao inicial de 1 numero por cliente e 3 usuarios com acesso ao modulo.', updatedAt: date },
    { id: 28, block: 'Finance Modulo', sprint: 'Fase 03', squad: 'Finance', feature: 'Criar backend MVP desacoplado do modulo financeiro', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/finance', effort: 'XL', notes: 'Aproveitar o front MVP existente e seguir padrao plugavel do atendimento.', updatedAt: date },
    { id: 29, block: 'Gestao de Modulos', sprint: 'Fase 03', squad: 'Core', feature: 'Criar pagina para gerenciar modulos da plataforma', status: 'todo', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/manage/modulos', effort: 'M', notes: 'Gerenciar ativacao, limites padrao, precificacao base e override por cliente.', updatedAt: date },
    { id: 30, block: 'Tasks MVP', sprint: 'Fase 04', squad: 'Product', feature: 'Entregar primeiro MVP do modulo tasks com Kanban', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin/tasks', effort: 'L', notes: 'Primeiro recorte do notion-like; iniciar com board Kanban apenas.', updatedAt: date },
    { id: 31, block: 'CRM Simples', sprint: 'Fase 05', squad: 'CRM', feature: 'Criar CRM simples acoplado ao atendimento', status: 'todo', priority: 'media', source: 'novo', owner: 'Backend', targetPage: '/admin/crm', effort: 'L', notes: 'Cadastrar leads/clientes a partir do atendimento e conectar historico de mensagens.', updatedAt: date },
    { id: 32, block: 'Lista da Vez', sprint: 'Backlog', squad: 'Core', feature: 'Preparar entrada futura do sistema Lista da Vez na plataforma', status: 'todo', priority: 'media', source: 'novo', owner: 'Product', targetPage: '/admin/manage/qa', effort: 'M', notes: 'Aguardando detalhamento funcional para modelar como modulo.', updatedAt: date },
    { id: 33, block: 'Acesso e Fluxo de Paginas', sprint: 'Fase 01', squad: 'Core', feature: 'Garantir que sessoes client-scoped vejam apenas dados e controles do proprio cliente', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/*', effort: 'L', notes: 'Ocultar filtros/selects globais de cliente e reforcar escopo tenant em todas as paginas e modulos.', updatedAt: date },
    { id: 34, block: 'Gestao de Modulos', sprint: 'Fase 03', squad: 'Core', feature: 'Criar pagina de modulos com precificacao, cobranca e limites por cliente', status: 'todo', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/manage/modulos', effort: 'L', notes: 'Gerenciar valor do modulo, metodo de cobranca, data de pagamento e override por cliente.', updatedAt: date },
    { id: 35, block: 'Usuarios e Permissoes', sprint: 'Sprint 02', squad: 'Core', feature: 'Permitir override de paginas/modulos por usuario na tela de users', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/manage/users', effort: 'L', notes: 'Primeiro passo entregue com allow/deny por area; falta expandir para overrides por cliente e limites por modulo.', updatedAt: date },
    { id: 41, block: 'Usuarios e Permissoes', sprint: 'Sprint 02', squad: 'Core', feature: 'Distinguir super root de platform staff limitado em toda a matriz de acesso', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/*', effort: 'L', notes: 'Somente root admin/admin tem full access; staff interno segue level real + overrides.', updatedAt: date },
    { id: 42, block: 'Acesso e Fluxo de Paginas', sprint: 'Sprint 02', squad: 'Frontend', feature: 'Aplicar loading global e loading contextual nas telas para evitar UI parcial e flicker', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin/*', effort: 'M', notes: 'Adicionar loading do app, overlays/skeletons em carregamentos pesados e feedback visual no chat/inbox e tabelas.', updatedAt: date },
    { id: 43, block: 'Seguranca', sprint: 'Sprint 03', squad: 'Infra', feature: 'Ajustar Redis para noeviction ou separar instancias por papel', status: 'done', priority: 'alta', source: 'novo', owner: 'Infra', targetPage: '/infra/redis', effort: 'M', notes: 'Fechado neste ciclo com politica padrao noeviction em dev/prod. Cache descartavel, se surgir, deve ir para instancia separada.', updatedAt: date },
    { id: 44, block: 'Seguranca', sprint: 'Sprint 03', squad: 'Backend', feature: 'Implementar replay protection e idempotency de webhook', status: 'done', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/api/webhooks/*', effort: 'L', notes: 'Fechado neste ciclo com deduplicacao em Redis, lock de processamento e replay respondendo 202 sem reprocessar side effects.', updatedAt: date },
    { id: 45, block: 'Atendimento Multi-tenant', sprint: 'Sprint 04', squad: 'Core', feature: 'Centralizar todo o auth do atendimento no plataforma-api', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/omnichannel/*', effort: 'L', notes: 'Fluxo principal ja centralizado no core; falta fechar remanescentes legados e expandir a validacao por instancia no multi-whats.', updatedAt: date },
    { id: 46, block: 'Seguranca', sprint: 'Sprint 03', squad: 'Backend', feature: 'Fechar pendencias finais do bloco de seguranca antes do multi-tenant de atendimento', status: 'done', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/core/*', effort: 'M', notes: 'Fechado neste ciclo com Redis em noeviction, replay protection do webhook e audit atualizado para 40/40.', updatedAt: date },
    { id: 36, block: 'Usuarios e Permissoes', sprint: 'Sprint 02', squad: 'Core', feature: 'Bloquear concessao acima do limite de usuarios por modulo do cliente', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Core', targetPage: '/admin/manage/users', effort: 'L', notes: 'Regra ja entrou no core para atendimento; falta validar no painel e replicar para os proximos modulos.', updatedAt: date },
    { id: 47, block: 'Atendimento Multi-tenant', sprint: 'Sprint 04', squad: 'Omnichannel', feature: 'Controlar quais usuarios do cliente podem acessar o modulo de atendimento', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Omnichannel', targetPage: '/admin/manage/users', effort: 'L', notes: 'Client admin e super root devem conseguir alocar/remover usuarios do modulo sem ultrapassar o limite do cliente.', updatedAt: date },
    { id: 48, block: 'Atendimento Multi-tenant', sprint: 'Sprint 05', squad: 'Omnichannel', feature: 'Suportar multi-whats com atribuicao de usuarios por instancia', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Omnichannel', targetPage: '/admin/omnichannel/*', effort: 'XL', notes: 'Entregue nesta fase: registry de instancias, backfill seguro de conversas legadas, limite de instancias vindo do core, client admin vendo todas as instancias do proprio cliente e usuarios comuns filtrados por vinculo explicito quando existem 2+ instancias ativas. Inbox agora tem filtro/selector de instancia, badge de instancia na conversa e politica operacional por instancia (fila, responsavel e MULTI_INSTANCE/SINGLE_INSTANCE). Falta validar conexao real do segundo numero e evoluir roteamento/fila.', updatedAt: date },
    { id: 37, block: 'Operacao Marketing', sprint: 'Sprint 03', squad: 'Frontend', feature: 'Conectar paginas de Team com banco e integraÃ§Ãµes reais', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin/team/*', effort: 'L', notes: 'Treinamento, candidatos e fluxos relacionados precisam sair do mock.', updatedAt: date },
    { id: 38, block: 'Tools e Automacao', sprint: 'Sprint 03', squad: 'Frontend', feature: 'Conectar paginas de Tools com persistencia e webhook reais', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin/tools/*', effort: 'L', notes: 'Scripts, QR Code e encurtador precisam operar com banco/eventos reais.', updatedAt: date },
    { id: 39, block: 'Site Produtos e Conteudo', sprint: 'Sprint 04', squad: 'Frontend', feature: 'Conectar paginas de Site com backend real e fechar pendencias operacionais', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin/site/*', effort: 'L', notes: 'Produtos, leads e fluxos do site precisam sair do modo teste.', updatedAt: date },
    { id: 40, block: 'Acesso e Fluxo de Paginas', sprint: 'Sprint 02', squad: 'Frontend', feature: 'Aplicar branding do painel no favicon, logo e title/head da aplicacao', status: 'todo', priority: 'media', source: 'novo', owner: 'Frontend', targetPage: '/admin', effort: 'S', notes: 'Padronizar nome do site, icone do painel e metadados do head.', updatedAt: date },
    { id: 1, block: 'Autenticacao e Acesso', sprint: 'Sprint 01', squad: 'Backend', feature: 'Login com MFA opcional', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/login', effort: 'M', notes: 'Ativar por tenant/papel.', updatedAt: date },
    { id: 2, block: 'Autenticacao e Acesso', sprint: 'Sprint 01', squad: 'Backend', feature: 'Criacao de conta por convite de admin', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/auth/invite', effort: 'M', notes: 'Enviar token por email e expirar em 24h.', updatedAt: date },
    { id: 3, block: 'Autenticacao e Acesso', sprint: 'Sprint 02', squad: 'Backend', feature: 'Recuperacao de senha com token seguro', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/auth/reset', effort: 'M', notes: 'Rate limit e captcha no endpoint.', updatedAt: date },
    { id: 4, block: 'Usuarios e Permissoes', sprint: 'Sprint 02', squad: 'Backend', feature: 'RBAC granular por recurso e acao', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/manage/users', effort: 'L', notes: 'Padrao deny by default.', updatedAt: date },
    { id: 5, block: 'Usuarios e Permissoes', sprint: 'Sprint 01', squad: 'Frontend', feature: 'Fluxo de aprovacao de usuario pendente', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/manage/users', effort: 'S', notes: 'Conectar email de onboarding.', updatedAt: date },
    { id: 6, block: 'Clientes e Multi-tenant', sprint: 'Sprint 02', squad: 'Backend', feature: 'Isolamento tenant em todas as APIs BFF', status: 'in_progress', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/api/admin/*', effort: 'L', notes: 'Fail-closed e ownership estrito.', updatedAt: date },
    { id: 7, block: 'Clientes e Multi-tenant', sprint: 'Sprint 01', squad: 'Frontend', feature: 'Selecao de cliente para admin em create/edit', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/tools/*', effort: 'S', notes: 'Conferir em todos modulos.', updatedAt: date },
    { id: 8, block: 'CRM Leads e Candidatos', sprint: 'Sprint 03', squad: 'Frontend', feature: 'Inbox de leads com filtro avancado', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/site/leads', effort: 'M', notes: 'Adicionar paginacao server side.', updatedAt: date },
    { id: 9, block: 'CRM Leads e Candidatos', sprint: 'Sprint 03', squad: 'Frontend', feature: 'Inbox de candidatos com modal de CV/video', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/manage/candidatos', effort: 'M', notes: 'Conectar endpoint real de arquivos.', updatedAt: date },
    { id: 10, block: 'CRM Leads e Candidatos', sprint: 'Sprint 04', squad: 'Produto', feature: 'Pipeline por status com SLA de follow-up', status: 'todo', priority: 'media', source: 'novo', owner: 'Product', targetPage: '/admin/manage/candidatos', effort: 'M', notes: 'Alertas de atraso por dono.', updatedAt: date },
    { id: 11, block: 'Site Produtos e Conteudo', sprint: 'Sprint 03', squad: 'Frontend', feature: 'Tabela de produtos por cliente', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/site/produtos', effort: 'M', notes: 'Revisar API real e pagina de detalhe.', updatedAt: date },
    { id: 12, block: 'Site Produtos e Conteudo', sprint: 'Sprint 04', squad: 'Backend', feature: 'Upload otimizado (compressao e resize)', status: 'todo', priority: 'media', source: 'novo', owner: 'Backend', targetPage: '/admin/site/produtos', effort: 'M', notes: 'Thumbnail + original.', updatedAt: date },
    { id: 13, block: 'Site Produtos e Conteudo', sprint: 'Sprint 04', squad: 'Backend', feature: 'Sincronizacao com feed de ecommerce', status: 'blocked', priority: 'media', source: 'novo', owner: 'Backend', targetPage: '/api/admin/products', effort: 'L', notes: 'Depende de especificacao externa.', updatedAt: date },
    { id: 14, block: 'Tasks e Tracking', sprint: 'Sprint 05', squad: 'Frontend', feature: 'Refatorar Kanban legado para Nuxt', status: 'todo', priority: 'alta', source: 'legado_refatorar', owner: 'Frontend', targetPage: '/admin/tasks', effort: 'L', notes: 'Aguardando legado para migracao.', updatedAt: date },
    { id: 15, block: 'Tasks e Tracking', sprint: 'Sprint 05', squad: 'Backend', feature: 'Tracking realtime de tarefa por usuario', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/tracking', effort: 'XL', notes: 'Start/stop + heartbeat websocket.', updatedAt: date },
    { id: 16, block: 'Tasks e Tracking', sprint: 'Sprint 05', squad: 'Backend', feature: 'Tempo total por tarefa (inicio/fim)', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/tracking', effort: 'M', notes: 'Registrar pausas e retomadas.', updatedAt: date },
    { id: 17, block: 'Financeiro', sprint: 'Sprint 06', squad: 'Frontend', feature: 'Migrar pagina financeira legado para Nuxt', status: 'todo', priority: 'alta', source: 'legado_refatorar', owner: 'Frontend', targetPage: '/admin/finance', effort: 'L', notes: 'Aguardando legado para refactor.', updatedAt: date },
    { id: 18, block: 'Financeiro', sprint: 'Sprint 06', squad: 'Backend', feature: 'Contas a pagar e receber por cliente', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/admin/finance', effort: 'L', notes: 'Fluxo principal financeiro.', updatedAt: date },
    { id: 19, block: 'Financeiro', sprint: 'Sprint 06', squad: 'Backend', feature: 'Fluxo de caixa projetado e realizado', status: 'todo', priority: 'media', source: 'novo', owner: 'Backend', targetPage: '/admin/finance', effort: 'M', notes: 'Grafico por periodo.', updatedAt: date },
    { id: 20, block: 'Tools e Automacao', sprint: 'Sprint 03', squad: 'Frontend', feature: 'QR Code por cliente com ownership', status: 'in_progress', priority: 'alta', source: 'ja_existe', owner: 'Frontend', targetPage: '/admin/tools/qr-code', effort: 'S', notes: 'Conferir upload/logos por tenant.', updatedAt: date },
    { id: 21, block: 'Tools e Automacao', sprint: 'Sprint 03', squad: 'Backend', feature: 'Encurtador por cliente com analytics', status: 'in_progress', priority: 'media', source: 'ja_existe', owner: 'Backend', targetPage: '/admin/tools/encurtador-link', effort: 'M', notes: 'Eventos por origem/campanha.', updatedAt: date },
    { id: 22, block: 'Relatorios e BI', sprint: 'Sprint 07', squad: 'Produto', feature: 'Dashboard executivo de operacao', status: 'todo', priority: 'media', source: 'novo', owner: 'Product', targetPage: '/admin', effort: 'M', notes: 'KPIs por cliente.', updatedAt: date },
    { id: 23, block: 'Relatorios e BI', sprint: 'Sprint 07', squad: 'Backend', feature: 'Relatorio de produtividade por usuario', status: 'todo', priority: 'media', source: 'novo', owner: 'Backend', targetPage: '/admin/tracking', effort: 'M', notes: 'Tempo liquido por tarefa.', updatedAt: date },
    { id: 24, block: 'Seguranca e Qualidade', sprint: 'Sprint 02', squad: 'Backend', feature: 'Rate limit em rotas sensiveis', status: 'todo', priority: 'alta', source: 'novo', owner: 'Backend', targetPage: '/api/admin/*', effort: 'M', notes: 'Login/reset/upload.', updatedAt: date }
  ]

  return base.sort((a, b) => b.id - a.id)
}

function getState(): QaRepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: QaRepositoryState }
  if (!globalRef[globalKey]) {
    const seeded = seedItems()
    globalRef[globalKey] = {
      nextId: Math.max(...seeded.map(item => item.id)) + 1,
      items: seeded
    }
  }

  return globalRef[globalKey] as QaRepositoryState
}

export function listQaItems(options: QaListOptions) {
  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 400) : 100

  const q = normalizeSearch(options.q)
  const block = normalizeSearch(options.block)
  const sprint = normalizeSearch(options.sprint)
  const squad = normalizeSearch(options.squad)
  const status = normalizeSearch(options.status)
  const priority = normalizeSearch(options.priority)
  const source = normalizeSearch(options.source)

  const filtered = state.items.filter((item) => {
    if (block && normalizeSearch(item.block) !== block) return false
    if (sprint && normalizeSearch(item.sprint) !== sprint) return false
    if (squad && normalizeSearch(item.squad) !== squad) return false
    if (status && normalizeSearch(item.status) !== status) return false
    if (priority && normalizeSearch(item.priority) !== priority) return false
    if (source && normalizeSearch(item.source) !== source) return false

    if (!q) return true
    const haystack = normalizeSearch([
      item.block,
      item.sprint,
      item.squad,
      item.feature,
      item.status,
      item.priority,
      item.source,
      item.owner,
      item.targetPage,
      item.effort,
      item.notes
    ].join(' '))
    return haystack.includes(q)
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const rows = filtered.slice(start, start + limit).map(toDto)

  return {
    items: rows,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasMore: safePage < totalPages
    },
    filters: {
      blocks: dedupeSorted(state.items.map(item => item.block)),
      sprints: dedupeSorted(state.items.map(item => item.sprint)),
      squads: dedupeSorted(state.items.map(item => item.squad))
    },
    capabilities: QA_CAPABILITY_BLOCKS.map(block => ({
      title: block.title,
      objective: block.objective,
      items: [...block.items]
    }))
  }
}

export function createQaItem(input: QaCreateInput = {}) {
  const state = getState()
  const id = state.nextId++
  const next: ServerQaItem = {
    id,
    block: normalizeText(input.block, 160) || 'Novo bloco',
    sprint: normalizeText(input.sprint, 80) || 'Backlog',
    squad: normalizeText(input.squad, 80) || 'Time',
    feature: normalizeText(input.feature, 280) || `Nova funcionalidade ${id}`,
    status: normalizeStatus(input.status),
    priority: normalizePriority(input.priority),
    source: normalizeSource(input.source),
    owner: normalizeText(input.owner, 120),
    targetPage: normalizeText(input.targetPage, 240) || '/admin',
    effort: normalizeEffort(input.effort),
    notes: normalizeText(input.notes, 4000),
    updatedAt: nowIsoDate()
  }

  state.items.unshift(next)
  return toDto(next)
}

export function updateQaItemField(id: number, field: string, value: unknown) {
  const state = getState()
  const target = state.items.find(item => item.id === id)
  if (!target) return null

  if (field === 'block') target.block = normalizeText(value, 160) || target.block
  if (field === 'sprint') target.sprint = normalizeText(value, 80) || target.sprint
  if (field === 'squad') target.squad = normalizeText(value, 80) || target.squad
  if (field === 'feature') target.feature = normalizeText(value, 280) || target.feature
  if (field === 'status') target.status = normalizeStatus(value)
  if (field === 'priority') target.priority = normalizePriority(value)
  if (field === 'source') target.source = normalizeSource(value)
  if (field === 'owner') target.owner = normalizeText(value, 120)
  if (field === 'targetPage') target.targetPage = normalizeText(value, 240)
  if (field === 'effort') target.effort = normalizeEffort(value)
  if (field === 'notes') target.notes = normalizeText(value, 4000)

  target.updatedAt = nowIsoDate()
  return toDto(target)
}

export function deleteQaItemById(id: number) {
  const state = getState()
  const index = state.items.findIndex(item => item.id === id)
  if (index < 0) return false
  state.items.splice(index, 1)
  return true
}
