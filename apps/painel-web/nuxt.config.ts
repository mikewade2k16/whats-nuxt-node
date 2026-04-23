const watchPollingEnabled = process.env.NUXT_WATCH_POLLING === 'true'
const watchPollingInterval = Number(process.env.NUXT_WATCH_POLL_INTERVAL ?? 1000)
const watcher = process.env.NUXT_WATCHER || 'chokidar-granular'
const isDevRuntime = process.env.NODE_ENV !== 'production'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['./modules/fila-atendimento/runtime'],
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  ui: {
    fonts: false,
    experimental: {
      componentDetection: true
    }
  },
  icon: {
    provider: 'server',
    fallbackToApi: false,
    collections: ['lucide']
  },
  routeRules: {
    '/': { redirect: '/admin/login' },
    ...(isDevRuntime ? {} : { '/admin/**': { ssr: false } }),
    '/_nuxt/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable'
      }
    }
  },
  runtimeConfig: {
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE ?? process.env.API_INTERNAL_BASE ?? 'http://atendimento-online-api:4000',
    coreApiInternalBase:
      process.env.NUXT_CORE_API_INTERNAL_BASE ??
      process.env.CORE_API_INTERNAL_BASE ??
      'http://plataforma-api:4100',
    internalUpstreamTimeoutMs:
      process.env.NUXT_INTERNAL_UPSTREAM_TIMEOUT_MS ??
      process.env.INTERNAL_UPSTREAM_TIMEOUT_MS ??
      6000,
    redisUrl: process.env.NUXT_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://redis:6379',
    trustedProxyRanges:
      process.env.NUXT_TRUSTED_PROXY_RANGES ??
      process.env.TRUSTED_PROXY_RANGES ??
      'loopback,private',
    gifProvider: process.env.NUXT_GIF_PROVIDER ?? 'tenor',
    tenorApiKey: process.env.NUXT_TENOR_API_KEY ?? '',
    tenorBaseUrl: process.env.NUXT_TENOR_BASE_URL ?? 'https://tenor.googleapis.com/v2',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:4000',
      websocketUrl: process.env.NUXT_PUBLIC_WEBSOCKET_URL || '/ws/tenant',
      websocketEnabled: process.env.NUXT_PUBLIC_WEBSOCKET_ENABLED !== 'false'
    }
  },
  experimental: {
    watcher
  },
  vite: {
    server: {
      watch: {
        usePolling: watchPollingEnabled,
        interval: watchPollingInterval,
        ignored: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.nitro/**']
      }
    }
  },
  nitro: {
    compressPublicAssets: true,
    routeRules: {
      '/admin/core': { redirect: '/admin/manage/clientes' },
      '/admin/core/cadastro': { redirect: '/admin/manage/clientes' },
      '/admin/core/login': { redirect: '/admin/login' }
    },
    experimental: {
      websocket: true
    },
    watchOptions: {
      usePolling: watchPollingEnabled,
      interval: watchPollingInterval,
      ignored: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.nitro/**'],
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 180
      }
    }
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false }
})
