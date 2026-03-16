import { createError, getQuery } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import { listTrainingCatalogByAccess } from '~~/server/utils/training-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/team/treinamento')

  const query = getQuery(event)
  const targetClientId = Number.parseInt(String(query.clientId ?? ''), 10)
  const resolvedTargetClientId = Number.isFinite(targetClientId) ? targetClientId : 0

  const { sections, storeOptions, clientOptions, activeClientId } = listTrainingCatalogByAccess({
    viewerClientId: access.clientId,
    viewerIsAdmin: access.isAdmin,
    targetClientId: resolvedTargetClientId
  })
  const clientsResponse = await coreAdminFetch<{ items: Array<Record<string, unknown>> }>(
    event,
    `/core/admin/clients${buildCoreQuery({
      page: 1,
      limit: 300
    })}`
  )
  const availableClients = Array.isArray(clientsResponse.items) ? clientsResponse.items : []

  const allClientOptions = availableClients.map(client => ({
    value: Number(client.id),
    label: String(client.name ?? '').trim() || `Cliente #${client.id}`
  }))

  return {
    status: 'success',
    data: {
      sections,
      storeOptions,
      clientOptions: allClientOptions.length > 0 ? allClientOptions : clientOptions,
      activeClientId: access.isAdmin
        ? (resolvedTargetClientId > 0 ? resolvedTargetClientId : null)
        : activeClientId
    }
  }
})

