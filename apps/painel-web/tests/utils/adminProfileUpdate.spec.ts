import { describe, expect, it } from 'vitest'

import {
  extractProfileUpdateErrorStatusCode,
  isProfileEmailAlreadyInUseError,
  resolveProfilePatchErrorMessage
} from '../../server/utils/admin-profile-update'

describe('admin-profile-update', () => {
  it('detecta conflito de email por codigo estruturado do backend', () => {
    const error = {
      statusCode: 409,
      data: {
        error: 'email_already_in_use',
        message: 'Email ja esta em uso por outra conta.'
      }
    }

    expect(extractProfileUpdateErrorStatusCode(error)).toBe(409)
    expect(isProfileEmailAlreadyInUseError(error)).toBe(true)
  })

  it('detecta conflito de email por mensagem legada do upstream', () => {
    expect(isProfileEmailAlreadyInUseError({
      statusCode: 500,
      data: {
        message: 'duplicate key value violates unique constraint "users_email_key"'
      }
    })).toBe(true)
  })

  it('resolve mensagem amigavel para email duplicado', () => {
    expect(resolveProfilePatchErrorMessage('email', {
      statusCode: 409,
      data: {
        error: 'email_already_in_use',
        message: 'email already in use'
      }
    }, 'Falha ao atualizar perfil.')).toBe('Email ja esta em uso por outra conta.')
  })

  it('resolve mensagem amigavel para email invalido', () => {
    expect(resolveProfilePatchErrorMessage('email', {
      statusCode: 400,
      statusMessage: 'failed to update profile'
    }, 'Falha ao atualizar perfil.')).toBe('Email invalido.')
  })
})
