import { describe, expect, it } from 'vitest'

import {
  buildProfileUpdateRequest,
  resolveProfileRequestErrorMessage,
  validateProfileFormInput
} from '~/utils/admin-profile-form'

describe('admin-profile-form', () => {
  it('monta payload parcial quando apenas o email mudou', () => {
    const payload = buildProfileUpdateRequest(
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: 'mike@old.com',
        phone: '11999999999',
        profileImage: 'https://old.example/avatar.png'
      },
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: 'mike@new.com',
        phone: '11999999999',
        profileImage: 'https://old.example/avatar.png',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    expect(payload).toEqual({
      email: 'mike@new.com'
    })
  })

  it('permite salvar outros campos quando o email original esta vazio e permanece vazio', () => {
    const validationMessage = validateProfileFormInput(
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: '',
        phone: '',
        profileImage: ''
      },
      {
        name: 'Mike Wade Atualizado',
        nick: 'mike',
        email: '',
        phone: '',
        profileImage: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    expect(validationMessage).toBe('')
  })

  it('ignora alteracao de email quando o campo fica vazio e salva apenas os outros campos', () => {
    const payload = buildProfileUpdateRequest(
      {
        name: 'Root',
        nick: 'Mike root',
        email: 'maykell072009@gmail.com',
        phone: '',
        profileImage: ''
      },
      {
        name: 'Root Atualizado',
        nick: 'Mike root',
        email: '',
        phone: '',
        profileImage: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    const validationMessage = validateProfileFormInput(
      {
        name: 'Root',
        nick: 'Mike root',
        email: 'maykell072009@gmail.com',
        phone: '',
        profileImage: ''
      },
      {
        name: 'Root Atualizado',
        nick: 'Mike root',
        email: '',
        phone: '',
        profileImage: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    expect(payload).toEqual({
      name: 'Root Atualizado'
    })
    expect(validationMessage).toBe('')
  })

  it('ignora email apagado no formulario e nao inclui patch de email', () => {
    const payload = buildProfileUpdateRequest(
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: 'mike@old.com',
        phone: '',
        profileImage: ''
      },
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: '',
        phone: '',
        profileImage: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    const validationMessage = validateProfileFormInput(
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: 'mike@old.com',
        phone: '',
        profileImage: ''
      },
      {
        name: 'Mike Wade',
        nick: 'mike',
        email: '',
        phone: '',
        profileImage: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    )

    expect(payload).toEqual({})
    expect(validationMessage).toBe('')
  })

  it('resolve conflito de email mesmo quando o backend envia estrutura aninhada', () => {
    const message = resolveProfileRequestErrorMessage(
      {
        statusCode: 409,
        statusMessage: 'failed to update profile',
        data: {
          message: 'failed to update profile',
          data: {
            error: 'email_already_in_use',
            message: 'email already in use'
          }
        }
      },
      'Falha ao salvar perfil.'
    )

    expect(message).toBe('Email ja esta em uso por outra conta.')
  })
})
