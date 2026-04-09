import { getHeader, type H3Event } from 'h3'
import { evaluateAdminRouteAccess, resolveAdminAccessFlags } from '~~/app/utils/admin-access'
import { resolveAdminProfile } from '~~/server/utils/admin-profile'

export type AccessUserType = 'admin' | 'client'
export type AccessUserLevel = 'admin' | 'manager' | 'marketing' | 'finance' | 'viewer'

export interface AccessContext {
  isAuthenticated: boolean
  isPlatformAdmin: boolean
  isSuperRoot: boolean
  profileId: number
  coreUserId: string
  email: string
  tenantId?: string
  userType: AccessUserType
  userLevel: AccessUserLevel
  profileUserType: AccessUserType
  profileUserLevel: AccessUserLevel
  clientId: number
  profileClientId: number
  preferences: string
  profileModuleCodes: string[]
  atendimentoAccess: boolean
  isAdmin: boolean
  isClient: boolean
  canManageUsers: boolean
  canCrossClientAccess: boolean
}

type AccessContextEventStore = H3Event['context'] & {
  adminAccessContext?: AccessContext
  adminAccessContextError?: unknown
}

function getAccessContextStore(event: H3Event) {
  return event.context as AccessContextEventStore
}

export const DEFAULT_ADMIN_CLIENT_ID = 106

function parseClientId(raw: unknown) {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function parseUserLevel(raw: unknown): AccessUserLevel {
  const normalized = String(raw ?? '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'manager' || normalized === 'finance' || normalized === 'viewer') {
    return normalized
  }
  return 'marketing'
}

function normalizeUserType(raw: unknown): AccessUserType {
  return String(raw ?? '').trim().toLowerCase() === 'client' ? 'client' : 'admin'
}

export function createDefaultAccessContext(): AccessContext {
  return {
    isAuthenticated: false,
    isPlatformAdmin: false,
    isSuperRoot: false,
    profileId: 0,
    coreUserId: '',
    email: '',
    tenantId: undefined,
    userType: 'client',
    userLevel: 'marketing',
    profileUserType: 'client',
    profileUserLevel: 'marketing',
    clientId: 0,
    profileClientId: 0,
    preferences: '{}',
    profileModuleCodes: [],
    atendimentoAccess: false,
    isAdmin: false,
    isClient: true,
    canManageUsers: false,
    canCrossClientAccess: false
  }
}

function fallbackClientId(value: number) {
  if (value > 0) {
    return value
  }
  return DEFAULT_ADMIN_CLIENT_ID
}

export async function resolveAccessContextOrThrow(event: H3Event): Promise<AccessContext> {
  const store = getAccessContextStore(event)
  if (store.adminAccessContext) {
    return store.adminAccessContext
  }

  if (store.adminAccessContextError) {
    throw store.adminAccessContextError
  }

  try {
    const profile = await resolveAdminProfile(event)
    const profileUserType = normalizeUserType(profile.userType)
    const profileUserLevel = parseUserLevel(profile.level)
    const profileClientId = parseClientId(profile.clientId)
    const preferences = String(profile.preferences ?? '{}').trim() || '{}'

    const baseFlags = resolveAdminAccessFlags({
      isAuthenticated: true,
      isRootUser: Boolean(profile.isPlatformAdmin),
      profileUserType,
      profileUserLevel,
      sessionUserType: profileUserType,
      sessionUserLevel: profileUserLevel,
      preferences,
      hasModule: (moduleCode: string) => profile.moduleCodes.includes(String(moduleCode ?? '').trim().toLowerCase())
    })

    const headerUserType = String(getHeader(event, 'x-user-type') ?? '').trim()
    const headerUserLevel = String(getHeader(event, 'x-user-level') ?? '').trim()
    const headerClientId = getHeader(event, 'x-client-id')

    const effectiveUserType = baseFlags.canSimulate
      ? normalizeUserType(headerUserType || profileUserType)
      : profileUserType

    const effectiveUserLevel = baseFlags.canSimulate
      ? parseUserLevel(headerUserLevel || profileUserLevel)
      : profileUserLevel

    const effectiveClientId = baseFlags.canSimulate
      ? (parseClientId(headerClientId) || fallbackClientId(profileClientId))
      : profileClientId

    const flags = resolveAdminAccessFlags({
      isAuthenticated: true,
      isRootUser: Boolean(profile.isPlatformAdmin),
      profileUserType,
      profileUserLevel,
      sessionUserType: effectiveUserType,
      sessionUserLevel: effectiveUserLevel,
      preferences,
      hasModule: (moduleCode: string) => profile.moduleCodes.includes(String(moduleCode ?? '').trim().toLowerCase())
    })

    const canCrossClientAccess = flags.canCrossClientAccess
    const dataScopedUserType: AccessUserType = canCrossClientAccess ? 'admin' : 'client'
    const canManageUsers = evaluateAdminRouteAccess('/admin/manage/users', {
      isAuthenticated: true,
      isRootUser: Boolean(profile.isPlatformAdmin),
      profileUserType,
      profileUserLevel,
      sessionUserType: effectiveUserType,
      sessionUserLevel: effectiveUserLevel,
      preferences,
      hasModule: () => true
    }).allowed

    const resolvedAccess: AccessContext = {
      isAuthenticated: true,
      isPlatformAdmin: Boolean(profile.isPlatformAdmin),
      isSuperRoot: flags.isSuperRoot,
      profileId: profile.id,
      coreUserId: profile.coreUserId,
      email: profile.email,
      tenantId: profile.tenantId,
      userType: dataScopedUserType,
      userLevel: flags.activeUserLevel,
      profileUserType,
      profileUserLevel,
      clientId: effectiveClientId,
      profileClientId,
      preferences,
      profileModuleCodes: profile.moduleCodes,
      atendimentoAccess: profile.atendimentoAccess,
      isAdmin: canCrossClientAccess,
      isClient: !canCrossClientAccess,
      canManageUsers,
      canCrossClientAccess
    }

    store.adminAccessContext = resolvedAccess
    return resolvedAccess
  } catch (error) {
    store.adminAccessContextError = error
    throw error
  }
}

export async function resolveAccessContext(event: H3Event): Promise<AccessContext> {
  try {
    return await resolveAccessContextOrThrow(event)
  } catch {
    return createDefaultAccessContext()
  }
}

export function resolveOwnedClientId(
  access: AccessContext,
  requestedClientId: unknown,
  fallbackAdminClientId = DEFAULT_ADMIN_CLIENT_ID
) {
  if (!access.canCrossClientAccess) {
    return access.clientId
  }

  const requested = parseClientId(requestedClientId)
  if (requested > 0) {
    return requested
  }

  if (access.clientId > 0) {
    return access.clientId
  }

  return fallbackAdminClientId
}
