import crypto from 'node:crypto'

export type FilaAtendimentoRealtimeTopic = 'operations' | 'context'

const REALTIME_BRIDGE_TOKEN_PREFIX = 'ldv-realtime-v1'

export interface FilaAtendimentoRealtimeBridgeTokenPayload {
  sub: string
  topic: FilaAtendimentoRealtimeTopic
  storeId?: string
  tenantId?: string
  iat: number
  exp: number
}

interface CreateFilaAtendimentoRealtimeBridgeTokenOptions {
  secret: string
  subject: string
  topic: FilaAtendimentoRealtimeTopic
  storeId?: string
  tenantId?: string
  ttlSeconds?: number
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function signPayload(secret: string, encodedPayload: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
}

function safeCompareSignatures(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function createFilaAtendimentoRealtimeBridgeToken(options: CreateFilaAtendimentoRealtimeBridgeTokenOptions) {
  const secret = normalizeText(options.secret)
  if (!secret) {
    throw new Error('FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET nao configurado.')
  }

  const subject = normalizeText(options.subject)
  if (!subject) {
    throw new Error('Nao foi possivel identificar o ator do bridge realtime.')
  }

  const ttlSeconds = Math.max(30, Number(options.ttlSeconds || 75) || 75)
  const now = Math.floor(Date.now() / 1000)

  const payload: FilaAtendimentoRealtimeBridgeTokenPayload = {
    sub: subject,
    topic: options.topic,
    iat: now,
    exp: now + ttlSeconds
  }

  const storeId = normalizeText(options.storeId)
  if (storeId) {
    payload.storeId = storeId
  }

  const tenantId = normalizeText(options.tenantId)
  if (tenantId) {
    payload.tenantId = tenantId
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = signPayload(secret, encodedPayload)
  return `${REALTIME_BRIDGE_TOKEN_PREFIX}.${encodedPayload}.${signature}`
}

export function verifyFilaAtendimentoRealtimeBridgeToken(token: string, secret: string) {
  const normalizedToken = normalizeText(token)
  const normalizedSecret = normalizeText(secret)
  if (!normalizedToken || !normalizedSecret) {
    return null
  }

  const [prefix, encodedPayload, signature] = normalizedToken.split('.')
  if (prefix !== REALTIME_BRIDGE_TOKEN_PREFIX || !encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signPayload(normalizedSecret, encodedPayload)
  if (!safeCompareSignatures(signature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as FilaAtendimentoRealtimeBridgeTokenPayload
    const topic = normalizeText(payload?.topic) as FilaAtendimentoRealtimeTopic
    if (topic !== 'operations' && topic !== 'context') {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (!Number.isFinite(payload?.exp) || Number(payload.exp) <= now) {
      return null
    }

    const normalizedPayload: FilaAtendimentoRealtimeBridgeTokenPayload = {
      sub: normalizeText(payload?.sub),
      topic,
      iat: Number(payload?.iat || 0) || 0,
      exp: Number(payload?.exp || 0) || 0
    }

    const storeId = normalizeText(payload?.storeId)
    if (storeId) {
      normalizedPayload.storeId = storeId
    }

    const tenantId = normalizeText(payload?.tenantId)
    if (tenantId) {
      normalizedPayload.tenantId = tenantId
    }

    return normalizedPayload
  } catch {
    return null
  }
}