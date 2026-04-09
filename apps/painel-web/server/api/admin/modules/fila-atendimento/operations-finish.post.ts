import { defineEventHandler } from 'h3'
import { forwardFilaAtendimentoOperationMutation } from '~~/server/utils/fila-atendimento-operations'

export default defineEventHandler(async (event) => {
  return forwardFilaAtendimentoOperationMutation(event, '/v1/operations/finish')
})