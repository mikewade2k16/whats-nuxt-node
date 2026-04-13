import { createError, getRouterParam, readBody } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { assertUserFieldAllowedForScope, assertUserWithinManagedScope } from '~~/server/utils/admin-users-access'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

const allowedFields = new Set([
  'clientId',
  'atendimentoAccess',
  'level',
  'name',
  'nick',
  'email',
  'password',
  'phone',
  'status',
  'profileImage',
  'lastLogin',
  'createdAt',
  'preferences',
  'businessRole',
  'storeId',
  'registrationNumber'
])

export default defineEventHandler(async (event) => {
  const access = await requireTenantAdmin(event, '/admin/manage/users')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User id invalido.' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const field = String(body?.field ?? '').trim()

  if (!field || !allowedFields.has(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Campo invalido para atualizacao.' })
  }

  assertUserFieldAllowedForScope(access, field)
  await assertUserWithinManagedScope(event, access, Number.parseInt(id, 10))

  const updated = await coreAdminFetch(
    event,
    `/core/admin/users/${id}`,
    {
      method: 'PATCH',
      body: {
        field,
        value: body?.value
      }
    }
  )

  return {
    status: 'success',
    data: updated
  }
})

