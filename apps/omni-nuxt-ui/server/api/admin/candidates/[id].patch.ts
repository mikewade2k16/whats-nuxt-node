import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { updateCandidateField } from '~~/server/utils/candidates-repository'

const allowedFields = new Set([
  'nome',
  'vaga',
  'pontos',
  'status',
  'loja',
  'comment'
])

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/team/candidatos')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Candidate id invalido.' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const field = String(body?.field ?? '').trim()

  if (!field || !allowedFields.has(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Campo invalido para atualizacao.' })
  }

  const updated = updateCandidateField(id, field, body?.value, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Candidato nao encontrado.' })
  }

  return {
    status: 'success',
    data: updated
  }
})

