import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedTenantScope } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceConfigData } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const scope = resolveOwnedTenantScope(access, {
    clientId: query.clientId,
    coreTenantId: query.coreTenantId
  })

  const response = await coreAdminFetch<{ config: FinanceConfigData }>(
    event,
    `/core/admin/finance-config${buildCoreQuery({
    coreTenantId: scope.coreTenantId || undefined
    })}`
  )

  return {
    status: 'success' as const,
    data: response.config
  }
})
