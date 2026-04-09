import { describe, expect, it } from 'vitest'

import { isPublicAdminPath, resolveAccessibleAdminRedirect, type AdminAccessContext } from '~/utils/admin-access'

function buildContext(overrides: Partial<AdminAccessContext> = {}): AdminAccessContext {
  return {
    isAuthenticated: true,
    isRootUser: false,
    profileUserType: 'admin',
    profileUserLevel: 'admin',
    sessionUserType: 'admin',
    sessionUserLevel: 'admin',
    preferences: '{}',
    hasModule: () => false,
    ...overrides
  }
}

describe('resolveAccessibleAdminRedirect', () => {
  it('prioriza fila-atendimento como landing padrao quando o modulo esta disponivel', () => {
    const target = resolveAccessibleAdminRedirect('/admin', buildContext({
      hasModule: (moduleCode) => moduleCode === 'fila-atendimento'
    }))

    expect(target).toBe('/admin/fila-atendimento')
  })

  it('mantem o redirect solicitado quando a rota e permitida', () => {
    const target = resolveAccessibleAdminRedirect('/admin/manage/users', buildContext())

    expect(target).toBe('/admin/manage/users')
  })

  it('faz fallback para a primeira rota acessivel quando a solicitada nao e permitida', () => {
    const target = resolveAccessibleAdminRedirect('/admin/finance', buildContext({
      profileUserLevel: 'marketing',
      sessionUserLevel: 'marketing',
      hasModule: () => false
    }))

    expect(target).toBe('/admin/profile')
  })

  it('ignora redirects inseguros e usa a landing acessivel', () => {
    const target = resolveAccessibleAdminRedirect('/admin/login?redirect=/admin/manage/users', buildContext())

    expect(target).toBe('/admin/profile')
  })

  it('nao aceita a rota publica de recuperacao como destino pos-login', () => {
    const target = resolveAccessibleAdminRedirect('/admin/recuperar-senha', buildContext())

    expect(target).toBe('/admin/profile')
  })
})

describe('isPublicAdminPath', () => {
  it('reconhece login e recuperacao como rotas publicas', () => {
    expect(isPublicAdminPath('/admin/login')).toBe(true)
    expect(isPublicAdminPath('/admin/recuperar-senha')).toBe(true)
    expect(isPublicAdminPath('/admin')).toBe(false)
  })
})
