import { createError, getRouterParam } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { deleteFinanceSheetById } from '~~/server/utils/finances-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id da planilha invalido.' })
  }

  const deleted = deleteFinanceSheetById(id, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Planilha nao encontrada.' })
  }

  return {
    status: 'success'
  }
})

