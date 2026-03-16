import { createError, getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { getFinancesConfigByClientId } from '~~/server/utils/finances-config-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const query = getQuery(event)
  const targetClientId = resolveOwnedClientId(access, query.clientId)

  return {
    status: 'success',
    data: getFinancesConfigByClientId(targetClientId)
  }
})

