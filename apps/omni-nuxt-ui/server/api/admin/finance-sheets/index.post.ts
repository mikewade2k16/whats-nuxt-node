import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceSheetItem } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const body = await readBody<{
    title?: string
    period?: string
    status?: string
    notes?: string
    entradas?: unknown
    saidas?: unknown
    clientId?: number
  }>(event)

  const clientId = resolveOwnedClientId(access, body?.clientId)
  if (access.isClient && clientId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente do usuario nao identificado.' })
  }

  const response = await coreAdminFetch<{ item: FinanceSheetItem }>(
    event,
    '/core/admin/finance-sheets',
    {
      method: 'POST',
      body: {
        title: body?.title,
        period: body?.period,
        status: body?.status,
        notes: body?.notes,
        entradas: body?.entradas,
        saidas: body?.saidas,
        clientId: clientId > 0 ? clientId : undefined
      }
    }
  )

  return {
    status: 'success' as const,
    data: response.item
  }
})
