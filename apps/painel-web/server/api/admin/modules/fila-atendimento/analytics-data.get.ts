import { defineEventHandler } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch } from '~~/server/utils/fila-atendimento-api'
import { buildFilaAtendimentoQuery } from '~~/server/utils/fila-atendimento-query'

export default defineEventHandler(async (event) => {
  await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  return filaAtendimentoFetch(event, `/v1/analytics/data${buildFilaAtendimentoQuery(event)}`)
})