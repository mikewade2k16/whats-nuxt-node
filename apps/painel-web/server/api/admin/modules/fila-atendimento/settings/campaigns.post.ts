import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation } from '~~/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  return forwardFilaAtendimentoMutation(event, '/v1/settings/campaigns', {
    method: 'POST'
  })
})