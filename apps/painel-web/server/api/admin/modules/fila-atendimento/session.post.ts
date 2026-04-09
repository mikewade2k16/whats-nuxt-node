import { defineEventHandler, readBody } from 'h3'
import { resolveAdminProfile } from '~~/server/utils/admin-profile'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { filaAtendimentoFetch, setFilaAtendimentoSessionToken } from '~~/server/utils/fila-atendimento-api'
import { createFilaAtendimentoShellBridgeToken } from '~~/server/utils/fila-atendimento-shell-bridge'
import { resolveFilaAtendimentoShellScope } from '~~/server/utils/fila-atendimento-shell-scope'

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
  const shellScope = await resolveFilaAtendimentoShellScope(event, access)

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
