import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedTenantScope } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceSheetListItem, FinancesListMeta } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '120'), 10)
  const scope = resolveOwnedTenantScope(access, {
    clientId: query.clientId,
    coreTenantId: query.coreTenantId
  })
  const period = String(query.period ?? '').trim()
  const q = String(query.q ?? '').trim()

  const response = await coreAdminFetch<{ items: FinanceSheetListItem[], meta: FinancesListMeta }>(
    event,
    `/core/admin/finance-sheets${buildCoreQuery({
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 120,
      q: q || undefined,
  		coreTenantId: scope.coreTenantId || undefined,
      period: period || undefined
    })}`
  )

  return {
    status: 'success' as const,
    data: response.items ?? [],
    meta: response.meta
  }
})
