export type AdminAccessReason =
  | 'login-required'
  | 'feature-denied'
  | 'module-atendimento'
  | 'module-fila-atendimento'
  | 'module-indicators'
  | 'module-finance'

export type AdminAccessLevel = 'admin' | 'consultant' | 'manager' | 'marketing' | 'finance' | 'viewer'
export type AdminAccessUserType = 'admin' | 'client'
export type AdminFeatureCode =
  | 'dashboard'
  | 'profile'
  | 'settings'
  | 'themes'
  | 'manage.audit'
  | 'manage.users'
  | 'manage.clients'
  | 'manage.qa'
  | 'manage.componentes'
  | 'manage.indicators'
  | 'monitoring'
  | 'omnichannel'
  | 'fila-atendimento'
  | 'indicators'
  | 'finance'
  | 'tasks'
  | 'tracking'
  | 'tools'
  | 'team'
  | 'site'

export interface AdminFeatureDefinition {
  code: AdminFeatureCode
  label: string
  description: string
  pathPrefixes: string[]
  defaultLevels: readonly AdminAccessLevel[]
  moduleCode?: string
}

export interface AdminFeatureOverrides {
  allowFeatures: AdminFeatureCode[]
  denyFeatures: AdminFeatureCode[]
}

export interface ParsedAdminPreferences {
  raw: Record<string, any>
  adminAccess: AdminFeatureOverrides
}

export interface AdminAccessContext {
  isAuthenticated: boolean
  isRootUser: boolean
  authRole?: unknown
  profileUserType?: unknown
  profileUserLevel?: unknown
  sessionUserType?: unknown
  sessionUserLevel?: unknown
  preferences?: unknown
  hasModule: (moduleCode: string) => boolean
}

export interface AdminAccessFlags {
  isSuperRoot: boolean
  isPlatformStaff: boolean
  isTenantAdmin: boolean
  activeUserType: AdminAccessUserType
  activeUserLevel: AdminAccessLevel
  canSimulate: boolean
  canCrossClientAccess: boolean
  canManageUsers: boolean
  canAccessThemes: boolean
}

export interface AdminAccessResult {
  allowed: boolean
  reason?: AdminAccessReason
  featureCode?: AdminFeatureCode
}

const PUBLIC_ADMIN_PATHS = new Set([
  '/admin/login',
  '/admin/recuperar-senha'
])

export function isPublicAdminPath(path: unknown) {
  const normalized = normalizePathname(path)
  return [...PUBLIC_ADMIN_PATHS].some(publicPath => pathMatchesPrefix(normalized, publicPath))
}

const ADMIN_FEATURES: AdminFeatureDefinition[] = [
  {
    code: 'manage.clients',
    label: 'Clientes',
    description: 'Gestao global de clientes do painel.',
    pathPrefixes: ['/admin/manage/clientes'],
    defaultLevels: []
  },
  {
    code: 'manage.componentes',
    label: 'Componentes',
    description: 'Playground e catalogo tecnico de componentes.',
    pathPrefixes: ['/admin/manage/componentes'],
    defaultLevels: []
  },
  {
    code: 'manage.indicators',
    label: 'Governanca de indicadores',
    description: 'Catalogo global, templates e rollout root do modulo de indicadores.',
    pathPrefixes: ['/admin/manage/indicadores'],
    defaultLevels: [],
    moduleCode: 'indicators'
  },
  {
    code: 'monitoring',
    label: 'Monitoramento',
    description: 'Monitoramento de containers e infraestrutura.',
    pathPrefixes: ['/admin/containers'],
    defaultLevels: []
  },
  {
    code: 'manage.qa',
    label: 'QA',
    description: 'Backlog e acompanhamento de QA.',
    pathPrefixes: ['/admin/manage/qa'],
    defaultLevels: []
  },
  {
    code: 'manage.audit',
    label: 'Auditoria',
    description: 'Auditoria operacional compartilhada do painel.',
    pathPrefixes: ['/admin/manage/auditoria'],
    defaultLevels: ['admin', 'manager']
  },
  {
    code: 'manage.users',
    label: 'Usuarios',
    description: 'Gestao de usuarios do painel.',
    pathPrefixes: ['/admin/manage/users'],
    defaultLevels: ['admin']
  },
  {
    code: 'themes',
    label: 'Temas',
    description: 'Personalizacao visual do painel.',
    pathPrefixes: ['/admin/themes'],
    defaultLevels: ['admin', 'consultant', 'manager', 'marketing', 'finance', 'viewer']
  },
  {
    code: 'omnichannel',
    label: 'Atendimento',
    description: 'Inbox e operacao do modulo de atendimento.',
    pathPrefixes: ['/admin/omnichannel'],
    defaultLevels: ['admin', 'consultant', 'manager'],
    moduleCode: 'atendimento'
  },
  {
    code: 'fila-atendimento',
    label: 'Fila de Atendimento',
    description: 'Host principal do modulo de fila, operacao e relatorios de loja.',
    pathPrefixes: ['/admin/fila-atendimento'],
    defaultLevels: ['admin', 'manager'],
    moduleCode: 'fila-atendimento'
  },
  {
    code: 'indicators',
    label: 'Indicadores',
    description: 'Modulo de indicadores operacionais e comerciais por unidade.',
    pathPrefixes: ['/admin/indicadores'],
    defaultLevels: ['admin'],
    moduleCode: 'indicators'
  },
  {
    code: 'finance',
    label: 'Financeiro',
    description: 'Area financeira do painel.',
    pathPrefixes: ['/admin/finance'],
    defaultLevels: ['admin', 'finance'],
    moduleCode: 'finance'
  },
  {
    code: 'tasks',
    label: 'Tasks',
    description: 'Workspace de tasks.',
    pathPrefixes: ['/admin/tasks'],
    defaultLevels: ['admin', 'manager', 'marketing', 'finance']
  },
  {
    code: 'tracking',
    label: 'Tracking',
    description: 'Area de tracking/analytics.',
    pathPrefixes: ['/admin/tracking'],
    defaultLevels: ['admin', 'manager', 'marketing', 'finance']
  },
  {
    code: 'tools',
    label: 'Tools',
    description: 'Ferramentas operacionais do painel.',
    pathPrefixes: ['/admin/tools'],
    defaultLevels: ['admin', 'manager', 'marketing', 'finance']
  },
  {
    code: 'team',
    label: 'Team',
    description: 'Area de time e treinamento.',
    pathPrefixes: ['/admin/team'],
    defaultLevels: ['admin', 'manager', 'marketing']
  },
  {
    code: 'site',
    label: 'Site',
    description: 'Area de site, produtos e leads.',
    pathPrefixes: ['/admin/site'],
    defaultLevels: ['admin', 'manager', 'marketing']
  },
  {
    code: 'profile',
    label: 'Perfil',
    description: 'Perfil do usuario.',
    pathPrefixes: ['/admin/profile'],
    defaultLevels: ['admin', 'consultant', 'manager', 'marketing', 'finance', 'viewer']
  },
  {
    code: 'settings',
    label: 'Configuracoes',
    description: 'Configuracoes do painel.',
    pathPrefixes: ['/admin/settings'],
    defaultLevels: ['admin', 'consultant', 'manager', 'marketing', 'finance', 'viewer']
  },
  {
    code: 'dashboard',
    label: 'Painel',
    description: 'Tela inicial do painel.',
    pathPrefixes: ['/admin'],
    defaultLevels: ['admin', 'consultant', 'manager', 'marketing', 'finance', 'viewer']
  }
]

const ADMIN_FEATURES_BY_CODE = Object.fromEntries(
  ADMIN_FEATURES.map(feature => [feature.code, feature])
) as Record<AdminFeatureCode, AdminFeatureDefinition>

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePath(value: unknown) {
  const normalized = normalizeText(value)
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizePathname(value: unknown) {
  const normalized = normalizePath(value)
  return normalized.split(/[?#]/, 1)[0] || '/'
}

function normalizeUserType(value: unknown): AdminAccessUserType {
  return normalizeText(value).toLowerCase() === 'client' ? 'client' : 'admin'
}

function normalizeUserLevel(value: unknown): AdminAccessLevel {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'admin' || normalized === 'consultant' || normalized === 'manager' || normalized === 'finance' || normalized === 'viewer') {
    return normalized
  }
  return 'marketing'
}

function pathMatchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function parseJSONObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, any>) }
  }

  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, any>) }
      }
    } catch {
      return {}
    }
  }

  return {}
}

function normalizeFeatureCode(value: unknown): AdminFeatureCode | '' {
  const normalized = normalizeText(value).toLowerCase()
  const matched = ADMIN_FEATURES.find(feature => feature.code === normalized)
  return matched?.code || ''
}

function normalizeFeatureCodes(value: unknown) {
  const source = Array.isArray(value) ? value : []
  const output: AdminFeatureCode[] = []
  const seen = new Set<AdminFeatureCode>()

  for (const entry of source) {
    const code = normalizeFeatureCode(entry)
    if (!code || seen.has(code)) continue
    seen.add(code)
    output.push(code)
  }

  return output
}

export function parseAdminPreferences(value: unknown): ParsedAdminPreferences {
  const raw = parseJSONObject(value)
  const adminAccess = parseJSONObject(raw.adminAccess)

  return {
    raw,
    adminAccess: {
      allowFeatures: normalizeFeatureCodes(adminAccess.allowFeatures),
      denyFeatures: normalizeFeatureCodes(adminAccess.denyFeatures)
    }
  }
}

export function mergeAdminAccessPreferences(
  value: unknown,
  nextOverrides: Partial<AdminFeatureOverrides>
) {
  const parsed = parseAdminPreferences(value)
  parsed.raw.adminAccess = {
    allowFeatures: normalizeFeatureCodes(nextOverrides.allowFeatures ?? parsed.adminAccess.allowFeatures),
    denyFeatures: normalizeFeatureCodes(nextOverrides.denyFeatures ?? parsed.adminAccess.denyFeatures)
  }

  return JSON.stringify(parsed.raw)
}

export function listAdminFeatures() {
  return ADMIN_FEATURES
}

export function getAdminFeatureDefinition(featureCode: unknown) {
  const normalized = normalizeFeatureCode(featureCode)
  return normalized ? ADMIN_FEATURES_BY_CODE[normalized] : null
}

export function resolveAdminAccessFlags(context: AdminAccessContext): AdminAccessFlags {
  const profileUserType = normalizeUserType(context.profileUserType)
  const profileUserLevel = normalizeUserLevel(context.profileUserLevel)
  const isSuperRoot = context.isRootUser
    && profileUserType === 'admin'
    && profileUserLevel === 'admin'

  const activeUserType = isSuperRoot
    ? normalizeUserType(context.sessionUserType || profileUserType)
    : profileUserType

  const activeUserLevel = isSuperRoot
    ? normalizeUserLevel(context.sessionUserLevel || profileUserLevel)
    : profileUserLevel

  const isPlatformStaff = context.isRootUser && !isSuperRoot
  const isTenantAdmin = !context.isRootUser
    && activeUserType === 'admin'
    && activeUserLevel === 'admin'

  const canCrossClientAccess = context.isRootUser && activeUserType === 'admin'
  const canManageUsers = activeUserLevel === 'admin'

  return {
    isSuperRoot,
    isPlatformStaff,
    isTenantAdmin,
    activeUserType,
    activeUserLevel,
    canSimulate: isSuperRoot,
    canCrossClientAccess,
    canManageUsers,
    canAccessThemes: context.isAuthenticated
  }
}

export function getAdminFeatureForPath(path: string) {
  const ordered = [...ADMIN_FEATURES].sort((a, b) => {
    const aLength = Math.max(...a.pathPrefixes.map(prefix => prefix.length))
    const bLength = Math.max(...b.pathPrefixes.map(prefix => prefix.length))
    return bLength - aLength
  })

  for (const feature of ordered) {
    if (feature.pathPrefixes.some(prefix => pathMatchesPrefix(path, prefix))) {
      return feature
    }
  }

  return null
}

function resolveDefaultFeatureAccess(feature: AdminFeatureDefinition, flags: AdminAccessFlags) {
  if (flags.isSuperRoot && flags.activeUserType === 'admin' && flags.activeUserLevel === 'admin') {
    return true
  }

  return feature.defaultLevels.includes(flags.activeUserLevel)
}

function canBypassModuleRequirement(feature: AdminFeatureDefinition, flags: AdminAccessFlags) {
  return feature.code === 'manage.indicators'
    && flags.isSuperRoot
    && flags.activeUserType === 'admin'
    && flags.activeUserLevel === 'admin'
}

function resolveFeatureAccess(feature: AdminFeatureDefinition, context: AdminAccessContext) {
  const flags = resolveAdminAccessFlags(context)
  const preferences = parseAdminPreferences(context.preferences)

  if (feature.moduleCode && !context.hasModule(feature.moduleCode) && !canBypassModuleRequirement(feature, flags)) {
    const moduleReasonByCode: Record<string, AdminAccessReason> = {
      atendimento: 'module-atendimento',
      'fila-atendimento': 'module-fila-atendimento',
      indicators: 'module-indicators',
      finance: 'module-finance'
    }

    return {
      allowed: false,
      reason: moduleReasonByCode[feature.moduleCode] || 'feature-denied'
    } satisfies AdminAccessResult
  }

  if (preferences.adminAccess.denyFeatures.includes(feature.code)) {
    return { allowed: false, reason: 'feature-denied', featureCode: feature.code } satisfies AdminAccessResult
  }

  if (preferences.adminAccess.allowFeatures.includes(feature.code)) {
    return { allowed: true, featureCode: feature.code } satisfies AdminAccessResult
  }

  if (!resolveDefaultFeatureAccess(feature, flags)) {
    return { allowed: false, reason: 'feature-denied', featureCode: feature.code } satisfies AdminAccessResult
  }

  return { allowed: true, featureCode: feature.code } satisfies AdminAccessResult
}

export function isSafeAdminRedirectPath(path: unknown) {
  const normalized = normalizePath(path)
  const pathname = normalizePathname(path)
  if (!pathname.startsWith('/admin')) return false
  if (isPublicAdminPath(pathname)) return false
  return true
}

export function resolveAccessibleAdminRedirect(path: unknown, context: AdminAccessContext) {
  const requestedPath = isSafeAdminRedirectPath(path) ? normalizePath(path) : '/admin'
  const defaultCandidates = [
    '/admin/fila-atendimento',
    '/admin/omnichannel/inbox',
    '/admin/profile',
    '/admin/settings',
    '/admin',
    '/admin/access-denied'
  ]
  const candidates = requestedPath === '/admin'
    ? defaultCandidates
    : [
        requestedPath,
        ...defaultCandidates
      ]
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue
    }

    seen.add(candidate)
    if (evaluateAdminRouteAccess(candidate, context).allowed) {
      return candidate
    }
  }

  return '/admin/login'
}

export function evaluateAdminRouteAccess(path: unknown, context: AdminAccessContext): AdminAccessResult {
  const normalizedPath = normalizePath(path)

  if (!normalizedPath.startsWith('/admin') || isPublicAdminPath(normalizedPath)) {
    return { allowed: true }
  }

  if (!context.isAuthenticated) {
    return { allowed: false, reason: 'login-required' }
  }

  if (normalizedPath === '/admin/access-denied') {
    return { allowed: true }
  }

  const feature = getAdminFeatureForPath(normalizedPath)
  if (!feature) {
    return { allowed: true }
  }

  return resolveFeatureAccess(feature, context)
}

export function describeAdminAccessReason(reason: unknown, featureCode?: unknown) {
  const normalized = normalizeText(reason).toLowerCase() as AdminAccessReason

  if (normalized === 'login-required') {
    return {
      title: 'Login necessario',
      description: 'Sua sessao nao esta autenticada. Entre novamente para continuar.'
    }
  }

  if (normalized === 'module-atendimento') {
    return {
      title: 'Modulo indisponivel',
      description: 'Este contexto nao possui o modulo de atendimento ativo.'
    }
  }

  if (normalized === 'module-fila-atendimento') {
    return {
      title: 'Modulo indisponivel',
      description: 'Este contexto nao possui o modulo de fila de atendimento ativo.'
    }
  }

  if (normalized === 'module-indicators') {
    return {
      title: 'Modulo indisponivel',
      description: 'Este contexto nao possui o modulo de indicadores ativo.'
    }
  }

  if (normalized === 'module-finance') {
    return {
      title: 'Modulo indisponivel',
      description: 'Este contexto nao possui o modulo financeiro ativo.'
    }
  }

  const feature = getAdminFeatureDefinition(featureCode)
  if (normalized === 'feature-denied' && feature) {
    return {
      title: 'Acesso negado',
      description: `Seu perfil nao possui permissao para acessar ${feature.label}.`
    }
  }

  return {
    title: 'Acesso negado',
    description: 'Voce nao possui permissao para acessar esta pagina.'
  }
}
