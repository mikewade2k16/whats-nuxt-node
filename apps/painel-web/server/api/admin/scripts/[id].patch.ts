import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { updateScriptById } from '~~/server/utils/scripts-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/scripts')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id de script invalido.' })
  }

  const body = await readBody<{
    title?: string
    status?: string
    notes?: string
    rows?: unknown
    clientId?: number
    clientName?: string
  }>(event)

  const hasClientIdPatch = Object.prototype.hasOwnProperty.call(body ?? {}, 'clientId')
  const resolvedClientId = hasClientIdPatch
    ? resolveOwnedClientId(access, body?.clientId)
    : undefined

  const updated = updateScriptById(id, {
    title: body?.title,
    status: body?.status,
    notes: body?.notes,
    rows: body?.rows,
    clientId: resolvedClientId,
    clientName: body?.clientName
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Script nao encontrado.' })
  }

  return {
    status: 'success',
    data: updated
  }
})

