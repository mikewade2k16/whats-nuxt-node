import { buildAdminProfileSummary, resolveAdminProfile } from '~~/server/utils/admin-profile'

export default defineEventHandler(async (event) => {
  const profile = await resolveAdminProfile(event)
  return {
    status: 'success',
    data: buildAdminProfileSummary(profile)
  }
})