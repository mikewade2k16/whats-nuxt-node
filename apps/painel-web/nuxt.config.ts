// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  css: ['~/assets/css/main.css', '~/assets/css/fila-atendimento-operation.css'],
  app: {
    head: {
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
        }
      ]
    }
  },
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  runtimeConfig: {
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE ?? process.env.API_INTERNAL_BASE ?? 'http://atendimento-online-api:4000',
    coreApiInternalBase:
      process.env.NUXT_CORE_API_INTERNAL_BASE ??
      process.env.CORE_API_INTERNAL_BASE ??
      'http://plataforma-api:4100',
    filaAtendimentoApiInternalBase:
      process.env.NUXT_FILA_ATENDIMENTO_API_INTERNAL_BASE ??
      process.env.FILA_ATENDIMENTO_API_INTERNAL_BASE ??
      'http://plataforma-api:4100/core/modules/fila-atendimento',
    filaAtendimentoWebInternalBase:
      process.env.NUXT_FILA_ATENDIMENTO_WEB_INTERNAL_BASE ??
      process.env.FILA_ATENDIMENTO_WEB_INTERNAL_BASE ??
      'http://painel-web:3000',
    filaAtendimentoShellBridgeSecret:
      process.env.NUXT_FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET ??
      process.env.FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET ??
      '',
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
      filaAtendimentoBase: process.env.NUXT_PUBLIC_FILA_ATENDIMENTO_BASE ?? 'http://localhost:3000',
      filaAtendimentoApiBase: process.env.NUXT_PUBLIC_FILA_ATENDIMENTO_API_BASE ?? 'http://localhost:3000/api/admin/modules/fila-atendimento',
      websocketUrl: process.env.NUXT_PUBLIC_WEBSOCKET_URL || '/ws/tenant',
      websocketEnabled: process.env.NUXT_PUBLIC_WEBSOCKET_ENABLED !== 'false'
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
