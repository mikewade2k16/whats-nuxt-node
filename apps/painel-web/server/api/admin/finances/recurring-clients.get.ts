import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreAdminClientPayload {
  id?: number
  name?: string
  status?: string
  monthlyPaymentAmount?: number
  paymentDueDay?: string
  billingMode?: string
  stores?: Array<Record<string, unknown>>
}

interface CoreAdminClientsListPayload {
	items?: CoreAdminClientPayload[]
}

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

function isActiveClientStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'active' || normalized === 'trialing'
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 0
  }

  const candidate = 'statusCode' in error
    ? (error as { statusCode?: unknown }).statusCode
    : 'status' in error
      ? (error as { status?: unknown }).status
      : 0

  const statusCode = Number(candidate)
  return Number.isFinite(statusCode) ? statusCode : 0
}

function shouldFallbackToClientsList(error: unknown) {
  const statusCode = getErrorStatusCode(error)
  return statusCode === 404 || statusCode === 405
}

function resolveMonthlyPaymentAmount(client: CoreAdminClientPayload) {
  const billingMode = String(client.billingMode || 'single') === 'per_store' ? 'per_store' : 'single'
  if (billingMode !== 'per_store') {
    return Number(client.monthlyPaymentAmount || 0)
  }

  const stores = Array.isArray(client.stores) ? client.stores : []
  return Number(stores.reduce((sum, store) => sum + Number((store as Record<string, unknown>).amount || 0), 0).toFixed(2))
}

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const requestedClientId = parseClientId(query.clientId)
  const limit = parseLimit(query.limit)
  const scopedClientId = requestedClientId > 0
    ? (access.isAdmin ? requestedClientId : access.clientId)
    : access.clientId

  if (scopedClientId > 0) {
  try {
    const client = await coreAdminFetch<CoreAdminClientPayload>(event, `/core/admin/clients/${scopedClientId}`)
    const monthlyPaymentAmount = resolveMonthlyPaymentAmount(client)

    return {
    status: 'success' as const,
    data: isActiveClientStatus(client.status) && monthlyPaymentAmount > 0
      ? [{
      id: Number(client.id),
      name: String(client.name || `Cliente #${client.id}`),
      monthlyPaymentAmount,
      paymentDueDay: String(client.paymentDueDay || '')
      }]
      : []
    }
  } catch (error) {
    if (!shouldFallbackToClientsList(error)) {
    throw error
    }
  }
  }

  const response = await coreAdminFetch<CoreAdminClientsListPayload>(
    event,
    `/core/admin/clients${buildCoreQuery({
      page: 1,
      limit,
      status: 'active'
    })}`
  )

  const items = Array.isArray(response.items) ? response.items : []

  return {
    status: 'success' as const,
    data: items
      .filter(client => isActiveClientStatus(client.status))
      .map(client => ({
        id: Number(client.id),
        name: String(client.name || `Cliente #${client.id}`),
        monthlyPaymentAmount: resolveMonthlyPaymentAmount(client),
        paymentDueDay: String(client.paymentDueDay || '')
      }))
      .filter(client => Number(client.monthlyPaymentAmount || 0) > 0)
  }
})
