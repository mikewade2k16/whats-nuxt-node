import { createError, getRouterParam } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { deleteCandidateById } from '~~/server/utils/candidates-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/team/candidatos')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Candidate id invalido.' })
  }

  const deleted = deleteCandidateById(id, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Candidato nao encontrado.' })
  }

  return {
    status: 'success'
  }
})

