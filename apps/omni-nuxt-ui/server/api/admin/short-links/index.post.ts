import { createError, getRequestURL, readBody } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { createShortLink } from '~~/server/utils/short-links-repository'

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const access = await requireScopedFeatureAccess(event, '/admin/tools/encurtador-link')
  const body = await readBody<{
    targetUrl?: string
    slug?: string
    clientId?: number
    clientName?: string
  }>(event)

  const targetUrl = String(body?.targetUrl ?? '').trim()
  const slug = String(body?.slug ?? '').trim()
  const clientId = resolveOwnedClientId(access, body?.clientId)
  const clientName = String(body?.clientName ?? '').trim()

  if (!targetUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Informe a URL de destino.' })
  }

  const created = createShortLink({
    targetUrl,
    slug,
    clientId,
    clientName,
    baseUrl: requestUrl.origin
  })

  return {
    status: 'success',
    data: created
  }
})

