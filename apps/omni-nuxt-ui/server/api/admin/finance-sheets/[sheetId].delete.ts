import { createError, getRouterParam } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  void access

  const sheetId = String(getRouterParam(event, 'sheetId') ?? '').trim().toLowerCase()
  if (!sheetId) {
    throw createError({ statusCode: 400, statusMessage: 'Id da planilha invalido.' })
  }

  await coreAdminFetch(event, `/core/admin/finance-sheets/${sheetId}`, { method: 'DELETE' })

  return { status: 'success' as const }
})
