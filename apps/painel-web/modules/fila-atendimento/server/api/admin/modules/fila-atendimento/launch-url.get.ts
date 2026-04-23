import { createError, defineEventHandler } from 'h3'
import { resolveAdminProfile } from '~~/server/utils/admin-profile'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveFilaAtendimentoLaunchUrl } from '@fila-atendimento/server/utils/fila-atendimento-launch'

function normalizeBaseUrl(value: unknown) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

export default defineEventHandler(async (event) => {
  const access = await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  const profile = await resolveAdminProfile(event)
  const runtimeConfig = useRuntimeConfig(event)

  const moduleWebBase = normalizeBaseUrl(runtimeConfig.public?.filaAtendimentoBase)
  const shellBridgeSecret = String(runtimeConfig.filaAtendimentoShellBridgeSecret ?? '').trim()

  if (!moduleWebBase) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Base publica do modulo fila-atendimento nao configurada.'
    })
  }

  if (!shellBridgeSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bridge de sessao do fila-atendimento nao configurado.'
    })
  }

  const url = await resolveFilaAtendimentoLaunchUrl({
    event,
    access,
    profile,
    moduleWebBase,
    shellBridgeSecret
  })

  return { url }
})
