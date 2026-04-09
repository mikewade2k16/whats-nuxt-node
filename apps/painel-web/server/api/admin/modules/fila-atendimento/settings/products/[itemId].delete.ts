import { defineEventHandler } from 'h3'
import { buildFilaAtendimentoQuery } from '~~/server/utils/fila-atendimento-query'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const itemId = requireFilaAtendimentoRouteParam(event, 'itemId')
  const query = buildFilaAtendimentoQuery(event, ['storeId'])

  return forwardFilaAtendimentoMutation(event, `/v1/settings/products/${encodeURIComponent(itemId)}${query}`, {
    method: 'DELETE',
    readRequestBody: false
  })
})