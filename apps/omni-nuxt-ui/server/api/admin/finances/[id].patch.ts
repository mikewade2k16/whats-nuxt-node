import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { updateFinanceSheetById } from '~~/server/utils/finances-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/finance')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id da planilha invalido.' })
  }

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

  const hasClientIdPatch = Object.prototype.hasOwnProperty.call(body ?? {}, 'clientId')
  const resolvedClientId = hasClientIdPatch
    ? resolveOwnedClientId(access, body?.clientId)
    : undefined

  const updated = updateFinanceSheetById(id, {
    title: body?.title,
    period: body?.period,
    status: body?.status,
    notes: body?.notes,
    entradas: body?.entradas,
    saidas: body?.saidas,
    clientId: resolvedClientId,
    clientName: body?.clientName
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Planilha nao encontrada.' })
  }

  return {
    status: 'success',
    data: updated
  }
})

