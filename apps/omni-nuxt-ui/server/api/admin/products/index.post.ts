import { createError, readBody, setResponseStatus } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createProduct } from '~~/server/utils/products-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/site/produtos')
  const body = await readBody<{ name?: string, code?: string, image?: string, clientId?: string | number, clientName?: string }>(event)
  const effectiveClientId = resolveOwnedClientId(access, body?.clientId)

  const created = createProduct({
    name: body?.name,
    code: body?.code,
    image: body?.image,
    clientId: effectiveClientId,
    clientName: body?.clientName
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  setResponseStatus(event, 201)

  return {
    status: 'success',
    data: created
  }
})

