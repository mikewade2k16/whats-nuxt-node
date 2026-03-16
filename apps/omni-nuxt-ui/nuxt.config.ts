// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  runtimeConfig: {
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE ?? process.env.API_INTERNAL_BASE ?? 'http://api:4000',
    coreApiInternalBase:
      process.env.NUXT_CORE_API_INTERNAL_BASE ??
      process.env.CORE_API_INTERNAL_BASE ??
      'http://platform-core:4100',
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
      websocketEnabled: process.env.NUXT_PUBLIC_WEBSOCKET_ENABLED === 'true'
    }
  },
  experimental: {
    watcher: 'parcel'
  },
  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 320
      }
    }
  },
  nitro: {
    routeRules: {
      '/admin/core': { redirect: '/admin/manage/clientes' },
      '/admin/core/cadastro': { redirect: '/admin/manage/clientes' },
      '/admin/core/login': { redirect: '/admin/login' }
    },
    experimental: {
      websocket: true
    },
    watchOptions: {
      usePolling: true,
      interval: 320,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 180
      }
    }
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false }
})
