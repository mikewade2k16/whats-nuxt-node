import { createError, getRouterParam } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { deleteShortLinkById } from '~~/server/utils/short-links-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/encurtador-link')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)

  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id de link invalido.' })
  }

  const deleted = deleteShortLinkById(id, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Link curto nao encontrado.' })
  }

  return {
    status: 'success'
  }
})

