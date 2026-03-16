import { getQuery } from 'h3'
import { requireFeatureAccess } from '~~/server/utils/admin-route-auth'
import { listQaItems } from '~~/server/utils/qa-repository'

export default defineEventHandler(async (event) => {
  await requireFeatureAccess(event, '/admin/manage/qa')

  const query = getQuery(event)
  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const limit = Number.parseInt(String(query.limit ?? '120'), 10)

  const { items, meta, filters, capabilities } = listQaItems({
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 120,
    q: String(query.q ?? ''),
    block: String(query.block ?? ''),
    sprint: String(query.sprint ?? ''),
    squad: String(query.squad ?? ''),
    status: String(query.status ?? ''),
    priority: String(query.priority ?? ''),
    source: String(query.source ?? '')
  })

  return {
    status: 'success',
    data: items,
    meta,
    filters,
    capabilities
  }
})

