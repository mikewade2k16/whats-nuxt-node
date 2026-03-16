import { readBody, setResponseStatus } from 'h3'
import { requireFeatureAccess } from '~~/server/utils/admin-route-auth'
import { createQaItem } from '~~/server/utils/qa-repository'

export default defineEventHandler(async (event) => {
  await requireFeatureAccess(event, '/admin/manage/qa')

  const body = await readBody<Record<string, unknown>>(event)

  const created = createQaItem({
    block: body?.block,
    sprint: body?.sprint,
    squad: body?.squad,
    feature: body?.feature,
    status: body?.status,
    priority: body?.priority,
    source: body?.source,
    owner: body?.owner,
    targetPage: body?.targetPage,
    effort: body?.effort,
    notes: body?.notes
  })

  setResponseStatus(event, 201)

  return {
    status: 'success',
    data: created
  }
})

