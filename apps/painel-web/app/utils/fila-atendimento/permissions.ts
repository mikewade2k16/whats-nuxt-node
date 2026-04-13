const ROLE_ALIAS: Record<string, string> = {
  admin: 'platform_admin'
}

const ROLE_LABELS: Record<string, string> = {
  consultant: 'Consultor',
  store_terminal: 'Acesso da loja',
  manager: 'Gerente',
  marketing: 'Marketing',
  owner: 'Proprietario',
  platform_admin: 'Admin da plataforma',
  admin: 'Admin da plataforma'
}

const ROLE_WORKSPACES: Record<string, string[]> = {
  platform_admin: ['operacao', 'consultor', 'ranking', 'dados', 'inteligencia', 'relatorios', 'campanhas', 'multiloja', 'configuracoes'],
  owner: ['operacao', 'consultor', 'ranking', 'dados', 'inteligencia', 'relatorios', 'campanhas', 'multiloja', 'configuracoes'],
  marketing: ['dados', 'inteligencia', 'relatorios', 'campanhas', 'multiloja'],
  manager: ['operacao', 'consultor', 'ranking', 'dados', 'inteligencia', 'relatorios'],
  store_terminal: ['operacao'],
  consultant: ['operacao', 'consultor', 'dados'],
  admin: ['operacao', 'consultor', 'ranking', 'dados', 'inteligencia', 'relatorios', 'campanhas', 'multiloja', 'configuracoes']
}

export function normalizeAppRole(role: unknown) {
  const normalized = String(role ?? '').trim()
  return ROLE_ALIAS[normalized] || normalized || 'consultant'
}

export function getAllowedWorkspaces(role: unknown) {
  const normalized = normalizeAppRole(role)
  return ROLE_WORKSPACES[normalized] || ROLE_WORKSPACES.consultant
}

export function getRoleLabel(role: unknown) {
  return ROLE_LABELS[normalizeAppRole(role)] || 'Consultor'
}

export function canMutateOperations(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner' || normalized === 'manager' || normalized === 'consultant'
}

export function canSeeIntegratedOperations(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner'
}

export function canManageSettings(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner'
}

export function canManageConsultants(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner'
}

export function canAccessReports(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner' || normalized === 'marketing' || normalized === 'manager'
}

export function canManageCampaigns(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner' || normalized === 'marketing'
}

export function canManageStores(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner'
}

export function canAccessMultiStore(role: unknown) {
  const normalized = normalizeAppRole(role)
  return normalized === 'platform_admin' || normalized === 'owner' || normalized === 'marketing'
}

