import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceConfigData } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const body = await readBody<{
    clientId?: number
    categories?: unknown
    fixedAccounts?: unknown
    recurringEntries?: unknown
  }>(event)

  const clientId = resolveOwnedClientId(access, body?.clientId)
  if (access.isClient && clientId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente do usuario nao identificado.' })
  }

  const response = await coreAdminFetch<{ config: FinanceConfigData }>(
    event,
    '/core/admin/finance-config',
    {
      method: 'PUT',
      body: {
        clientId: clientId > 0 ? clientId : undefined,
        categories: body?.categories,
        fixedAccounts: body?.fixedAccounts,
        recurringEntries: body?.recurringEntries
      }
    }
  )

  return {
    status: 'success' as const,
    data: response.config
  }
})
