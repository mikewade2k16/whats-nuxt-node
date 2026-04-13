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

interface CoreTenantPayload {
  id?: string
  slug?: string
}

export type FilaAtendimentoShellScopeMode = 'platform' | 'all_stores' | 'first_store'

export interface ResolvedFilaAtendimentoShellScope {
  coreTenantId: string
  tenantSlug: string
  scopeMode: FilaAtendimentoShellScopeMode
  storeIds: string[]
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

function resolveScopeMode(
  access: AccessContext,
  profile: ResolvedAdminProfile,
  simulatedClientId: number
): FilaAtendimentoShellScopeMode {
  const isPlatformScope = Boolean(
    simulatedClientId <= 0
    && access.isPlatformAdmin
    && access.userType === 'admin'
    && access.userLevel === 'admin'
  )

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

function resolveStoreIds(profile: ResolvedAdminProfile) {
  const businessRole = normalizeBusinessRole(profile.businessRole)
  if (businessRole !== 'consultant' && businessRole !== 'store_manager') {
    return [] as string[]
  }

  const storeId = normalizeText(profile.storeId)
  return storeId ? [storeId] : []
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

async function resolveTenantSlug(event: H3Event, coreTenantId: string) {
  if (!coreTenantId) {
    return ''
  }

  const tenant = await coreAdminFetch<CoreTenantPayload>(
    event,
    `/core/tenants/${encodeURIComponent(coreTenantId)}`
  )

  return normalizeText(tenant?.slug)
}

export async function resolveFilaAtendimentoShellScope(
  event: H3Event,
  access: AccessContext,
  profile: ResolvedAdminProfile
): Promise<ResolvedFilaAtendimentoShellScope> {
  const simulatedClientId = parsePositiveInteger(getHeader(event, 'x-client-id'))
  const scopeMode = resolveScopeMode(access, profile, simulatedClientId)
  const coreTenantId = await resolveCoreTenantId(event, access, simulatedClientId)
  const tenantSlug = await resolveTenantSlug(event, coreTenantId)
  const storeIds = resolveStoreIds(profile)

  return {
    coreTenantId,
    tenantSlug,
    scopeMode,
    storeIds
  }
}
