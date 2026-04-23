import { getHeader, type H3Event } from 'h3'
import type { AccessContext } from '~~/server/utils/access-context'
import type { ResolvedAdminProfile } from '~~/server/utils/admin-profile'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

interface CoreAdminClientListPayload {
  items?: Array<{
    id?: number
    coreTenantId?: string
  }>
}

interface CoreAdminClientDetailPayload {
  id?: number
  name?: string
  stores?: Array<{
    id?: string
    name?: string
  }>
}

interface CoreTenantPayload {
  id?: string
  slug?: string
  name?: string
}

interface CoreAdminUsersPayload {
  items?: Array<{
    coreUserId?: string
    name?: string
    email?: string
    status?: string
    businessRole?: string
    storeId?: string | null
    registrationNumber?: string
  }>
}

interface ResolvedClientDirectory {
  clientName: string
  stores: ResolvedFilaAtendimentoShellStore[]
  consultants: ResolvedFilaAtendimentoShellConsultant[]
  currentUserStoreId: string
}

export type FilaAtendimentoShellScopeMode = 'platform' | 'all_stores' | 'first_store'

export interface ResolvedFilaAtendimentoShellStore {
  id: string
  name: string
}

export interface ResolvedFilaAtendimentoShellConsultant {
  userId: string
  name: string
  email: string
  storeId: string
  registrationNumber: string
}

export interface ResolvedFilaAtendimentoShellScope {
  coreTenantId: string
  tenantSlug: string
  tenantName: string
  scopeMode: FilaAtendimentoShellScopeMode
  storeIds: string[]
  stores: ResolvedFilaAtendimentoShellStore[]
  consultants: ResolvedFilaAtendimentoShellConsultant[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function parsePositiveInteger(value: unknown) {
  const parsed = Number.parseInt(normalizeText(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function normalizeBusinessRole(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeTenantSlugCandidate(value: unknown) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.slice(0, 80)
}

export function isFilaAtendimentoPlatformShellScope(
  access: Pick<AccessContext, 'isSuperRoot' | 'userType' | 'userLevel'>
) {
  return Boolean(
    access.isSuperRoot
    && access.userType === 'admin'
    && access.userLevel === 'admin'
  )
}

function resolveScopeMode(
  access: AccessContext,
  profile: ResolvedAdminProfile,
  simulatedClientId: number
): FilaAtendimentoShellScopeMode {
  const isPlatformScope = isFilaAtendimentoPlatformShellScope(access)

  if (isPlatformScope) {
    return 'platform'
  }

  const businessRole = normalizeBusinessRole(profile.businessRole)
  if (businessRole === 'consultant' || businessRole === 'store_manager') {
    return 'first_store'
  }

  if (businessRole === 'general_manager') {
    return 'all_stores'
  }

  if (access.userLevel === 'consultant' || access.userLevel === 'manager') {
    return 'first_store'
  }

  return 'all_stores'
}

function fallbackStoreDirectory(profile: ResolvedAdminProfile) {
  const storeId = normalizeText(profile.storeId)
  const storeName = normalizeText(profile.storeName)
  if (!storeId) {
    return [] as ResolvedFilaAtendimentoShellStore[]
  }

  return [{
    id: storeId,
    name: storeName || storeId
  }]
}

function resolveScopedStoreIds(
  scopeMode: FilaAtendimentoShellScopeMode,
  profile: ResolvedAdminProfile,
  clientDirectory: ResolvedClientDirectory
) {
  if (scopeMode !== 'first_store') {
    return [] as string[]
  }

  const availableStoreIds = new Set(clientDirectory.stores.map((store) => store.id))
  const candidates = [
    normalizeText(clientDirectory.currentUserStoreId),
    normalizeText(profile.storeId)
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    if (availableStoreIds.size === 0 || availableStoreIds.has(candidate)) {
      return [candidate]
    }
  }

  if (clientDirectory.stores.length === 1) {
    return [clientDirectory.stores[0].id]
  }

  return [] as string[]
}

function fallbackConsultantDirectory(profile: ResolvedAdminProfile) {
  if (normalizeBusinessRole(profile.businessRole) !== 'consultant') {
    return [] as ResolvedFilaAtendimentoShellConsultant[]
  }

  const userId = normalizeText(profile.coreUserId)
  const name = normalizeText(profile.name)
  const email = normalizeText(profile.email).toLowerCase()
  const storeId = normalizeText(profile.storeId)
  if (!userId || !name || !email || !storeId) {
    return []
  }

  return [{
    userId,
    name,
    email,
    storeId,
    registrationNumber: normalizeText(profile.registrationNumber)
  }]
}

async function resolveCoreTenantId(event: H3Event, access: AccessContext, simulatedClientId: number) {
  if (simulatedClientId > 0) {
    const response = await coreAdminFetch<CoreAdminClientListPayload>(
      event,
      `/core/admin/clients${buildCoreQuery({
        page: 1,
        limit: 300
      })}`
    )

    const matched = (response.items || []).find((entry) => Number(entry.id) === simulatedClientId)
    return normalizeText(matched?.coreTenantId)
  }

  return normalizeText(access.tenantId)
}

async function resolveTenantSlug(event: H3Event, coreTenantId: string, profile: ResolvedAdminProfile) {
  if (!coreTenantId) {
    return {
      slug: '',
      name: ''
    }
  }

  try {
    const tenant = await coreAdminFetch<CoreTenantPayload>(
      event,
      `/core/tenants/${encodeURIComponent(coreTenantId)}`
    )

    return {
      slug: normalizeText(tenant?.slug),
      name: normalizeText(tenant?.name)
    }
  } catch {
    const fallbackName = normalizeText(profile.clientName)
    const fallbackSlug = normalizeTenantSlugCandidate(fallbackName)
      || (profile.clientId ? `tenant-${profile.clientId}` : '')
      || 'tenant-shell'

    return {
      slug: fallbackSlug,
      name: fallbackName
    }
  }
}

function resolveClientId(access: AccessContext, simulatedClientId: number) {
  if (simulatedClientId > 0) {
    return simulatedClientId
  }

  return access.clientId > 0 ? access.clientId : 0
}

async function resolveClientDirectory(
  event: H3Event,
  coreTenantId: string,
  profile: ResolvedAdminProfile
): Promise<ResolvedClientDirectory> {
  if (!coreTenantId) {
    return {
      clientName: '',
      stores: [] as ResolvedFilaAtendimentoShellStore[],
      consultants: [] as ResolvedFilaAtendimentoShellConsultant[],
      currentUserStoreId: ''
    }
  }

  const [clientDetail, usersPayload] = await Promise.all([
    coreAdminFetch<CoreAdminClientDetailPayload>(
      event,
      `/core/admin/clients/${encodeURIComponent(coreTenantId)}`
    ),
    coreAdminFetch<CoreAdminUsersPayload>(
      event,
      `/core/admin/users${buildCoreQuery({
        page: 1,
        limit: 200,
        coreTenantId
      })}`
    )
  ])

  const stores = (clientDetail?.stores || [])
    .map((store) => {
      const id = normalizeText(store?.id)
      const name = normalizeText(store?.name)
      if (!id || !name) {
        return null
      }

      return { id, name }
    })
    .filter((store): store is ResolvedFilaAtendimentoShellStore => Boolean(store))

  const availableStoreIds = new Set(stores.map(store => store.id))
  const targetUserId = normalizeText(profile.coreUserId)
  const targetEmail = normalizeText(profile.email).toLowerCase()
  const directoryUsers = (usersPayload?.items || []).map((item) => {
    const userId = normalizeText(item?.coreUserId)
    const email = normalizeText(item?.email).toLowerCase()
    const name = normalizeText(item?.name)
    const storeId = normalizeText(item?.storeId)
    const businessRole = normalizeBusinessRole(item?.businessRole)
    const status = normalizeText(item?.status).toLowerCase()

    return {
      userId,
      email,
      name,
      storeId,
      businessRole,
      status,
      registrationNumber: normalizeText(item?.registrationNumber)
    }
  })

  const currentUserStoreId = directoryUsers.find((item) => {
    if (item.status !== 'active' || !item.storeId || !availableStoreIds.has(item.storeId)) {
      return false
    }

    return (targetUserId && item.userId === targetUserId)
      || (targetEmail && item.email === targetEmail)
  })?.storeId || ''

  const consultants = directoryUsers
    .map((item) => {
      if (
        item.businessRole !== 'consultant'
        || item.status !== 'active'
        || !item.userId
        || !item.email
        || !item.name
        || !item.storeId
        || !availableStoreIds.has(item.storeId)
      ) {
        return null
      }

      return {
        userId: item.userId,
        name: item.name,
        email: item.email,
        storeId: item.storeId,
        registrationNumber: item.registrationNumber
      }
    })
    .filter((item): item is ResolvedFilaAtendimentoShellConsultant => Boolean(item))

  return {
    clientName: normalizeText(clientDetail?.name),
    stores,
    consultants,
    currentUserStoreId
  }
}

export async function resolveFilaAtendimentoShellScope(
  event: H3Event,
  access: AccessContext,
  profile: ResolvedAdminProfile
): Promise<ResolvedFilaAtendimentoShellScope> {
  const simulatedClientId = parsePositiveInteger(getHeader(event, 'x-client-id'))
  const scopeMode = resolveScopeMode(access, profile, simulatedClientId)
  const coreTenantId = scopeMode === 'platform'
    ? ''
    : await resolveCoreTenantId(event, access, simulatedClientId)
  const tenantInfo = scopeMode === 'platform'
    ? { slug: '', name: '' }
    : await resolveTenantSlug(event, coreTenantId, profile)
  let clientDirectory: ResolvedClientDirectory = {
    clientName: '',
    stores: [] as ResolvedFilaAtendimentoShellStore[],
    consultants: [] as ResolvedFilaAtendimentoShellConsultant[],
    currentUserStoreId: ''
  }

  if (scopeMode !== 'platform') {
    try {
      clientDirectory = await resolveClientDirectory(event, coreTenantId, profile)
    } catch {
      clientDirectory = {
        clientName: '',
        stores: fallbackStoreDirectory(profile),
        consultants: fallbackConsultantDirectory(profile),
        currentUserStoreId: normalizeText(profile.storeId)
      }
    }
  }

  const storeIds = resolveScopedStoreIds(scopeMode, profile, clientDirectory)

  return {
    coreTenantId,
    tenantSlug: tenantInfo.slug,
    tenantName: clientDirectory.clientName || tenantInfo.name || normalizeText(profile.clientName),
    scopeMode,
    storeIds,
    stores: clientDirectory.stores,
    consultants: clientDirectory.consultants
  }
}
