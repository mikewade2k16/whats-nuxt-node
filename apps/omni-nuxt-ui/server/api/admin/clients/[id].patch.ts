import { createError, getRouterParam, readBody } from 'h3'
import { requireRootAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

const allowedFields = new Set([
  'name',
  'status',
  'billingMode',
  'monthlyPaymentAmount',
  'paymentDueDay',
  'userCount',
  'projectCount',
  'userNicks',
  'projectSegments',
  'logo',
  'webhookEnabled',
  'contactPhone',
  'contactSite',
  'contactAddress',
  'modules'
])

export default defineEventHandler(async (event) => {
  await requireRootAdmin(event, '/admin/manage/clientes')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Client id invalido.' })
  }

  const body = await readBody<Record<string, unknown>>(event)

  const field = String(body?.field ?? '').trim()
  if (!field || !allowedFields.has(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Campo invalido para atualizacao.' })
  }

  const updated = await coreAdminFetch(
    event,
    `/core/admin/clients/${id}`,
    {
      method: 'PATCH',
      body: {
        field,
        value: body?.value
      }
    }
  )

  return {
    status: 'success',
    data: updated
  }
})

