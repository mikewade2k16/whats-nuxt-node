import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '@fila-atendimento/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const group = requireFilaAtendimentoRouteParam(event, 'group')
  const itemId = requireFilaAtendimentoRouteParam(event, 'itemId')

  return forwardFilaAtendimentoMutation(
    event,
    `/v1/settings/options/${encodeURIComponent(group)}/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH'
    }
  )
})