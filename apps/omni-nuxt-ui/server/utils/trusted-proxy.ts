import { BlockList, isIP } from 'node:net'
import { getHeader, getRequestIP, type H3Event } from 'h3'

const DEFAULT_TRUSTED_PROXY_RANGES = 'loopback,private'
const LOOPBACK_RANGES = ['127.0.0.0/8', '::1/128']
const PRIVATE_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7']

interface TrustedProxyResolver {
  raw: string
  blockList: BlockList
}

const resolverCache = new Map<string, TrustedProxyResolver>()

function normalizeIp(value: unknown) {
  const raw = String(value ?? '').trim().replace(/^\[|\]$/g, '')
  if (!raw) {
    return ''
  }

  if (raw.startsWith('::ffff:')) {
    return raw.slice(7)
  }

  return raw
}

function expandTrustedEntries(raw: string) {
  const entries = raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)

  if (entries.length < 1) {
    return DEFAULT_TRUSTED_PROXY_RANGES.split(',')
  }

  const expanded: string[] = []
  for (const entry of entries) {
    if (entry === 'loopback') {
      expanded.push(...LOOPBACK_RANGES)
      continue
    }
    if (entry === 'private') {
      expanded.push(...PRIVATE_RANGES)
      continue
    }
    expanded.push(entry)
  }

  return expanded
}

function getResolver(rawInput: unknown) {
  const raw = String(rawInput ?? '').trim() || DEFAULT_TRUSTED_PROXY_RANGES
  const cached = resolverCache.get(raw)
  if (cached) {
    return cached
  }

  const blockList = new BlockList()
  for (const entry of expandTrustedEntries(raw)) {
    if (entry.includes('/')) {
      const [address, prefixRaw] = entry.split('/', 2)
      const prefix = Number.parseInt(prefixRaw ?? '', 10)
      const normalizedAddress = normalizeIp(address)
      const family = isIP(normalizedAddress)
      if (!normalizedAddress || !Number.isFinite(prefix) || family === 0) {
        continue
      }
      blockList.addSubnet(normalizedAddress, prefix, family === 6 ? 'ipv6' : 'ipv4')
      continue
    }

    const normalizedAddress = normalizeIp(entry)
    const family = isIP(normalizedAddress)
    if (!normalizedAddress || family === 0) {
      continue
    }
    blockList.addAddress(normalizedAddress, family === 6 ? 'ipv6' : 'ipv4')
  }

  const resolver = { raw, blockList }
  resolverCache.set(raw, resolver)
  return resolver
}

function isTrustedProxyIp(ip: string, trustedRanges: unknown) {
  const normalized = normalizeIp(ip)
  const family = isIP(normalized)
  if (!normalized || family === 0) {
    return false
  }

  return getResolver(trustedRanges).blockList.check(normalized, family === 6 ? 'ipv6' : 'ipv4')
}

export function resolveTrustedClientIp(options: {
  peerIp?: unknown
  forwardedFor?: unknown
  trustedRanges?: unknown
}) {
  const peerIp = normalizeIp(options.peerIp)
  const forwardedFor = String(options.forwardedFor ?? '').trim()

  if (!peerIp) {
    return 'unknown'
  }

  if (!isTrustedProxyIp(peerIp, options.trustedRanges) || !forwardedFor) {
    return peerIp
  }

  const firstForwarded = normalizeIp(forwardedFor.split(',')[0])
  if (isIP(firstForwarded) === 0) {
    return peerIp
  }

  return firstForwarded
}

export function resolveTrustedEventClientIp(event: H3Event) {
  const config = useRuntimeConfig(event)
  const socketIp = event.node?.req?.socket?.remoteAddress || event.node?.req?.socket?.address?.().address || 'unknown'
  return resolveTrustedClientIp({
    peerIp: getRequestIP(event, { xForwardedFor: false }) || socketIp,
    forwardedFor: getHeader(event, 'x-forwarded-for'),
    trustedRanges: config.trustedProxyRanges
  })
}
