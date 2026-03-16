import { createError, type H3Event } from 'h3'
import { coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreMePayload {
  user?: {
    id?: string
    name?: string
    email?: string
    nick?: string | null
    profileImage?: string | null
    isPlatformAdmin?: boolean
    tenantId?: string
    clientId?: number | null
    clientName?: string
    level?: string
    userType?: string
    phone?: string | null
    status?: string
    preferences?: unknown
    moduleCodes?: string[]
    atendimentoAccess?: boolean
  }
}

export interface ResolvedAdminProfile {
  id: number
  coreUserId: string
  level: string
  clientId: number | null
  name: string
  nick: string
  email: string
  phone: string
  status: string
  profileImage: string
  userType: string
  preferences: string
  moduleCodes: string[]
  atendimentoAccess: boolean
  isPlatformAdmin: boolean
  tenantId?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const output: string[] = []

  for (const entry of source) {
    const normalized = normalizeText(entry).toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

function normalizeOptionalClientId(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function normalizePreferencesString(value: unknown) {
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

export async function resolveAdminProfile(event: H3Event): Promise<ResolvedAdminProfile> {
  const me = await coreAdminFetch<CoreMePayload>(event, '/core/auth/me')
  const meUser = me?.user
  const coreUserID = normalizeText(meUser?.id)
  const email = normalizeText(meUser?.email).toLowerCase()
  const isPlatformAdmin = Boolean(meUser?.isPlatformAdmin)

  if (!coreUserID && !email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sessao invalida para carregar perfil.'
    })
  }

  const moduleCodes = normalizeModuleCodes(meUser?.moduleCodes)

  return {
    id: 0,
    coreUserId: coreUserID,
    level: normalizeText(meUser?.level) || (isPlatformAdmin ? 'admin' : 'marketing'),
    clientId: normalizeOptionalClientId(meUser?.clientId),
    name: normalizeText(meUser?.name),
    nick: normalizeText(meUser?.nick),
    email,
    phone: normalizeText(meUser?.phone),
    status: normalizeText(meUser?.status) || 'active',
    profileImage: normalizeText(meUser?.profileImage),
    userType: normalizeText(meUser?.userType) || (isPlatformAdmin ? 'admin' : 'client'),
    preferences: normalizePreferencesString(meUser?.preferences),
    moduleCodes,
    atendimentoAccess: Boolean(meUser?.atendimentoAccess) || moduleCodes.includes('atendimento'),
    isPlatformAdmin,
    tenantId: normalizeText(meUser?.tenantId) || undefined
  }
}
