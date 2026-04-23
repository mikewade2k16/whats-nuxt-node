import { createError, defineEventHandler, readBody } from 'h3'
import { requireResolvedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { createFilaAtendimentoRealtimeBridgeToken, type FilaAtendimentoRealtimeTopic } from '@fila-atendimento/server/utils/fila-atendimento-realtime-bridge'

interface RealtimeTicketRequestBody {
  topic?: FilaAtendimentoRealtimeTopic
  storeId?: string
  tenantId?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export default defineEventHandler(async (event) => {
  const access = await requireResolvedFeatureAccess(event, '/admin/fila-atendimento')
  const runtimeConfig = useRuntimeConfig(event)
  const bridgeSecret = normalizeText(runtimeConfig.filaAtendimentoShellBridgeSecret)
  if (!bridgeSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Bridge realtime do fila-atendimento nao configurado.'
    })
  }

  const body = await readBody<RealtimeTicketRequestBody>(event).catch(() => ({} as RealtimeTicketRequestBody))
  const topic = normalizeText(body?.topic) as FilaAtendimentoRealtimeTopic

  if (topic !== 'operations' && topic !== 'context') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Topico realtime invalido.'
    })
  }

  const storeId = normalizeText(body?.storeId)
  const tenantId = normalizeText(body?.tenantId || access.tenantId)

  if (topic === 'operations' && !storeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe a loja para abrir o realtime da operacao.'
    })
  }

  if (topic === 'context' && !tenantId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe o tenant para abrir o realtime de contexto.'
    })
  }

  const expiresInSeconds = 75
  const ticket = createFilaAtendimentoRealtimeBridgeToken({
    secret: bridgeSecret,
    subject: access.coreUserId || access.email,
    topic,
    storeId: topic === 'operations' ? storeId : undefined,
    tenantId,
    ttlSeconds: expiresInSeconds
  })

  return {
    ok: true,
    topic,
    ticket,
    expiresInSeconds,
    storeId: topic === 'operations' ? storeId : undefined,
    tenantId: topic === 'context' ? tenantId : undefined
  }
})