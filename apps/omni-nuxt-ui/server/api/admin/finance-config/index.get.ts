import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceConfigData } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const clientIdRaw = Number.parseInt(String(query.clientId ?? ''), 10)
  const clientId = Number.isFinite(clientIdRaw) && clientIdRaw > 0
    ? (access.isAdmin ? clientIdRaw : access.clientId)
    : (access.isAdmin ? 0 : access.clientId)

  const response = await coreAdminFetch<{ config: FinanceConfigData }>(
    event,
    `/core/admin/finance-config${buildCoreQuery({
      clientId: clientId > 0 ? clientId : undefined
    })}`
  )

  return {
    status: 'success' as const,
    data: response.config
  }
})
