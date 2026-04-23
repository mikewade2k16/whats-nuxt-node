import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '@fila-atendimento/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const storeId = requireFilaAtendimentoRouteParam(event, 'id')
  return forwardFilaAtendimentoMutation(event, `/v1/stores/${encodeURIComponent(storeId)}`, {
    method: 'DELETE',
    readRequestBody: false
  })
})