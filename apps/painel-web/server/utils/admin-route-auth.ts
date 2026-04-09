import { createError, getHeader, getRequestURL, type H3Event } from 'h3'
import { describeAdminAccessReason, evaluateAdminRouteAccess, getAdminFeatureForPath, type AdminAccessReason, type AdminFeatureCode } from '~~/app/utils/admin-access'
import { createDefaultAccessContext, resolveAccessContextOrThrow, type AccessContext } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import { resolveTrustedEventClientIp } from '~~/server/utils/trusted-proxy'

interface CoreAdminClientModulesPayload {
  items?: Array<{
    id?: number
    modules?: Array<{ code?: string }>
  }>
}

type AdminDeniedReason =
  | AdminAccessReason
  | 'root-admin-required'
  | 'tenant-admin-required'
  | 'client-scope-required'

function normalizeModuleCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

async function resolveClientModuleCodes(event: H3Event, access: AccessContext) {
  if (access.isSuperRoot && access.userType === 'admin' && access.userLevel === 'admin') {
    return [] as string[]
  }

  if (access.clientId <= 0) {
    return [] as string[]
  }

  const cached = event.context.adminClientModuleCodes
  if (Array.isArray(cached)) {
    return cached.map(entry => normalizeModuleCode(entry)).filter(Boolean)
  }

  const response = await coreAdminFetch<CoreAdminClientModulesPayload>(
    event,
    `/core/admin/clients${buildCoreQuery({
      page: 1,
      limit: 300
    })}`
  )

  const matched = (response.items || []).find(item => Number(item.id) === access.clientId)
  const moduleCodes = Array.isArray(matched?.modules)
    ? matched.modules.map(module => normalizeModuleCode(module?.code)).filter(Boolean)
    : []

  event.context.adminClientModuleCodes = moduleCodes
  return moduleCodes
}

function logAccessDenied(event: H3Event, access: AccessContext, payload: {
  path: string
  reason: AdminDeniedReason
  featureCode?: AdminFeatureCode
  detail?: string
}) {
  const description = describeAdminAccessReason(payload.reason, payload.featureCode).description
  const requestUrl = getRequestURL(event)

  console.warn('[admin-access-denied]', JSON.stringify({
    timestamp: new Date().toISOString(),
    method: event.method.toUpperCase(),
    path: payload.path,
    requestPath: requestUrl.pathname,
    reason: payload.reason,
    featureCode: payload.featureCode ?? null,
    detail: payload.detail || description,
    requestIp: resolveTrustedEventClientIp(event),
    correlationId: String(getHeader(event, 'x-correlation-id') ?? '').trim() || null,
    actor: {
      isAuthenticated: access.isAuthenticated,
      profileId: access.profileId || null,
      coreUserId: access.coreUserId || null,
      email: access.email || null,
      tenantId: access.tenantId || null,
      isPlatformAdmin: access.isPlatformAdmin,
      isSuperRoot: access.isSuperRoot,
      profileUserType: access.profileUserType,
      profileUserLevel: access.profileUserLevel,
      sessionUserType: access.userType,
      sessionUserLevel: access.userLevel,
      clientId: access.clientId || null,
      profileClientId: access.profileClientId || null,
      canManageUsers: access.canManageUsers,
      canCrossClientAccess: access.canCrossClientAccess
    }
  }))
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 0
  }

  const candidate = 'statusCode' in error
    ? (error as { statusCode?: unknown }).statusCode
    : 'status' in error
      ? (error as { status?: unknown }).status
      : 0

  const statusCode = Number(candidate)
  return Number.isFinite(statusCode) ? statusCode : 0
}

async function resolveProtectedRouteAccess(event: H3Event) {
  try {
    return await resolveAccessContextOrThrow(event)
  } catch (error) {
    if (getErrorStatusCode(error) === 401) {
      return createDefaultAccessContext()
    }

    throw error
  }
}

async function requireResolvedFeatureAccessInternal(
  event: H3Event,
  path: string,
  options?: { hasModule?: (moduleCode: string) => boolean }
) {
  const access = await resolveProtectedRouteAccess(event)
  const feature = getAdminFeatureForPath(path)
  const shouldResolveModules = Boolean(feature?.moduleCode)
  const moduleCodes = shouldResolveModules ? await resolveClientModuleCodes(event, access) : []
  const result = evaluateAdminRouteAccess(path, {
    isAuthenticated: access.isAuthenticated,
    isRootUser: access.isPlatformAdmin,
    profileUserType: access.profileUserType,
    profileUserLevel: access.profileUserLevel,
    sessionUserType: access.userType,
    sessionUserLevel: access.userLevel,
    preferences: access.preferences,
    hasModule: options?.hasModule ?? ((moduleCode: string) => {
      const normalized = normalizeModuleCode(moduleCode)
      if (!normalized) {
        return false
      }

      const clientHasModule = moduleCodes.includes(normalized)
      if (!clientHasModule) {
        return false
      }

      if (normalized === 'finance') {
        return true
      }

      if (access.isSuperRoot) {
        return true
      }

      return access.profileModuleCodes.includes(normalized)
    })
  })

  if (!result.allowed) {
    logAccessDenied(event, access, {
      path,
      reason: result.reason ?? 'feature-denied',
      featureCode: result.featureCode
    })

    throw createError({
      statusCode: 403,
      statusMessage: result.reason === 'module-atendimento' || result.reason === 'module-finance'
        ? 'Modulo indisponivel para esta sessao.'
        : result.reason === 'login-required'
          ? 'Sessao nao autenticada.'
          : 'Voce nao tem permissao para acessar este recurso.',
      data: {
        reason: result.reason,
        featureCode: result.featureCode ?? undefined
      }
    })
  }

  return access
}

export async function requireResolvedFeatureAccess(
  event: H3Event,
  path: string,
  options?: { hasModule?: (moduleCode: string) => boolean }
) {
  return requireResolvedFeatureAccessInternal(event, path, options)
}

export async function requireFeatureAccess(
  event: H3Event,
  path: string,
  options?: { hasModule?: (moduleCode: string) => boolean }
) {
  return requireResolvedFeatureAccessInternal(event, path, options)
}

export async function requireRootAdmin(event: H3Event, path: string) {
  const access = await requireFeatureAccess(event, path)

  if (!(access.isSuperRoot && access.userType === 'admin' && access.userLevel === 'admin')) {
    logAccessDenied(event, access, {
      path,
      reason: 'root-admin-required',
      detail: 'Somente root admin pode acessar este recurso.'
    })

    throw createError({
      statusCode: 403,
      statusMessage: 'Somente root admin pode acessar este recurso.'
    })
  }

  return access
}

export async function requireTenantAdmin(
  event: H3Event,
  path = '/admin/manage/users',
  options?: Parameters<typeof assertAdminFeatureAccess>[2]
) {
  const access = await requireFeatureAccess(event, path, options)

  if (!access.canManageUsers) {
    logAccessDenied(event, access, {
      path,
      reason: 'tenant-admin-required',
      detail: 'Somente admin de tenant ou root admin pode acessar usuarios.'
    })

    throw createError({
      statusCode: 403,
      statusMessage: 'Somente admin de tenant ou root admin pode acessar usuarios.'
    })
  }

  if (!access.canCrossClientAccess && access.clientId <= 0) {
    logAccessDenied(event, access, {
      path,
      reason: 'client-scope-required',
      detail: 'Sessao sem cliente valido para gerenciar usuarios.'
    })

    throw createError({
      statusCode: 403,
      statusMessage: 'Sessao sem cliente valido para gerenciar usuarios.'
    })
  }

  return access
}

export function assertTenantScopedClient(event: H3Event, access: AccessContext, path: string) {
  if (!access.canCrossClientAccess && access.clientId <= 0) {
    logAccessDenied(event, access, {
      path,
      reason: 'client-scope-required',
      detail: 'Cliente do usuario nao identificado.'
    })

    throw createError({
      statusCode: 403,
      statusMessage: 'Cliente do usuario nao identificado.'
    })
  }
}

export async function requireScopedFeatureAccess(
  event: H3Event,
  path: string,
  options?: Parameters<typeof assertAdminFeatureAccess>[2]
) {
  const access = await requireFeatureAccess(event, path, options)
  assertTenantScopedClient(event, access, path)
  return access
}
