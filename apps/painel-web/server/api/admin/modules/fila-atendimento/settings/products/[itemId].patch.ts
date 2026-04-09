import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const itemId = requireFilaAtendimentoRouteParam(event, 'itemId')
  return forwardFilaAtendimentoMutation(event, `/v1/settings/products/${encodeURIComponent(itemId)}`, {
    method: 'PATCH'
  })
})