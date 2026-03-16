import { readBody, setResponseStatus } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/manage/clientes')

  const body = await readBody<{
    name?: string
    status?: string
    adminName?: string
    adminEmail?: string
    adminPassword?: string
  }>(event)

  const created = await coreAdminFetch(
    event,
    '/core/admin/clients',
    {
      method: 'POST',
      body: {
        name: body?.name,
        status: body?.status,
        adminName: body?.adminName,
        adminEmail: body?.adminEmail,
        adminPassword: body?.adminPassword
      }
    }
  )

  setResponseStatus(event, 201)

  return {
    status: 'success',
    data: created
  }
})

