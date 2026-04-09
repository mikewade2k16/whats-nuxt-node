import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { AdminSessionConfigData } from '~/types/admin-session'

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/settings')

  const response = await coreAdminFetch<{ config: AdminSessionConfigData }>(
    event,
    '/core/admin/auth-config'
  )

  return {
    status: 'success' as const,
    data: response.config
  }
})