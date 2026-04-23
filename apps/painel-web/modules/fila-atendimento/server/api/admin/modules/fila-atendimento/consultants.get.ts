import { defineEventHandler, getQuery } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch } from '@fila-atendimento/server/utils/fila-atendimento-api'

export default defineEventHandler(async (event) => {
  await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')

  const query = getQuery(event)
  const storeId = String(query.storeId ?? '').trim()
  const suffix = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''

  return filaAtendimentoFetch(event, `/v1/consultants${suffix}`)
})