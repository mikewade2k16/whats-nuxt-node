import { defineEventHandler, getQuery } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch } from '@fila-atendimento/server/utils/fila-atendimento-api'

export default defineEventHandler(async (event) => {
  await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  const query = getQuery(event)
  const storeId = String(query.storeId ?? '').trim()
  const includeHistory = String(query.includeHistory ?? '').trim()
  const includeActivitySessions = String(query.includeActivitySessions ?? '').trim()
  const searchParams = new URLSearchParams()

  if (storeId) {
    searchParams.set('storeId', storeId)
  }

  if (includeHistory) {
    searchParams.set('includeHistory', includeHistory)
  }

  if (includeActivitySessions) {
    searchParams.set('includeActivitySessions', includeActivitySessions)
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  return filaAtendimentoFetch(event, `/v1/operations/snapshot${suffix}`)
})
