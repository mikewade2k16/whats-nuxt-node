export interface AdminProfileFormSnapshot {
  name?: unknown
  nick?: unknown
  email?: unknown
  phone?: unknown
  profileImage?: unknown
}

export interface AdminProfileFormInput extends AdminProfileFormSnapshot {
  currentPassword?: unknown
  newPassword?: unknown
  confirmPassword?: unknown
}

export interface ProfileUpdateRequest {
  nick?: string
  name?: string
  email?: string
  phone?: string
  profileImage?: string
  currentPassword?: string
  newPassword?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pushUnique(values: string[], value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized || values.includes(normalized)) {
    return
  }

  values.push(normalized)
}

function collectErrorMessages(value: unknown, bucket: string[], seen: Set<object>, depth = 0) {
  if (!value || depth > 4 || !isPlainObject(value)) {
    return
  }

  if (seen.has(value)) {
    return
  }

  seen.add(value)

  pushUnique(bucket, value.statusMessage)
  pushUnique(bucket, value.message)

  collectErrorMessages(value.data, bucket, seen, depth + 1)
  collectErrorMessages(value.cause, bucket, seen, depth + 1)
  collectErrorMessages(value.response, bucket, seen, depth + 1)
}

function collectErrorCodes(value: unknown, bucket: string[], seen: Set<object>, depth = 0) {
  if (!value || depth > 4 || !isPlainObject(value)) {
    return
  }

  if (seen.has(value)) {
    return
  }

  seen.add(value)

  pushUnique(bucket, value.error)
  pushUnique(bucket, value.code)

  collectErrorCodes(value.data, bucket, seen, depth + 1)
  collectErrorCodes(value.cause, bucket, seen, depth + 1)
  collectErrorCodes(value.response, bucket, seen, depth + 1)
}

function isGenericProfileErrorMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase()
  return normalized === 'failed to update profile'
    || normalized === 'falha ao salvar perfil.'
    || normalized === 'falha ao atualizar perfil.'
    || normalized === 'falha ao salvar perfil'
    || normalized === 'falha ao atualizar perfil'
    || normalized === 'falha no backend core.'
}

function isEmailConflictMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase()
  return normalized.includes('email already in use')
    || normalized.includes('email ja esta em uso')
    || normalized.includes('users_email_key')
    || normalized.includes('duplicate key value')
}

export function buildProfileUpdateRequest(
  snapshot: AdminProfileFormSnapshot | null | undefined,
  form: AdminProfileFormInput
): ProfileUpdateRequest {
  if (!snapshot) {
    return {}
  }

  const nextName = normalizeText(form.name)
  const nextNick = normalizeText(form.nick)
  const rawEmail = normalizeText(form.email)
  const nextEmail = normalizeEmail(form.email)
  const nextPhone = normalizeText(form.phone)
  const nextProfileImage = normalizeText(form.profileImage)
  const nextCurrentPassword = normalizeText(form.currentPassword)
  const nextNewPassword = normalizeText(form.newPassword)

  const payload: ProfileUpdateRequest = {}

  if (nextName !== normalizeText(snapshot.name)) {
    payload.name = nextName
  }

  if (nextNick !== normalizeText(snapshot.nick)) {
    payload.nick = nextNick
  }

  // Campo de email vazio significa "nao alterar email" nesse formulario.
  if (rawEmail && nextEmail !== normalizeEmail(snapshot.email)) {
    payload.email = nextEmail
  }

  if (nextPhone !== normalizeText(snapshot.phone)) {
    payload.phone = nextPhone
  }

  if (nextProfileImage !== normalizeText(snapshot.profileImage)) {
    payload.profileImage = nextProfileImage
  }

  if (nextNewPassword) {
    payload.currentPassword = nextCurrentPassword
    payload.newPassword = nextNewPassword
  }

  return payload
}

export function validateProfileFormInput(
  snapshot: AdminProfileFormSnapshot | null | undefined,
  form: AdminProfileFormInput
) {
  const payload = buildProfileUpdateRequest(snapshot, form)

  if (Object.prototype.hasOwnProperty.call(payload, 'name') && !normalizeText(payload.name)) {
    return 'Nome invalido.'
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    const email = normalizeEmail(payload.email)
    if (!email || !email.includes('@')) {
      return 'Email invalido.'
    }
  }

  const nextNewPassword = normalizeText(form.newPassword)
  const nextConfirmPassword = normalizeText(form.confirmPassword)
  if (nextNewPassword || nextConfirmPassword) {
    if (!normalizeText(form.currentPassword)) {
      return 'Informe a senha atual para trocar a senha.'
    }
    if (nextNewPassword.length < 6) {
      return 'Nova senha precisa ter no minimo 6 caracteres.'
    }
    if (nextNewPassword !== nextConfirmPassword) {
      return 'Confirmacao de senha nao confere.'
    }
  }

  return ''
}

export function resolveProfileRequestErrorMessage(error: unknown, fallback: string) {
  const codes: string[] = []
  const messages: string[] = []

  if (error instanceof Error) {
    pushUnique(messages, error.message)
  }

  collectErrorCodes(error, codes, new Set<object>())
  collectErrorMessages(error, messages, new Set<object>())

  const normalizedCodes = codes.map((entry) => entry.toLowerCase())
  if (normalizedCodes.includes('email_already_in_use') || messages.some(isEmailConflictMessage)) {
    return 'Email ja esta em uso por outra conta.'
  }

  const specificMessage = messages.find((entry) => !isGenericProfileErrorMessage(entry))
  if (specificMessage) {
    return specificMessage
  }

  return normalizeText(fallback) || 'Falha ao salvar perfil.'
}
