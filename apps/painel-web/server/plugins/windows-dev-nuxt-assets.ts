const WINDOWS_DEV_NUXT_ASSET_RE = /(["'])\/_nuxt\/([A-Za-z]:\/[^"']+?)(["'])/g

function normalizeWindowsDevNuxtAssetPath(rawPath: string) {
  const [pathname, query = ''] = rawPath.split('?', 2)
  const suffix = pathname.endsWith('.css')
    ? query
      ? `?${query}&direct`
      : '?direct'
    : query
      ? `?${query}`
      : ''

  return `/_nuxt/@fs/${pathname}${suffix}`
}

export default defineNitroPlugin((nitroApp) => {
  if (!import.meta.dev || process.platform !== 'win32') {
    return
  }

  nitroApp.hooks.hook('render:response', (response) => {
    if (typeof response.body !== 'string' || !response.body.includes('/_nuxt/')) {
      return
    }

    response.body = response.body.replace(
      WINDOWS_DEV_NUXT_ASSET_RE,
      (_match, quote: string, rawPath: string, closingQuote: string) => {
        return `${quote}${normalizeWindowsDevNuxtAssetPath(rawPath)}${closingQuote}`
      }
    )
  })
})
