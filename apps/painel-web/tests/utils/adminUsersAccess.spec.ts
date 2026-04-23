import { describe, expect, it } from 'vitest'

import { normalizeCreateUserPayloadForScope } from '../../server/utils/admin-users-access'
import type { AccessContext } from '../../server/utils/access-context'

function buildAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
	return {
		isAuthenticated: true,
		isPlatformAdmin: false,
		isSuperRoot: false,
		profileId: 10,
		coreUserId: 'user-1',
		email: 'admin@tenant.local',
		tenantId: 'tenant-1',
		userType: 'client',
		userLevel: 'admin',
		profileUserType: 'client',
		profileUserLevel: 'admin',
		clientId: 22,
		profileClientId: 22,
		preferences: '{}',
		profileModuleCodes: ['core_panel'],
		atendimentoAccess: false,
		isAdmin: false,
		isClient: true,
		canManageUsers: true,
		canCrossClientAccess: false,
		...overrides
	}
}

describe('normalizeCreateUserPayloadForScope', () => {
	it('preserva owner admin para admin de tenant sem rebaixar userType', () => {
		const access = buildAccessContext()

		const result = normalizeCreateUserPayloadForScope(access, {
			clientId: 999,
			level: 'admin',
			userType: 'admin',
			businessRole: 'owner',
			isPlatformAdmin: true
		})

		expect(result).toMatchObject({
			clientId: 22,
			level: 'admin',
			userType: 'admin',
			businessRole: 'owner',
			isPlatformAdmin: false
		})
	})

	it('mantem comportamento de root ao criar platform admin', () => {
		const access = buildAccessContext({
			isPlatformAdmin: true,
			isSuperRoot: true,
			userType: 'admin',
			profileUserType: 'admin',
			canCrossClientAccess: true,
			isAdmin: true,
			isClient: false,
			clientId: 0,
			profileClientId: 0
		})

		const result = normalizeCreateUserPayloadForScope(access, {
			clientId: 44,
			level: 'marketing',
			userType: 'client',
			businessRole: 'marketing',
			isPlatformAdmin: true
		})

		expect(result).toMatchObject({
			clientId: null,
			level: 'admin',
			userType: 'admin',
			isPlatformAdmin: true
		})
	})
})