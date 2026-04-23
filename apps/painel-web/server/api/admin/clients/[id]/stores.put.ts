import { createError, getRouterParam, readBody } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface StoresBody {
  stores?: Array<{ id?: string, name?: string, amount?: number | string }>
}

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/manage/clientes')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente invalido.' })
  }

  const body = await readBody<StoresBody>(event)
  const stores = Array.isArray(body?.stores) ? body.stores : []

  const updated = await coreAdminFetch(
    event,
    `/core/admin/clients/${id}/stores`,
    {
      method: 'PUT',
      body: { stores }
    }
  )

  return {
    status: 'success',
    data: updated
  }
})

