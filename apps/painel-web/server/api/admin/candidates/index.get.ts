import { createError, getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { listCandidates } from '~~/server/utils/candidates-repository'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const access = await requireScopedFeatureAccess(event, '/admin/team/candidatos')

  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '50'), 10)

  const { items, meta, filters } = listCandidates({
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 50,
    q: String(query.q ?? ''),
    status: String(query.status ?? ''),
    vaga: String(query.vaga ?? ''),
    loja: String(query.loja ?? ''),
    clientId: String(query.clientId ?? ''),
    hasVideo: String(query.hasVideo ?? ''),
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  return {
    status: 'success',
    data: items,
    meta,
    filters
  }
})

