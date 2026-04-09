import { createError, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createQrCode } from '~~/server/utils/qrcodes-repository'

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/qr-code')
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

  const slug = String(body?.slug ?? '').trim()
  const targetUrl = String(body?.targetUrl ?? '').trim()

  const effectiveClientId = resolveOwnedClientId(access, body?.clientId)

  if (!targetUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Informe a URL de destino.' })
  }

  const created = await createQrCode({
    slug,
    targetUrl,
    fillColor: body?.fillColor,
    backColor: body?.backColor,
    size: body?.size,
    isActive: Boolean(body?.isActive ?? true),
    clientId: effectiveClientId,
    clientName: String(body?.clientName ?? '')
  })

  return {
    status: 'success',
    data: created
  }
})

