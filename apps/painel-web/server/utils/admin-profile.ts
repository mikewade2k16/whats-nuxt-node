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
    businessRole?: string
    storeId?: string | null
    storeName?: string | null
    registrationNumber?: string
    phone?: string | null
    status?: string
    preferences?: unknown
    moduleCodes?: string[]
    atendimentoAccess?: boolean
  }
}

interface CoreAdminClientPayload {
  id?: number | null
  name?: string
  moduleCodes?: string[]
  modules?: Array<{
    code?: string
  }>
}

export interface ResolvedAdminProfile {
  id: number
  coreUserId: string
  level: string
  clientId: number | null
  clientName: string
  name: string
  nick: string
  email: string
  phone: string
  status: string
  profileImage: string
  userType: string
  businessRole: string
  storeId: string | null
  storeName: string
  registrationNumber: string
  preferences: string
  moduleCodes: string[]
  atendimentoAccess: boolean
  isPlatformAdmin: boolean
  tenantId?: string
}

export interface ResolvedAdminProfileSummary {
  id: string
  email: string
  tenantId?: string
  clientId: number | null
  clientName: string
  isPlatformAdmin: boolean
  level: string
  userType: string
  moduleCodes: string[]
  atendimentoAccess: boolean
  nick: string
  storeName: string
  profileImage: string
  preferences: string
}

type AdminProfileEventContext = H3Event['context'] & {
  adminProfile?: ResolvedAdminProfile
  adminProfileError?: unknown
}

function getAdminProfileContext(event: H3Event) {
  return event.context as AdminProfileEventContext
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

function extractClientModuleCodes(client: CoreAdminClientPayload | null | undefined) {
  return normalizeModuleCodes(
    Array.isArray(client?.moduleCodes) && client.moduleCodes.length > 0
      ? client.moduleCodes
      : (client?.modules || []).map(module => module.code)
  )
}

export function buildAdminProfileSummary(profile: ResolvedAdminProfile): ResolvedAdminProfileSummary {
  return {
    id: normalizeText(profile.coreUserId) || String(profile.id || '').trim(),
    email: profile.email,
    tenantId: profile.tenantId,
    clientId: profile.clientId,
    clientName: profile.clientName,
    isPlatformAdmin: profile.isPlatformAdmin,
    level: profile.level,
    userType: profile.userType,
    moduleCodes: [...profile.moduleCodes],
    atendimentoAccess: profile.atendimentoAccess,
    nick: profile.nick,
    storeName: profile.storeName,
    profileImage: profile.profileImage,
    preferences: profile.preferences
  }
}

export async function resolveAdminProfile(event: H3Event): Promise<ResolvedAdminProfile> {
  const context = getAdminProfileContext(event)
  if (context.adminProfile) {
    return context.adminProfile
  }

  if (context.adminProfileError) {
    throw context.adminProfileError
  }

  try {
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

    const resolvedTenantID = normalizeText(meUser?.tenantId) || undefined
    const moduleCodes = normalizeModuleCodes(meUser?.moduleCodes)
    const resolvedProfile: ResolvedAdminProfile = {
      id: 0,
      coreUserId: coreUserID,
      level: normalizeText(meUser?.level) || (isPlatformAdmin ? 'admin' : 'marketing'),
      clientId: normalizeOptionalClientId(meUser?.clientId),
      clientName: normalizeText(meUser?.clientName),
      name: normalizeText(meUser?.name),
      nick: normalizeText(meUser?.nick),
      email,
      phone: normalizeText(meUser?.phone),
      status: normalizeText(meUser?.status) || 'active',
      profileImage: normalizeText(meUser?.profileImage),
      userType: normalizeText(meUser?.userType) || (isPlatformAdmin ? 'admin' : 'client'),
      businessRole: normalizeText(meUser?.businessRole),
      storeId: normalizeText(meUser?.storeId) || null,
      storeName: normalizeText(meUser?.storeName),
      registrationNumber: normalizeText(meUser?.registrationNumber),
      preferences: normalizePreferencesString(meUser?.preferences),
      moduleCodes: [...moduleCodes],
      atendimentoAccess: false,
      isPlatformAdmin,
      tenantId: resolvedTenantID
    }

    if (resolvedTenantID) {
      try {
        const clientDetail = await coreAdminFetch<CoreAdminClientPayload>(
          event,
          `/core/admin/clients/${encodeURIComponent(resolvedTenantID)}`
        )

        const clientModuleCodes = extractClientModuleCodes(clientDetail)
        if (clientModuleCodes.length > 0) {
          resolvedProfile.moduleCodes = clientModuleCodes
        }

        if (resolvedProfile.clientId == null) {
          resolvedProfile.clientId = normalizeOptionalClientId(clientDetail?.id)
        }
        if (!resolvedProfile.clientName) {
          resolvedProfile.clientName = normalizeText(clientDetail?.name)
        }
      } catch {
        // Keep auth/me payload as fallback when the client directory fetch is unavailable.
      }
    }

    resolvedProfile.atendimentoAccess = Boolean(meUser?.atendimentoAccess)
      && resolvedProfile.moduleCodes.includes('atendimento')

    context.adminProfile = resolvedProfile
    return resolvedProfile
  } catch (error) {
    context.adminProfileError = error
    throw error
  }
}
