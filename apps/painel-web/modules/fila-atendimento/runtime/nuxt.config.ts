import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const moduleRoot = dirname(runtimeRoot)
const runtimeAppRoot = resolve(runtimeRoot, 'app')
const moduleServerRoot = resolve(moduleRoot, 'server')

export default defineNuxtConfig({
  alias: {
    '~/components/fila-atendimento': resolve(runtimeAppRoot, 'components/fila-atendimento'),
    '~/components/admin/modules/FilaAtendimentoHost.vue': resolve(runtimeAppRoot, 'components/fila-atendimento/FilaAtendimentoHost.vue'),
    '~/composables/fila-atendimento': resolve(runtimeAppRoot, 'composables/fila-atendimento'),
    '~/stores/fila-atendimento': resolve(runtimeAppRoot, 'stores/fila-atendimento'),
    '~/types/fila-atendimento': resolve(runtimeAppRoot, 'types/fila-atendimento.ts'),
    '~/utils/fila-atendimento': resolve(runtimeAppRoot, 'utils/fila-atendimento'),
    '@fila-atendimento/server': moduleServerRoot
  },
  runtimeConfig: {
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
    public: {
      filaAtendimentoBase:
        process.env.NUXT_PUBLIC_FILA_ATENDIMENTO_BASE ??
        'http://localhost:3000',
      filaAtendimentoApiBase:
        process.env.NUXT_PUBLIC_FILA_ATENDIMENTO_API_BASE ??
        'http://localhost:3000/api/admin/modules/fila-atendimento'
    }
  },
  nitro: {
    scanDirs: [moduleServerRoot],
    alias: {
      '@fila-atendimento/server': moduleServerRoot
    }
  }
})