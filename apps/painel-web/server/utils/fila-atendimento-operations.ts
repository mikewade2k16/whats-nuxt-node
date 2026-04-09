import { type H3Event } from 'h3'
import { forwardFilaAtendimentoMutation } from '~~/server/utils/fila-atendimento-mutation'

export async function forwardFilaAtendimentoOperationMutation(event: H3Event, path: string) {
  return forwardFilaAtendimentoMutation(event, path)
}