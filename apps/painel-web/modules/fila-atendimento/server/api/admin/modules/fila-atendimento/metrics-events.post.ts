import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoMutation } from '@fila-atendimento/server/utils/fila-atendimento-mutation'

export default defineEventHandler(async (event) => {
  return forwardFilaAtendimentoMutation(event, '/v1/observability/page-metrics')
})
