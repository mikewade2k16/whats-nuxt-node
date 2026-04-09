import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const coreUserId = requireFilaAtendimentoRouteParam(event, 'coreUserId')
  return forwardFilaAtendimentoMutation(event, `/v1/user-grants/core/${encodeURIComponent(coreUserId)}/archive`, {
    method: 'POST',
    readRequestBody: false
  })
})