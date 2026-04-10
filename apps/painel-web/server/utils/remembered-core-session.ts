function normalizeIdentity(value: unknown) {
  return String(value ?? "").trim()
}

function decodeJwtPayload(accessToken: string) {
  const normalizedAccessToken = String(accessToken ?? "").trim()
  if (!normalizedAccessToken) {
    return null
  }

  const segments = normalizedAccessToken.split(".")
  if (segments.length < 2) {
    return null
  }

  try {
    const payload = Buffer.from(segments[1], "base64url").toString("utf8")
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export function hasRememberedSessionTenantMismatch(accessToken: string, user: Record<string, unknown> | null | undefined) {
  const payload = decodeJwtPayload(accessToken)
  if (!payload || !user) {
    return false
  }

  const tokenTenantId = normalizeIdentity(payload.tenant_id)
  const userTenantId = normalizeIdentity(user.tenantId)

  return Boolean(tokenTenantId || userTenantId) && tokenTenantId !== userTenantId
}