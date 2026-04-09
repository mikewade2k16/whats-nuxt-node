import { getRouterParam, readBody, type H3Event } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch } from '~~/server/utils/fila-atendimento-api'

interface ForwardFilaAtendimentoMutationOptions {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  readRequestBody?: boolean
}

export async function forwardFilaAtendimentoMutation(
  event: H3Event,
  path: string,
  options: ForwardFilaAtendimentoMutationOptions = {}
) {
  await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')

  const body = options.body !== undefined
    ? options.body
    : options.readRequestBody === false
      ? undefined
      : await readBody<Record<string, unknown>>(event).catch(() => ({}))

  return filaAtendimentoFetch(event, path, {
    method: options.method || 'POST',
    body
  })
}

export function requireFilaAtendimentoRouteParam(event: H3Event, name: string) {
  return String(getRouterParam(event, name) || '').trim()
}