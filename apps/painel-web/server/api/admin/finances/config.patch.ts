import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedTenantScope } from '~~/server/utils/access-context'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceConfigData } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const body = await readBody<{
    clientId?: number
    coreTenantId?: string
    categories?: unknown
    fixedAccounts?: unknown
    recurringEntries?: unknown
  }>(event)

	const scope = resolveOwnedTenantScope(access, {
		clientId: body?.clientId,
		coreTenantId: body?.coreTenantId
	})
	if (access.isClient && !scope.coreTenantId) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente do usuario nao identificado.' })
  }

  const response = await coreAdminFetch<{ config: FinanceConfigData }>(
    event,
    '/core/admin/finance-config',
    {
      method: 'PUT',
      body: {
		coreTenantId: scope.coreTenantId || undefined,
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
