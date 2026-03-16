import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createScript } from '~~/server/utils/scripts-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/scripts')

  const body = await readBody<{
    title?: string
    status?: string
    notes?: string
    rows?: unknown
    clientId?: number
    clientName?: string
  }>(event)

  const clientId = resolveOwnedClientId(access, body?.clientId)

  const created = createScript({
    title: body?.title,
    status: body?.status,
    notes: body?.notes,
    rows: body?.rows,
    clientId,
    clientName: body?.clientName
  })

  return {
    status: 'success',
    data: created
  }
})

