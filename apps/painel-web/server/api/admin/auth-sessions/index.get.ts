import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { AdminActiveSessionUserData } from '~/types/admin-session'

export default defineEventHandler(async (event) => {
	await requireTenantAdmin(event, '/admin/settings')

	const response = await coreAdminFetch<{ sessions: AdminActiveSessionUserData[] }>(
		event,
		'/core/admin/auth-sessions'
	)

	return {
		status: 'success' as const,
		data: response.sessions || []
	}
})