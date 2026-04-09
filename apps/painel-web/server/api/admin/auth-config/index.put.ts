import { createError, readBody } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { AdminSessionConfigData } from '~/types/admin-session'

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/settings')

  const body = await readBody<{ ttlMinutes?: unknown }>(event)
  const ttlMinutes = Number.parseInt(String(body?.ttlMinutes ?? ''), 10)
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe um tempo de sessao valido em minutos.'
    })
  }

  const response = await coreAdminFetch<{ config: AdminSessionConfigData }>(
    event,
    '/core/admin/auth-config',
    {
      method: 'PUT',
      body: {
        ttlMinutes
      }
    }
  )

  return {
    status: 'success' as const,
    data: response.config
  }
})