import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const consultantId = requireFilaAtendimentoRouteParam(event, 'id')
  return forwardFilaAtendimentoMutation(event, `/v1/consultants/${encodeURIComponent(consultantId)}`, {
    method: 'PATCH'
  })
})