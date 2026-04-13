import { afterEach, describe, expect, it } from 'vitest'

import { sanitizeUpstreamPayload } from '../../server/utils/safe-error'

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
})

describe('sanitizeUpstreamPayload', () => {
  it('preserva o payload seguro de reset de senha em 503 de producao', () => {
    process.env.NODE_ENV = 'production'

    const payload = sanitizeUpstreamPayload(
      undefined as any,
      503,
      {
        error: 'password_reset_unavailable',
        message: 'A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes.'
      },
      'Falha no backend core'
    )

    expect(payload).toEqual({
      error: 'password_reset_unavailable',
      message: 'A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes.'
    })
  })

  it('continua mascarando falha 500 sem codigo seguro em producao', () => {
    process.env.NODE_ENV = 'production'

    const payload = sanitizeUpstreamPayload(
      undefined as any,
      500,
      {
        error: 'internal_error',
        message: 'smtp tls dial: connection refused'
      },
      'Falha no backend core'
    )

    expect(payload).toEqual({
      message: 'Falha no backend core'
    })
  })
})