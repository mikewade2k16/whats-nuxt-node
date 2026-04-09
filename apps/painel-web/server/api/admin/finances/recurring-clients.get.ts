import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

function parseLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 200
  return Math.min(parsed, 500)
}

function parseClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const requestedClientId = parseClientId(query.clientId)
  const limit = parseLimit(query.limit)

  const response = await coreAdminFetch<{ items: Array<Record<string, unknown>> }>(
    event,
    `/core/admin/clients${buildCoreQuery({
      page: 1,
      limit,
      status: 'active'
    })}`
  )

  const items = Array.isArray(response.items) ? response.items : []

  const filtered = items.filter((client) => {
    if (!access.isAdmin) {
      return true
    }
    if (requestedClientId <= 0) {
      return true
    }
    return Number(client.id) === requestedClientId
  })

  return {
    status: 'success' as const,
    data: filtered
      .filter(client => Number(client.monthlyPaymentAmount || 0) > 0)
      .map(client => ({
        id: Number(client.id),
        name: String(client.name || `Cliente #${client.id}`),
        monthlyPaymentAmount: Number(client.monthlyPaymentAmount || 0),
        paymentDueDay: String(client.paymentDueDay || '')
      }))
  }
})
