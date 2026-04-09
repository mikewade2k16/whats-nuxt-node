import { createError, getRouterParam } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { deleteScriptById } from '~~/server/utils/scripts-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/scripts')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id de script invalido.' })
  }

  const deleted = deleteScriptById(id, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Script nao encontrado.' })
  }

  return {
    status: 'success'
  }
})

