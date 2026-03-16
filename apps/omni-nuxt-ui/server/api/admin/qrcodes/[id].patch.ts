import { createError, getRouterParam, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { updateQrCodeById } from '~~/server/utils/qrcodes-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/qr-code')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Id de QR invalido.' })
  }

  const body = await readBody<{
    slug?: string
    targetUrl?: string
    fillColor?: string
    backColor?: string
    size?: number
    isActive?: boolean
    clientId?: number
    clientName?: string
  }>(event)

  const bodyHasClientId = Object.prototype.hasOwnProperty.call(body || {}, 'clientId')
  const requestedClientId = bodyHasClientId
    ? resolveOwnedClientId(access, body?.clientId)
    : undefined

  const updated = await updateQrCodeById(id, {
    slug: Object.prototype.hasOwnProperty.call(body || {}, 'slug') ? body?.slug : undefined,
    targetUrl: Object.prototype.hasOwnProperty.call(body || {}, 'targetUrl') ? body?.targetUrl : undefined,
    fillColor: Object.prototype.hasOwnProperty.call(body || {}, 'fillColor') ? body?.fillColor : undefined,
    backColor: Object.prototype.hasOwnProperty.call(body || {}, 'backColor') ? body?.backColor : undefined,
    size: Object.prototype.hasOwnProperty.call(body || {}, 'size') ? body?.size : undefined,
    isActive: Object.prototype.hasOwnProperty.call(body || {}, 'isActive') ? body?.isActive : undefined,
    clientId: requestedClientId,
    clientName: Object.prototype.hasOwnProperty.call(body || {}, 'clientName') ? body?.clientName : undefined
  }, {
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'QR Code nao encontrado.' })
  }

  return {
    status: 'success',
    data: updated
  }
})

