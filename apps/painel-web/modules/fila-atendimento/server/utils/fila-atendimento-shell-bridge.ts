import crypto from 'node:crypto'
import type { AccessContext } from '~~/server/utils/access-context'
import type { ResolvedAdminProfile } from '~~/server/utils/admin-profile'
import type { FilaAtendimentoShellScopeMode } from '@fila-atendimento/server/utils/fila-atendimento-shell-scope'

const SHELL_BRIDGE_TOKEN_PREFIX = 'ldv-shell-v1'

interface CreateFilaAtendimentoShellBridgeTokenOptions {
  secret: string
  access: AccessContext
  profile: ResolvedAdminProfile
  scope?: {
    coreTenantId?: string
    tenantSlug?: string
    tenantName?: string
    scopeMode?: FilaAtendimentoShellScopeMode
    storeIds?: string[]
    stores?: Array<{
      id?: string
      code?: string
      name?: string
      city?: string
    }>
    consultants?: Array<{
      userId?: string
      name?: string
      email?: string
      storeId?: string
      registrationNumber?: string
    }>
  }
  ttlSeconds?: number
}

function normalizeDisplayName(profile: ResolvedAdminProfile, access: AccessContext) {
  return String(profile.name || profile.nick || access.email || '').trim()
}

function resolveEffectivePlatformAdmin(access: AccessContext) {
  return Boolean(
    access.isPlatformAdmin
    && access.userType === 'admin'
    && access.userLevel === 'admin'
  )
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

export function createFilaAtendimentoShellBridgeToken(options: CreateFilaAtendimentoShellBridgeTokenOptions) {
  const secret = String(options.secret || '').trim()
  if (!secret) {
    throw new Error('FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET nao configurado.')
  }

  const ttlSeconds = Math.max(30, Number(options.ttlSeconds || 120) || 120)
  const now = Math.floor(Date.now() / 1000)
  const scopeMode = String(options.scope?.scopeMode || '').trim().toLowerCase()
  const isPlatformScope = scopeMode === 'platform'
  const payload = {
    sub: String(options.access.coreUserId || options.profile.coreUserId || '').trim(),
    name: normalizeDisplayName(options.profile, options.access),
    email: String(options.access.email || options.profile.email || '').trim().toLowerCase(),
    userType: String(options.access.userType || options.profile.userType || '').trim().toLowerCase(),
    userLevel: String(options.access.userLevel || options.profile.level || '').trim().toLowerCase(),
    businessRole: String(options.profile.businessRole || '').trim().toLowerCase(),
    tenantId: isPlatformScope ? '' : String(options.scope?.coreTenantId || options.access.tenantId || options.profile.tenantId || '').trim(),
    tenantSlug: isPlatformScope ? '' : String(options.scope?.tenantSlug || '').trim().toLowerCase(),
    tenantName: isPlatformScope ? '' : String(options.scope?.tenantName || '').trim(),
    clientId: isPlatformScope ? null : (options.access.clientId > 0 ? options.access.clientId : null),
    isPlatformAdmin: resolveEffectivePlatformAdmin(options.access),
    moduleCodes: Array.isArray(options.access.profileModuleCodes) ? options.access.profileModuleCodes : [],
    storeIds: Array.isArray(options.scope?.storeIds)
      ? options.scope.storeIds.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    stores: Array.isArray(options.scope?.stores)
      ? options.scope.stores
        .map(store => ({
          id: String(store?.id || '').trim(),
          code: String(store?.code || '').trim(),
          name: String(store?.name || '').trim(),
          city: String(store?.city || '').trim()
        }))
        .filter(store => store.id && store.name)
      : [],
    consultants: Array.isArray(options.scope?.consultants)
      ? options.scope.consultants
        .map(consultant => ({
          userId: String(consultant?.userId || '').trim(),
          name: String(consultant?.name || '').trim(),
          email: String(consultant?.email || '').trim().toLowerCase(),
          storeId: String(consultant?.storeId || '').trim(),
          registrationNumber: String(consultant?.registrationNumber || '').trim()
        }))
        .filter(consultant => consultant.userId && consultant.name && consultant.email && consultant.storeId)
      : [],
    scopeMode,
    iat: now,
    exp: now + ttlSeconds
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')

  return `${SHELL_BRIDGE_TOKEN_PREFIX}.${encodedPayload}.${signature}`
}
