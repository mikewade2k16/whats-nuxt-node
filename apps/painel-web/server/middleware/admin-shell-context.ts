import { defineEventHandler, getRequestURL } from 'h3'
import { resolveAccessContextOrThrow } from '~~/server/utils/access-context'
import { normalizeCoreAuthorizationHeader } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const requestPath = getRequestURL(event).pathname
  if (!requestPath.startsWith('/api/admin/')) {
    return
  }

  const authorization = normalizeCoreAuthorizationHeader(event)
  if (!authorization) {
    return
  }

  try {
    await resolveAccessContextOrThrow(event)
  } catch {
    // Handlers protected by the shell decide whether missing/invalid auth becomes
    // login-required or a transport/upstream error.
  }
})