import { getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedTenantScope } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreAdminClientPayload {
  coreTenantId?: string
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

function normalizeStoreId(value: unknown, index: number) {
  const normalized = String(value ?? '').trim()
  return normalized || `store-${index + 1}`
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

function normalizeRecurringClient(client: CoreAdminClientPayload) {
  const stores = Array.isArray(client.stores)
    ? client.stores
      .map((store, index) => {
        const entry = store as Record<string, unknown>
        return {
          id: normalizeStoreId(entry.id, index),
          name: String(entry.name || '').trim(),
          amount: Number(entry.amount || 0)
        }
      })
      .filter(store => store.name)
    : []
  const billingMode = String(client.billingMode || 'single') === 'per_store' ? 'per_store' : 'single'
  const monthlyPaymentAmount = billingMode === 'per_store'
    ? Number(stores.reduce((sum, store) => sum + Number(store.amount || 0), 0).toFixed(2))
    : Number(client.monthlyPaymentAmount || 0)

  return {
    id: String(client.coreTenantId || '').trim(),
    coreTenantId: String(client.coreTenantId || '').trim(),
    name: String(client.name || 'Cliente sem nome').trim(),
    monthlyPaymentAmount,
    paymentDueDay: String(client.paymentDueDay || ''),
    billingMode,
    stores
  }
}

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')
  const query = getQuery(event)

  const scope = resolveOwnedTenantScope(access, {
    clientId: query.clientId,
    coreTenantId: query.coreTenantId
  })
  const limit = parseLimit(query.limit)

  if (scope.coreTenantId) {
  try {
    const client = await coreAdminFetch<CoreAdminClientPayload>(event, `/core/admin/clients/${encodeURIComponent(scope.coreTenantId)}`)
    const normalized = normalizeRecurringClient(client)

    return {
    status: 'success' as const,
    data: isActiveClientStatus(client.status) && Number(normalized.monthlyPaymentAmount || 0) > 0
      ? [{
        ...normalized,
        id: normalized.coreTenantId || scope.coreTenantId,
        coreTenantId: normalized.coreTenantId || scope.coreTenantId
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
      .filter(client => String(client.coreTenantId || '').trim())
      .filter(client => isActiveClientStatus(client.status))
      .map(normalizeRecurringClient)
      .filter(client => Number(client.monthlyPaymentAmount || 0) > 0)
  }
})
