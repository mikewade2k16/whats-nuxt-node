import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { updateFinancesConfigByClientId } from '~~/server/utils/finances-config-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const body = await readBody<{
    clientId?: number
    categories?: unknown
    fixedAccounts?: unknown
    recurringEntries?: unknown
  }>(event)

  const targetClientId = resolveOwnedClientId(access, body?.clientId)

  return {
    status: 'success',
    data: updateFinancesConfigByClientId(targetClientId, {
      categories: body?.categories,
      fixedAccounts: body?.fixedAccounts,
      recurringEntries: body?.recurringEntries
    })
  }
})

