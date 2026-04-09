import { createError, readBody, type H3Event } from 'h3'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'
import { resolveAdminProfile } from '~~/server/utils/admin-profile'
import { fetchInternalUpstream, resolveInternalTargetUrl } from '~~/server/utils/internal-upstream'
import {
  extractProfileUpdateErrorStatusCode,
  isProfileEmailAlreadyInUseError,
  resolveProfilePatchErrorMessage
} from '~~/server/utils/admin-profile-update'
import { enforceRateLimit, resolveRateLimitClientKey } from '~~/server/utils/rate-limit'

interface ProfileUpdatePayload {
  name?: unknown
  nick?: unknown
  email?: unknown
  phone?: unknown
  profileImage?: unknown
  preferences?: unknown
  currentPassword?: unknown
  newPassword?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function hasOwn(source: ProfileUpdatePayload, key: keyof ProfileUpdatePayload) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function normalizePreferencesPayload(value: unknown) {
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return '{}'
    try {
      const parsed = JSON.parse(raw)
      return JSON.stringify(parsed)
    } catch {
      return '{}'
    }
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '{}'
    }
  }

  return '{}'
}

async function verifyCurrentPassword(
  event: H3Event,
  options: { email: string, currentPassword: string, tenantId?: string }
) {
  const config = useRuntimeConfig(event)
  const base = String(config.coreApiInternalBase ?? '').replace(/\/+$/, '')
  if (!base) {
    throw createError({ statusCode: 500, statusMessage: 'CORE API internal base nao configurada.' })
  }

  const payload: Record<string, string> = {
    email: options.email,
    password: options.currentPassword
  }

  if (options.tenantId) {
    payload.tenantId = options.tenantId
  }

  let response: Response
  try {
    response = await fetchInternalUpstream({
      event,
      targetUrl: resolveInternalTargetUrl(base, '/core/auth/login'),
      fetchInit: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      },
      statusMessage: 'Falha ao validar senha atual no core.',
      fallbackMessage: 'Erro de rede ao validar senha atual no core'
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Falha ao validar senha atual no core.' })
  }

  if (!response.ok) {
    throw createError({ statusCode: 401, statusMessage: 'Senha atual invalida.' })
  }
}

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, {
    scope: 'admin.profile.patch',
    key: resolveRateLimitClientKey(event),
    max: 12,
    windowMs: 10 * 60_000,
    blockMs: 20 * 60_000,
    message: 'Muitas alteracoes de perfil em pouco tempo. Aguarde antes de tentar novamente.'
  })

  const payload = await readBody<ProfileUpdatePayload>(event)
  const current = await resolveAdminProfile(event)

  const patchQueue: Array<{ field: string, value: string }> = []

  if (hasOwn(payload, 'name')) {
    const next = normalizeText(payload.name)
    if (!next) {
      throw createError({ statusCode: 400, statusMessage: 'Nome invalido.' })
    }
    if (next !== current.name) {
      patchQueue.push({ field: 'name', value: next })
    }
  }

  if (hasOwn(payload, 'nick')) {
    const next = normalizeText(payload.nick)
    if (next !== current.nick) {
      patchQueue.push({ field: 'nick', value: next })
    }
  }

  if (hasOwn(payload, 'email')) {
    const next = normalizeText(payload.email).toLowerCase()
    if (!next || !next.includes('@')) {
      throw createError({ statusCode: 400, statusMessage: 'Email invalido.' })
    }
    if (next !== current.email.toLowerCase()) {
      patchQueue.push({ field: 'email', value: next })
    }
  }

  if (hasOwn(payload, 'phone')) {
    const next = normalizeText(payload.phone)
    if (next !== current.phone) {
      patchQueue.push({ field: 'phone', value: next })
    }
  }

  if (hasOwn(payload, 'profileImage')) {
    const next = normalizeText(payload.profileImage)
    if (next !== current.profileImage) {
      patchQueue.push({ field: 'profileImage', value: next })
    }
  }

  if (hasOwn(payload, 'preferences')) {
    const next = normalizePreferencesPayload(payload.preferences)
    const currentPreferences = normalizePreferencesPayload(current.preferences)
    if (next !== currentPreferences) {
      patchQueue.push({ field: 'preferences', value: next })
    }
  }

  const newPassword = normalizeText(payload.newPassword)
  if (newPassword) {
    const currentPassword = normalizeText(payload.currentPassword)
    if (!currentPassword) {
      throw createError({ statusCode: 400, statusMessage: 'Informe a senha atual para alterar a senha.' })
    }
    if (newPassword.length < 6) {
      throw createError({ statusCode: 400, statusMessage: 'Nova senha precisa ter no minimo 6 caracteres.' })
    }

    await verifyCurrentPassword(event, {
      email: current.email,
      currentPassword,
      tenantId: current.tenantId
    })

    patchQueue.push({ field: 'password', value: newPassword })
  }

  if (patchQueue.length < 1) {
    return {
      status: 'success',
      data: current
    }
  }

  for (const patch of patchQueue) {
    try {
      await coreAdminFetch(
        event,
        '/core/auth/profile',
        {
          method: 'PATCH',
          body: {
            field: patch.field,
            value: patch.value
          }
        }
      )
    } catch (error) {
      const statusCode = extractProfileUpdateErrorStatusCode(error)

      if (patch.field === 'email' && isProfileEmailAlreadyInUseError(error)) {
        throw createError({ statusCode: 409, statusMessage: 'Email ja esta em uso por outra conta.' })
      }

      throw createError({
        statusCode: statusCode > 0 ? statusCode : 500,
        statusMessage: resolveProfilePatchErrorMessage(patch.field, error, 'Falha ao atualizar perfil.')
      })
    }
  }

  delete (event.context as Record<string, unknown>).adminProfile
  delete (event.context as Record<string, unknown>).adminProfileError
  const updated = await resolveAdminProfile(event)
  return {
    status: 'success',
    data: updated
  }
})
