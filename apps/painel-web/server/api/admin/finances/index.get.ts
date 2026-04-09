import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceSheetListItem, FinancesListMeta } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '120'), 10)
  const clientIdRaw = Number.parseInt(String(query.clientId ?? ''), 10)
  const clientId = Number.isFinite(clientIdRaw) && clientIdRaw > 0
    ? (access.isAdmin ? clientIdRaw : access.clientId)
    : (access.isAdmin ? 0 : access.clientId)
  const period = String(query.period ?? '').trim()
  const q = String(query.q ?? '').trim()

  const response = await coreAdminFetch<{ items: FinanceSheetListItem[], meta: FinancesListMeta }>(
    event,
    `/core/admin/finance-sheets${buildCoreQuery({
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 120,
      q: q || undefined,
      clientId: clientId > 0 ? clientId : undefined,
      period: period || undefined
    })}`
  )

  return {
    status: 'success' as const,
    data: response.items ?? [],
    meta: response.meta
  }
})
