import { createError, getRequestURL, getRouterParam, sendRedirect } from 'h3'
import { resolveShortLinkBySlug } from '~~/server/utils/short-links-repository'

export default defineEventHandler((event) => {
  const slugRaw = getRouterParam(event, 'slug')
  const requestUrl = getRequestURL(event)

  const resolved = resolveShortLinkBySlug(String(slugRaw ?? ''), requestUrl.origin)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Link curto nao encontrado.' })
  }

  return sendRedirect(event, resolved.targetUrl, 302)
})
