import { getRouterParam } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { AdminSessionRevocationData } from '~/types/admin-session'

export default defineEventHandler(async (event) => {
	await requireTenantAdmin(event, '/admin/settings')

	const sessionId = String(getRouterParam(event, 'sessionId') ?? '').trim()

	const response = await coreAdminFetch<{ result: AdminSessionRevocationData }>(
		event,
		`/core/admin/auth-sessions/${encodeURIComponent(sessionId)}`,
		{
			method: 'DELETE'
		}
	)

	return {
		status: 'success' as const,
		data: response.result
	}
})