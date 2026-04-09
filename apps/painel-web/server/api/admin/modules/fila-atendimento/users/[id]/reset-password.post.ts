import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const userId = requireFilaAtendimentoRouteParam(event, 'id')
  return forwardFilaAtendimentoMutation(event, `/v1/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST'
  })
})