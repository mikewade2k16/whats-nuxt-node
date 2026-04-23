import { describe, expect, it } from 'vitest'
import { createFilaAtendimentoShellBridgeToken } from '../../modules/fila-atendimento/server/utils/fila-atendimento-shell-bridge'

function decodeBridgePayload(token: string) {
  const [, encodedPayload] = String(token || '').split('.')
  return JSON.parse(Buffer.from(encodedPayload || '', 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('createFilaAtendimentoShellBridgeToken', () => {
  it('remove tenant e client quando o escopo e platform', () => {
    const token = createFilaAtendimentoShellBridgeToken({
      secret: 'test-secret',
      access: {
        coreUserId: 'root-user',
        email: 'root@example.com',
        userType: 'admin',
        userLevel: 'admin',
        tenantId: 'tenant-from-shell',
        clientId: 123,
        isPlatformAdmin: true,
        profileModuleCodes: ['fila-atendimento']
      } as any,
      profile: {
        coreUserId: 'root-user',
        name: 'Root',
        nick: 'Root',
        email: 'root@example.com',
        businessRole: 'system_admin',
        userType: 'admin',
        level: 'admin',
        tenantId: 'tenant-from-profile',
        clientId: 123
      } as any,
      scope: {
        coreTenantId: 'tenant-target',
        tenantSlug: 'tenant-target',
        tenantName: 'Tenant Target',
        scopeMode: 'platform',
        storeIds: []
      }
    })

    const payload = decodeBridgePayload(token)

    expect(payload.scopeMode).toBe('platform')
    expect(payload.tenantId).toBe('')
    expect(payload.tenantSlug).toBe('')
    expect(payload.tenantName).toBe('')
    expect(payload.clientId).toBeNull()
  })

  it('mantem tenant e client quando o escopo e tenant-scoped', () => {
    const token = createFilaAtendimentoShellBridgeToken({
      secret: 'test-secret',
      access: {
        coreUserId: 'owner-user',
        email: 'owner@example.com',
        userType: 'admin',
        userLevel: 'admin',
        tenantId: 'tenant-target',
        clientId: 456,
        isPlatformAdmin: false,
        profileModuleCodes: ['fila-atendimento']
      } as any,
      profile: {
        coreUserId: 'owner-user',
        name: 'Owner',
        nick: 'Owner',
        email: 'owner@example.com',
        businessRole: 'owner',
        userType: 'admin',
        level: 'admin',
        tenantId: 'tenant-target',
        clientId: 456
      } as any,
      scope: {
        coreTenantId: 'tenant-target',
        tenantSlug: 'tenant-target',
        tenantName: 'Tenant Target',
        scopeMode: 'all_stores',
        storeIds: ['store-1']
      }
    })

    const payload = decodeBridgePayload(token)

    expect(payload.scopeMode).toBe('all_stores')
    expect(payload.tenantId).toBe('tenant-target')
    expect(payload.tenantSlug).toBe('tenant-target')
    expect(payload.tenantName).toBe('Tenant Target')
    expect(payload.clientId).toBe(456)
  })
})