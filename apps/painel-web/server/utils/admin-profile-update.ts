function normalizeText(value: unknown) {
  return String(value ?? '').trim()
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

function isGenericProfilePatchMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase()
  return normalized === 'failed to update profile'
    || normalized === 'falha ao atualizar perfil.'
    || normalized === 'falha ao salvar perfil.'
    || normalized === 'falha ao atualizar perfil'
    || normalized === 'falha ao salvar perfil'
    || normalized === 'falha no backend core.'
}

function isEmailConflictMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase()
  return normalized.includes('email already in use')
    || normalized.includes('email ja esta em uso')
    || normalized.includes('users_email_key')
    || normalized.includes('duplicate key value')
}

export function extractProfileUpdateErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 0
  }

  const candidate = 'statusCode' in error
    ? (error as { statusCode?: unknown }).statusCode
    : 'status' in error
      ? (error as { status?: unknown }).status
      : 0

  const statusCode = Number(candidate)
  return Number.isFinite(statusCode) ? statusCode : 0
}

export function isProfileEmailAlreadyInUseError(error: unknown) {
  const codes: string[] = []
  const messages: string[] = []

  collectErrorCodes(error, codes, new Set<object>())
  collectErrorMessages(error, messages, new Set<object>())

  const normalizedCodes = codes.map((entry) => entry.toLowerCase())
  return normalizedCodes.includes('email_already_in_use')
    || messages.some(isEmailConflictMessage)
}

export function resolveProfilePatchErrorMessage(field: string, error: unknown, fallback: string) {
  const normalizedField = normalizeText(field).toLowerCase()
  const statusCode = extractProfileUpdateErrorStatusCode(error)
  const messages: string[] = []

  collectErrorMessages(error, messages, new Set<object>())

  if (normalizedField === 'email') {
    if (isProfileEmailAlreadyInUseError(error)) {
      return 'Email ja esta em uso por outra conta.'
    }

    if (statusCode === 400) {
      return 'Email invalido.'
    }
  }

  if (normalizedField === 'password') {
    const currentPasswordMessage = messages.find((entry) => normalizeText(entry).toLowerCase().includes('senha atual invalida'))
    if (currentPasswordMessage) {
      return currentPasswordMessage
    }
  }

  const specificMessage = messages.find((entry) => !isGenericProfilePatchMessage(entry))
  if (specificMessage) {
    return specificMessage
  }

  return normalizeText(fallback) || 'Falha ao atualizar perfil.'
}
