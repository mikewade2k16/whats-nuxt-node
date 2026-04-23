import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoOperationMutation } from '@fila-atendimento/server/utils/fila-atendimento-operations'

export default defineEventHandler(async (event) => {
  return forwardFilaAtendimentoOperationMutation(event, '/v1/operations/resume')
})