import { createError, getRouterParam } from 'h3'
import { requireFeatureAccess } from '~~/server/utils/admin-route-auth'
import { deleteQaItemById } from '~~/server/utils/qa-repository'

export default defineEventHandler(async (event) => {
  await requireFeatureAccess(event, '/admin/manage/qa')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'QA id invalido.' })
  }

  const deleted = deleteQaItemById(id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Item de QA nao encontrado.' })
  }

  return {
    status: 'success'
  }
})

