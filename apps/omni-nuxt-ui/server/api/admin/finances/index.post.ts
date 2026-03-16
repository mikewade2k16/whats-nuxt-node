import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createFinanceSheet } from '~~/server/utils/finances-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const body = await readBody<{
    title?: string
    period?: string
    status?: string
    notes?: string
    entradas?: unknown
    saidas?: unknown
    clientId?: number
    clientName?: string
  }>(event)

  const clientId = resolveOwnedClientId(access, body?.clientId)
  if (access.isClient && clientId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente do usuario nao identificado.' })
  }

  const created = createFinanceSheet({
    title: body?.title,
    period: body?.period,
    status: body?.status,
    notes: body?.notes,
    entradas: body?.entradas,
    saidas: body?.saidas,
    clientId,
    clientName: body?.clientName
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  return {
    status: 'success',
    data: created
  }
})

