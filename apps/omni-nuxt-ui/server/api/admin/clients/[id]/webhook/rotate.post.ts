import { createError, getRouterParam } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/manage/clientes')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Client id invalido.' })
  }

  const updated = await coreAdminFetch(event, `/core/admin/clients/${id}/webhook/rotate`, {
    method: 'POST'
  })

  return {
    status: 'success',
    data: updated
  }
})

