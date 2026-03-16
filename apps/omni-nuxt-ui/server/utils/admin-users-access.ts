import { createError, type H3Event } from 'h3'
import type { AccessContext } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreAdminUsersScopeResponse {
  items?: Array<{
    id?: number
    clientId?: number | null
    isPlatformAdmin?: boolean
  }>
}

function normalizeLegacyUserId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return parsed
}

export function assertCanManageUsers(access: AccessContext) {
  if (!access.canManageUsers) {
    throw createError({ statusCode: 403, statusMessage: 'Somente admin de tenant ou root admin pode acessar usuarios.' })
  }
}

export function resolveManagedUsersClientId(access: AccessContext, requestedClientId?: string) {
  if (!access.canCrossClientAccess) {
    if (access.clientId <= 0) {
      throw createError({ statusCode: 403, statusMessage: 'Sessao sem cliente valido para listar usuarios.' })
    }
    return String(access.clientId)
  }

  const normalized = String(requestedClientId ?? '').trim()
  return normalized
}

export function normalizeCreateUserPayloadForScope(
  access: AccessContext,
  payload: Record<string, unknown>
) {
  if (access.canCrossClientAccess) {
    return {
      ...payload,
      clientId: payload.clientId ?? null,
      userType: payload.userType
    }
  }

  return {
    ...payload,
    clientId: access.clientId > 0 ? access.clientId : null,
    userType: 'client'
  }
}

export function assertUserFieldAllowedForScope(access: AccessContext, field: string) {
  if (access.canCrossClientAccess) return

  if (field === 'clientId') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin de cliente nao pode mover usuario entre clientes.'
    })
  }
}

export async function assertUserWithinManagedScope(event: H3Event, access: AccessContext, legacyUserId: number) {
  if (access.canCrossClientAccess) {
    return
  }

  if (access.clientId <= 0) {
    throw createError({ statusCode: 403, statusMessage: 'Sessao sem cliente valido para gerenciar usuarios.' })
  }

  const response = await coreAdminFetch<CoreAdminUsersScopeResponse>(
    event,
    `/core/admin/users${buildCoreQuery({
      page: 1,
      limit: 200,
      clientId: access.clientId
    })}`
  )

  const targetId = normalizeLegacyUserId(legacyUserId)
  const matched = (response.items || []).find(item => normalizeLegacyUserId(item.id) === targetId)

  if (!matched || Boolean(matched.isPlatformAdmin)) {
    throw createError({ statusCode: 403, statusMessage: 'Usuario fora do escopo deste cliente.' })
  }
}
