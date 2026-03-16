import { createError, getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { listFinances } from '~~/server/utils/finances-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const query = getQuery(event)
  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '120'), 10)
  const clientIdRaw = Number.parseInt(String(query.clientId ?? ''), 10)
  const clientId = Number.isFinite(clientIdRaw) ? clientIdRaw : 0
  const period = String(query.period ?? '').trim()

  const { items, meta } = listFinances({
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 120,
    q: String(query.q ?? ''),
    clientId: access.isAdmin ? clientId : access.clientId,
    period,
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  return {
    status: 'success',
    data: items,
    meta
  }
})

