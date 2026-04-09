import { createError, type H3Event } from 'h3'
import type { AccessContext } from '~~/server/utils/access-context'
import type { ResolvedAdminProfile } from '~~/server/utils/admin-profile'
import { createFilaAtendimentoShellBridgeToken } from '~~/server/utils/fila-atendimento-shell-bridge'
import { resolveFilaAtendimentoShellScope } from '~~/server/utils/fila-atendimento-shell-scope'

interface ResolveFilaAtendimentoLaunchUrlOptions {
  event: H3Event
  access: AccessContext
  profile: ResolvedAdminProfile
  moduleWebBase: string
  shellBridgeSecret: string
}

export async function resolveFilaAtendimentoLaunchUrl(options: ResolveFilaAtendimentoLaunchUrlOptions) {
  const shellScope = await resolveFilaAtendimentoShellScope(options.event, options.access)

  if (shellScope.scopeMode !== 'platform' && !shellScope.tenantSlug) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nao foi possivel resolver o tenant do modulo fila-atendimento para esta sessao.'
    })
  }

  const shellBridgeToken = createFilaAtendimentoShellBridgeToken({
    secret: options.shellBridgeSecret,
    access: options.access,
    profile: options.profile,
    scope: shellScope
  })

  const target = new URL('/admin/fila-atendimento', `${options.moduleWebBase}/`)
  target.searchParams.set('shellBridgeToken', shellBridgeToken)

  return target.toString()
}
