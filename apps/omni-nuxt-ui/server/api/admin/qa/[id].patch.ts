import { createError, getRouterParam, readBody } from 'h3'
import { requireFeatureAccess } from '~~/server/utils/admin-route-auth'
import { updateQaItemField } from '~~/server/utils/qa-repository'

const allowedFields = new Set([
  'block',
  'sprint',
  'squad',
  'feature',
  'status',
  'priority',
  'source',
  'owner',
  'targetPage',
  'effort',
  'notes'
])

export default defineEventHandler(async (event) => {
  await requireFeatureAccess(event, '/admin/manage/qa')

  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'QA id invalido.' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const field = String(body?.field ?? '').trim()
  if (!field || !allowedFields.has(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Campo invalido para atualizacao.' })
  }

  const updated = updateQaItemField(id, field, body?.value)
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Item de QA nao encontrado.' })
  }

  return {
    status: 'success',
    data: updated
  }
})

