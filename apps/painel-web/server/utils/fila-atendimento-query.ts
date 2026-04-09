import { getQuery, type H3Event } from 'h3'

type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean | null | undefined>

function appendQueryValue(params: URLSearchParams, key: string, value: QueryValue) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(params, key, item)
    }
    return
  }

  if (value === undefined || value === null) {
    return
  }

  const normalized = String(value).trim()
  if (!normalized) {
    return
  }

  params.append(key, normalized)
}

export function buildFilaAtendimentoQuery(event: H3Event, allowedKeys?: string[]) {
  const query = getQuery(event)
  const allowed = Array.isArray(allowedKeys) && allowedKeys.length
    ? new Set(allowedKeys.map(key => String(key).trim()).filter(Boolean))
    : null

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    const normalizedKey = String(key).trim()
    if (!normalizedKey) {
      continue
    }

    if (allowed && !allowed.has(normalizedKey)) {
      continue
    }

    appendQueryValue(params, normalizedKey, value as QueryValue)
  }

  const built = params.toString()
  return built ? `?${built}` : ''
}