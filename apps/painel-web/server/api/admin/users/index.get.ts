import { getQuery } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { resolveManagedUsersCoreTenantId } from '~~/server/utils/admin-users-access'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const access = await requireTenantAdmin(event, '/admin/manage/users')

  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '30'), 10)
  const q = String(query.q ?? '')
  const coreTenantId = resolveManagedUsersCoreTenantId(access, String(query.coreTenantId ?? ''))

  const response = await coreAdminFetch<{ items: unknown[], meta: unknown }>(
    event,
    `/core/admin/users${buildCoreQuery({
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 30,
      q,
      coreTenantId: coreTenantId.trim() || undefined
    })}`
  )

  return {
    status: 'success',
    data: Array.isArray(response.items) ? response.items : [],
    meta: response.meta
  }
})

