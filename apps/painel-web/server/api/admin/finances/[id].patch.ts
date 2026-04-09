import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceSheetItem } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const sheetId = String(getRouterParam(event, 'id') ?? '').trim().toLowerCase()
  if (!sheetId) {
    throw createError({ statusCode: 400, statusMessage: 'Id da planilha invalido.' })
  }

  const body = await readBody<{
    title?: string
    period?: string
    status?: string
    notes?: string
    entradas?: unknown
    saidas?: unknown
    clientId?: number
  }>(event)

  const resolvedClientId = resolveOwnedClientId(access, body?.clientId)

  const response = await coreAdminFetch<{ item: FinanceSheetItem }>(
    event,
    `/core/admin/finance-sheets/${sheetId}`,
    {
      method: 'PUT',
      body: {
        title: body?.title,
        period: body?.period,
        status: body?.status,
        notes: body?.notes,
        entradas: body?.entradas,
        saidas: body?.saidas,
        clientId: resolvedClientId > 0 ? resolvedClientId : undefined
      }
    }
  )

  return {
    status: 'success' as const,
    data: response.item
  }
})
