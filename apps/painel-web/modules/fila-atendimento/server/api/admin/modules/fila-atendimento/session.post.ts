import { defineEventHandler, readBody } from 'h3'
import { resolveAdminProfile } from '~~/server/utils/admin-profile'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch, setFilaAtendimentoSessionToken } from '@fila-atendimento/server/utils/fila-atendimento-api'
import { createFilaAtendimentoShellBridgeToken } from '@fila-atendimento/server/utils/fila-atendimento-shell-bridge'
import { resolveFilaAtendimentoShellScope } from '@fila-atendimento/server/utils/fila-atendimento-shell-scope'

interface SessionRequestBody {
  bridgeToken?: string
}

interface SessionResponse {
  user?: unknown
  session?: {
    accessToken?: string
    expiresInSeconds?: number
  }
}

export default defineEventHandler(async (event) => {
  const access = await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  const profile = await resolveAdminProfile(event)
  const runtimeConfig = useRuntimeConfig(event)
  const requestBody = await readBody<SessionRequestBody>(event).catch(() => ({} as SessionRequestBody))

  const bridgeTokenFromBody = String(requestBody?.bridgeToken ?? '').trim()
  const shellBridgeSecret = String(runtimeConfig.filaAtendimentoShellBridgeSecret ?? '').trim()
  const shellScope = await resolveFilaAtendimentoShellScope(event, access, profile)

  if (shellScope.scopeMode !== 'platform' && !shellScope.coreTenantId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nao foi possivel resolver o tenant do modulo para o perfil atual.'
    })
  }

  if (shellScope.scopeMode === 'first_store' && shellScope.stores.length < 1) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nenhuma loja ativa foi encontrada para o tenant atual no fila-atendimento.'
    })
  }

  if (shellScope.scopeMode === 'first_store' && shellScope.storeIds.length < 1) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nao foi possivel identificar a loja ativa do seu perfil para iniciar o fila-atendimento.'
    })
  }

  const bridgeToken = bridgeTokenFromBody || createFilaAtendimentoShellBridgeToken({
    secret: shellBridgeSecret,
    access,
    profile,
    scope: shellScope
  })

  const response = await filaAtendimentoFetch<SessionResponse>(event, '/v1/auth/shell/exchange', {
    method: 'POST',
    allowAnonymous: true,
    body: {
      bridgeToken
    }
  })

  const accessToken = String(response?.session?.accessToken ?? '').trim()
  const expiresInSeconds = Number(response?.session?.expiresInSeconds ?? 0)

  if (accessToken) {
    setFilaAtendimentoSessionToken(event, accessToken, expiresInSeconds)
  }

  return {
    ok: Boolean(accessToken),
    user: response?.user ?? null,
    expiresInSeconds
  }
})
