import { readBody } from 'h3'
import { requireTenantAdmin } from '~~/server/utils/admin-route-auth'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import type { AdminSessionRevocationData } from '~/types/admin-session'

export default defineEventHandler(async (event) => {
	await requireTenantAdmin(event, '/admin/settings')

	const body = await readBody<{ userId?: unknown }>(event)
	const userId = String(body?.userId ?? '').trim()

	const response = await coreAdminFetch<{ result: AdminSessionRevocationData }>(
		event,
		'/core/admin/auth-sessions/revoke-user',
		{
			method: 'POST',
			body: {
				userId
			}
		}
	)

	return {
		status: 'success' as const,
		data: response.result
	}
})