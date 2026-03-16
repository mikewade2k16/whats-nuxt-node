type PreferencesRecord = Record<string, unknown>

interface AdminProfileResponse {
  status?: string
  data?: {
    preferences?: unknown
  }
}

let loadPromise: Promise<void> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null

const PERSIST_DEBOUNCE_MS = 280

function normalizePreferences(value: unknown): PreferencesRecord {
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as PreferencesRecord
      }
      return {}
    } catch {
      return {}
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as PreferencesRecord
  }

  return {}
}

function clonePreferences(value: PreferencesRecord): PreferencesRecord {
  try {
    return JSON.parse(JSON.stringify(value)) as PreferencesRecord
  } catch {
    return {}
  }
}

function pathSegments(path: string | string[]) {
  if (Array.isArray(path)) {
    return path.map(segment => String(segment ?? '').trim()).filter(Boolean)
  }

  return String(path ?? '')
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean)
}

function getNestedValue(source: PreferencesRecord, path: string | string[]) {
  const segments = pathSegments(path)
  let cursor: unknown = source

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined
    }
    cursor = (cursor as PreferencesRecord)[segment]
  }

  return cursor
}

function setNestedValue(source: PreferencesRecord, path: string | string[], value: unknown) {
  const segments = pathSegments(path)
  if (segments.length === 0) {
    return source
  }

  const next = clonePreferences(source)
  let cursor: PreferencesRecord = next

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!
    const current = cursor[segment]
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as PreferencesRecord
  }

  cursor[segments[segments.length - 1]!] = value
  return next
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

export function useAdminPreferences() {
  const { bffFetch } = useBffFetch()
  const preferences = useState<PreferencesRecord>('admin.preferences', () => ({}))
  const loaded = useState<boolean>('admin.preferences.loaded', () => false)

  async function ensureLoaded() {
    if (loaded.value) return
    if (import.meta.server) {
      loaded.value = true
      return
    }

    if (loadPromise) {
      await loadPromise
      return
    }

    loadPromise = (async () => {
      try {
        const response = await bffFetch<AdminProfileResponse>('/api/admin/profile')
        preferences.value = normalizePreferences(response?.data?.preferences)
      } catch {
        preferences.value = {}
      } finally {
        loaded.value = true
        loadPromise = null
      }
    })()

    await loadPromise
  }

  async function persistNow() {
    if (import.meta.server) return
    if (persistInFlight) {
      await persistInFlight
      return
    }

    const snapshot = clonePreferences(preferences.value)
    persistInFlight = (async () => {
      try {
        const response = await bffFetch<AdminProfileResponse>('/api/admin/profile', {
          method: 'PATCH',
          body: {
            preferences: snapshot
          }
        })
        preferences.value = normalizePreferences(response?.data?.preferences)
      } catch {
        // no-op: mantem estado local para evitar perda da configuracao.
      } finally {
        persistInFlight = null
      }
    })()

    await persistInFlight
  }

  function schedulePersist() {
    if (import.meta.server) return
    if (persistTimer) {
      clearTimeout(persistTimer)
    }

    persistTimer = setTimeout(() => {
      void persistNow()
      persistTimer = null
    }, PERSIST_DEBOUNCE_MS)
  }

  function readStringArray(path: string | string[], fallback: string[] = []) {
    const current = getNestedValue(preferences.value, path)
    if (!Array.isArray(current)) {
      return [...fallback]
    }

    const sanitized = current
      .map(item => String(item ?? '').trim())
      .filter(Boolean)

    return sanitized.length > 0 ? sanitized : [...fallback]
  }

  function writeStringArray(path: string | string[], value: string[]) {
    const sanitized = value
      .map(item => String(item ?? '').trim())
      .filter(Boolean)

    const current = readStringArray(path)
    if (sameStringArray(current, sanitized)) {
      return
    }

    preferences.value = setNestedValue(preferences.value, path, sanitized)
    schedulePersist()
  }

  return {
    preferences,
    loaded,
    ensureLoaded,
    readStringArray,
    writeStringArray
  }
}
