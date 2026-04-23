import { defineEventHandler } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'

interface ProbeResult {
  ok: boolean
  url: string
  statusCode: number | null
  checkedAt: string
  detail: string
}

function normalizeBaseUrl(value: unknown) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

async function probe(url: string, path = ''): Promise<ProbeResult> {
  const base = normalizeBaseUrl(url)
  const target = `${base}${path}`
  const checkedAt = new Date().toISOString()

  if (!base) {
    return {
      ok: false,
      url: target,
      statusCode: null,
      checkedAt,
      detail: 'Base nao configurada.'
    }
  }

  try {
    const response = await $fetch.raw(target, {
      method: 'GET',
      retry: 0,
      timeout: 3500
    })

    return {
      ok: response.status >= 200 && response.status < 400,
      url: target,
      statusCode: response.status,
      checkedAt,
      detail: `HTTP ${response.status}`
    }
  } catch (error) {
    return {
      ok: false,
      url: target,
      statusCode: null,
      checkedAt,
      detail: error instanceof Error ? error.message : 'Falha ao consultar o endpoint.'
    }
  }
}

export default defineEventHandler(async (event) => {
  const access = await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  const runtimeConfig = useRuntimeConfig(event)

  const filaAtendimentoWebPublicBase = normalizeBaseUrl(runtimeConfig.public?.filaAtendimentoBase)
  const filaAtendimentoApiPublicBase = normalizeBaseUrl(runtimeConfig.public?.filaAtendimentoApiBase)
  const filaAtendimentoWebInternalBase = normalizeBaseUrl(runtimeConfig.filaAtendimentoWebInternalBase)
  const filaAtendimentoApiInternalBase = normalizeBaseUrl(runtimeConfig.filaAtendimentoApiInternalBase)

  const [webHealth, apiHealth] = await Promise.all([
    probe(filaAtendimentoWebInternalBase || filaAtendimentoWebPublicBase, '/admin/login'),
    probe(filaAtendimentoApiInternalBase || filaAtendimentoApiPublicBase, '/healthz')
  ])

  return {
    module: {
      id: 'fila-atendimento',
      label: 'Fila de Atendimento',
      status: 'integracao-inicial-no-host',
      transport: 'http+json',
      docs: {
        quickStart: 'PADRAO-MODULOS-ORQUESTRADOS.md',
        protocol: 'docs/protocolo-orquestracao-modulos.md',
        agents: 'modules/fila-atendimento/AGENTS.md',
        incorporationPlan: 'modules/fila-atendimento/PLANO-DE-INCORPORACAO.md'
      },
      contracts: {
        required: ['ActorContext', 'TenantContext', 'AccessPolicy', 'StoreScopeProvider', 'Clock'],
        optional: ['UsersDirectory', 'CustomersFeed', 'IdentityProvisioner', 'RealtimeContextResolver']
      }
    },
    runtime: {
      web: {
        publicBase: filaAtendimentoWebPublicBase,
        internalBase: filaAtendimentoWebInternalBase
      },
      api: {
        publicBase: filaAtendimentoApiPublicBase,
        internalBase: filaAtendimentoApiInternalBase
      }
    },
    health: {
      web: webHealth,
      api: apiHealth
    },
    context: {
      actor: {
        coreUserId: access.coreUserId,
        email: access.email,
        userType: access.userType,
        userLevel: access.userLevel,
        isPlatformAdmin: access.isPlatformAdmin
      },
      tenant: {
        tenantId: access.tenantId || '',
        clientId: access.clientId || null,
        moduleCodes: access.profileModuleCodes
      },
      capabilities: [
        access.canManageUsers ? 'tenant.users.manage' : null,
        access.canCrossClientAccess ? 'cross-client-access' : null,
        access.isPlatformAdmin ? 'platform-admin' : null,
        access.profileModuleCodes.includes('fila-atendimento') ? 'fila-atendimento.enabled' : null
      ].filter(Boolean)
    }
  }
})
