import { createError, getRouterParam } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { assertUserWithinManagedScope } from '~~/server/utils/admin-users-access'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const access = await requireTenantAdmin(event, '/admin/manage/users')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User id invalido.' })
  }

  await assertUserWithinManagedScope(event, access, Number.parseInt(id, 10))

  await coreAdminFetch(event, `/core/admin/users/${id}`, { method: 'DELETE' })

  return {
    status: 'success'
  }
})

