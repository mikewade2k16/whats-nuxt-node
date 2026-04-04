import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { FinanceLineMutationData } from '~/types/finances'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  void access

  const sheetId = String(getRouterParam(event, 'sheetId') ?? '').trim().toLowerCase()
  if (!sheetId) {
    throw createError({ statusCode: 400, statusMessage: 'Id da planilha invalido.' })
  }

  const lineId = String(getRouterParam(event, 'lineId') ?? '').trim()
  if (!lineId) {
    throw createError({ statusCode: 400, statusMessage: 'Id da linha invalido.' })
  }

  const body = await readBody<{
    effective?: boolean
    effectiveDate?: string
  }>(event)

  const response = await coreAdminFetch<{ item: FinanceLineMutationData }>(
    event,
    `/core/admin/finance-sheets/${sheetId}/lines/${lineId}`,
    {
      method: 'PATCH',
      body: {
        effective: body?.effective,
        effectiveDate: body?.effectiveDate
      }
    }
  )

  return {
    status: 'success' as const,
    data: response.item
  }
})
