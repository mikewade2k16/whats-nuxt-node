import { getQuery } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  await requireRootAdmin(event, '/admin/manage/clientes')

  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '20'), 10)
  const q = String(query.q ?? '')
  const status = String(query.status ?? '')

  const response = await coreAdminFetch<{ items: unknown[], meta: unknown }>(
    event,
    `/core/admin/clients${buildCoreQuery({
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
      q,
      status
    })}`
  )

  return {
    status: 'success',
    data: Array.isArray(response.items) ? response.items : [],
    meta: response.meta
  }
})

