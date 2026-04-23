import { createError, type H3Event } from 'h3'
import type { AccessContext } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreAdminUsersScopeResponse {
  items?: Array<{
    coreUserId?: string
    coreTenantId?: string | null
    isPlatformAdmin?: boolean
  }>
}

function normalizeCoreUserId(value: unknown) {
  return String(value ?? '').trim()
}

export function assertCanManageUsers(access: AccessContext) {
  if (!access.canManageUsers) {
    throw createError({ statusCode: 403, statusMessage: 'Somente admin de tenant ou root admin pode acessar usuarios.' })
  }
}

export function resolveManagedUsersCoreTenantId(access: AccessContext, requestedCoreTenantId?: string) {
  if (!access.canCrossClientAccess) {
    if (!String(access.tenantId || '').trim()) {
      throw createError({ statusCode: 403, statusMessage: 'Sessao sem cliente valido para listar usuarios.' })
    }
    return String(access.tenantId)
  }

  const normalized = String(requestedCoreTenantId ?? '').trim()
  return normalized
}

export function normalizeCreateUserPayloadForScope(
  access: AccessContext,
  payload: Record<string, unknown>
) {
  if (access.canCrossClientAccess) {
    const isPlatformAdmin = Boolean(payload.isPlatformAdmin)
    return {
      ...payload,
      coreTenantId: isPlatformAdmin ? null : payload.coreTenantId ?? null,
      level: isPlatformAdmin ? 'admin' : payload.level,
      userType: isPlatformAdmin ? 'admin' : payload.userType,
      isPlatformAdmin
    }
  }

  return {
    ...payload,
    coreTenantId: String(access.tenantId || '').trim() || null,
    isPlatformAdmin: false
  }
}

export function assertUserFieldAllowedForScope(access: AccessContext, field: string) {
  if (access.canCrossClientAccess) return

  if (field === 'coreTenantId') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin de cliente nao pode mover usuario entre clientes.'
    })
  }
}

export async function assertUserWithinManagedScope(event: H3Event, access: AccessContext, coreUserId: string) {
  if (access.canCrossClientAccess) {
    return
  }

  if (!String(access.tenantId || '').trim()) {
    throw createError({ statusCode: 403, statusMessage: 'Sessao sem cliente valido para gerenciar usuarios.' })
  }

  const response = await coreAdminFetch<CoreAdminUsersScopeResponse>(
    event,
    `/core/admin/users${buildCoreQuery({
      page: 1,
      limit: 200,
      coreTenantId: String(access.tenantId || '').trim()
    })}`
  )

	const targetId = normalizeCoreUserId(coreUserId)
	const matched = (response.items || []).find(item => normalizeCoreUserId(item.coreUserId) === targetId)

  if (!matched || Boolean(matched.isPlatformAdmin)) {
    throw createError({ statusCode: 403, statusMessage: 'Usuario fora do escopo deste cliente.' })
  }
}
