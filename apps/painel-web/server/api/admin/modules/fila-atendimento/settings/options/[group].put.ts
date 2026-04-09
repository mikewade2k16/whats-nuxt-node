import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation, requireFilaAtendimentoRouteParam } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  const group = requireFilaAtendimentoRouteParam(event, 'group')
  return forwardFilaAtendimentoMutation(event, `/v1/settings/options/${encodeURIComponent(group)}`, {
    method: 'PUT'
  })
})