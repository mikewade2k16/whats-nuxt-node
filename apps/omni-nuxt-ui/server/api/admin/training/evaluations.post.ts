import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { createTrainingEvaluation, listTrainingCatalogByAccess } from '~~/server/utils/training-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/team/treinamento')

  const body = await readBody<{
    clientId?: number
    trainingKey?: string
    trainingTitle?: string
    traineeName?: string
    storeName?: string
    answers?: string[]
  }>(event)
  const requestedClientIdRaw = Number.parseInt(String(body?.clientId ?? ''), 10)
  const requestedClientId = Number.isFinite(requestedClientIdRaw) && requestedClientIdRaw > 0
    ? requestedClientIdRaw
    : 0

  const trainingKey = String(body?.trainingKey ?? '').trim()
  const trainingTitle = String(body?.trainingTitle ?? '').trim()
  const traineeName = String(body?.traineeName ?? '').trim()
  const storeName = String(body?.storeName ?? '').trim()
  const answers = Array.isArray(body?.answers)
    ? body.answers.map(answer => String(answer ?? '').trim())
    : []

  if (!trainingKey || !trainingTitle) {
    throw createError({ statusCode: 400, statusMessage: 'Treinamento invalido.' })
  }

  if (!traineeName) {
    throw createError({ statusCode: 400, statusMessage: 'Informe o nome completo.' })
  }

  if (!storeName) {
    throw createError({ statusCode: 400, statusMessage: 'Informe a loja.' })
  }

  if (!answers.length || answers.some(answer => !answer)) {
    throw createError({ statusCode: 400, statusMessage: 'Responda todas as perguntas antes de enviar.' })
  }

  const allowedCatalog = listTrainingCatalogByAccess({
    viewerClientId: access.clientId,
    viewerIsAdmin: access.isAdmin,
    targetClientId: access.isAdmin ? requestedClientId : 0
  })
  const matchedTraining = allowedCatalog.sections
    .flatMap(section => section.items)
    .find(item => item.key === trainingKey && (!requestedClientId || item.clientId === requestedClientId))

  if (!matchedTraining) {
    throw createError({ statusCode: 403, statusMessage: 'Treinamento indisponivel para o cliente atual.' })
  }

  const evaluationClientId = access.isAdmin
    ? (requestedClientId || matchedTraining.clientId || access.clientId)
    : access.clientId

  const created = createTrainingEvaluation({
    clientId: evaluationClientId,
    userType: access.userType,
    trainingKey,
    trainingTitle,
    traineeName,
    storeName,
    answers
  })

  return {
    status: 'success',
    data: created
  }
})

