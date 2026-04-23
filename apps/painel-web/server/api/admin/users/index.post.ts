import { readBody, setResponseStatus } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { normalizeCreateUserPayloadForScope } from '~~/server/utils/admin-users-access'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  const access = await requireTenantAdmin(event, '/admin/manage/users')
  const body = await readBody<Record<string, unknown>>(event)
  const normalizedBody = normalizeCreateUserPayloadForScope(access, body ?? {})

  const created = await coreAdminFetch(
    event,
    '/core/admin/users',
    {
      method: 'POST',
      body: {
        name: normalizedBody.name as string,
        nick: normalizedBody.nick as string,
        email: normalizedBody.email as string,
        password: normalizedBody.password as string,
        phone: normalizedBody.phone as string,
    		coreTenantId: normalizedBody.coreTenantId as string | null,
        level: normalizedBody.level as string,
        userType: normalizedBody.userType as string,
        businessRole: normalizedBody.businessRole as string,
        storeId: normalizedBody.storeId as string | null,
        registrationNumber: normalizedBody.registrationNumber as string,
        isPlatformAdmin: Boolean(normalizedBody.isPlatformAdmin)
      }
    }
  )

  setResponseStatus(event, 201)

  return {
    status: 'success',
    data: created
  }
})

