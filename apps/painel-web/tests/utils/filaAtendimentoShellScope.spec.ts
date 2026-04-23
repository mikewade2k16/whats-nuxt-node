import { describe, expect, it } from 'vitest'
import { isFilaAtendimentoPlatformShellScope } from '../../modules/fila-atendimento/server/utils/fila-atendimento-shell-scope'

describe('isFilaAtendimentoPlatformShellScope', () => {
  it('mantem super-root admin/admin em escopo platform mesmo com shell simulando cliente', () => {
    expect(isFilaAtendimentoPlatformShellScope({
      isSuperRoot: true,
      userType: 'admin',
      userLevel: 'admin'
    })).toBe(true)
  })

  it('nao promove super-root rebaixado para manager', () => {
    expect(isFilaAtendimentoPlatformShellScope({
      isSuperRoot: true,
      userType: 'admin',
      userLevel: 'manager'
    })).toBe(false)
  })

  it('nao promove admin de tenant comum para escopo platform', () => {
    expect(isFilaAtendimentoPlatformShellScope({
      isSuperRoot: false,
      userType: 'admin',
      userLevel: 'admin'
    })).toBe(false)
  })
})