import { createError, readBody, setResponseStatus } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createCandidate } from '~~/server/utils/candidates-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/team/candidatos')
  const body = await readBody<{ nome?: string, clientId?: string | number, vaga?: string }>(event)
  const effectiveClientId = resolveOwnedClientId(access, body?.clientId)

  const created = createCandidate({
    nome: body?.nome,
    clientId: effectiveClientId,
    vaga: body?.vaga
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  setResponseStatus(event, 201)

  return {
    status: 'success',
    data: created
  }
})

