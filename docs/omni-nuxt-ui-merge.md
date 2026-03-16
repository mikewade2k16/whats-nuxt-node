# Fusao Omni Nuxt UI + Modulo Omnichannel

Ultima atualizacao: 2026-03-04

## Objetivo

Consolidar o front no projeto `apps/omni-nuxt-ui` e manter o omnichannel como modulo plugavel dentro do mesmo painel, com backend operacional separado em `apps/api`.

## Resultado da fusao (fase atual)

- [x] Front principal definido como `apps/omni-nuxt-ui`.
- [x] Modulo omnichannel copiado para `apps/omni-nuxt-ui/app/components/omnichannel`.
- [x] Composables omnichannel copiados para `apps/omni-nuxt-ui/app/composables/omnichannel`.
- [x] Store/composables de auth do modulo adicionados ao front principal.
- [x] Rotas do modulo padronizadas em namespace `admin/omnichannel`.
- [x] Proxy BFF (`/api/bff/*`) e APIs auxiliares de docs/gif adicionadas ao `omni-nuxt-ui`.
- [x] Menu do layout admin atualizado com entrada `Omnichannel`.
- [x] Build de validacao executado com sucesso em `apps/omni-nuxt-ui`.
- [x] Limpeza estrutural concluida (remocao de duplicados na raiz e artefatos temporarios).
- [x] `docker-compose` ajustado para desenvolvimento com hot reload no servico `web`.

## Mapa de rotas do modulo

- Login unico do painel: `/admin/login`
- Inbox: `/admin/omnichannel/inbox`
- Operacao (admin WhatsApp): `/admin/omnichannel/operacao`
- Docs operacionais: `/admin/omnichannel/docs`
- Atalho base: `/admin/omnichannel` (redireciona para inbox)
- Rotas legadas removidas: `/admin/omnichannel/login` e `/auth/*`.

## Arquivos principais adicionados/mesclados

### Front

- `apps/omni-nuxt-ui/app/components/omnichannel/*`
- `apps/omni-nuxt-ui/app/components/docs/ProjectDocsModule.vue`
- `apps/omni-nuxt-ui/app/composables/omnichannel/*`
- `apps/omni-nuxt-ui/app/composables/docs/useProjectDocs.ts`
- `apps/omni-nuxt-ui/app/composables/useApi.ts`
- `apps/omni-nuxt-ui/app/composables/useAuth.ts`
- `apps/omni-nuxt-ui/app/stores/auth.ts`
- `apps/omni-nuxt-ui/app/types/index.ts`
- `apps/omni-nuxt-ui/app/middleware/omnichannel-auth.ts`
- `apps/omni-nuxt-ui/app/pages/admin/omnichannel/*`

### Server Nuxt (BFF/auxiliares do modulo)

- `apps/omni-nuxt-ui/server/api/bff/[...path].ts`
- `apps/omni-nuxt-ui/server/api/docs/index.get.ts`
- `apps/omni-nuxt-ui/server/api/docs/[slug].get.ts`
- `apps/omni-nuxt-ui/server/api/gif/search.get.ts`
- `apps/omni-nuxt-ui/server/api/gif/media.get.ts`
- `apps/omni-nuxt-ui/server/utils/project-docs.ts`

### Configuracao

- `apps/omni-nuxt-ui/nuxt.config.ts`
  - runtime keys adicionadas: `apiInternalBase`, `gifProvider`, `tenorApiKey`, `tenorBaseUrl`, `public.apiBase`
- `apps/omni-nuxt-ui/package.json`
  - deps adicionadas: `socket.io-client`, `markdown-it`, `@emoji-mart/data`
- `apps/omni-nuxt-ui/app/layouts/admin.vue`
  - menu `Omnichannel` integrado

## Backend separado (mantido)

- API operacional do modulo continua em `apps/api` (Node/Fastify + worker/redis/postgres).
- O front chama o backend do modulo via:
  - navegador -> `/api/bff/*` no Nuxt
  - BFF -> `NUXT_API_INTERNAL_BASE` (default `http://api:4000`)

## Variaveis relevantes

- `NUXT_PUBLIC_API_BASE` (browser/realtime do omnichannel)
- `NUXT_API_INTERNAL_BASE` (BFF do Nuxt para backend `apps/api`)
- `NUXT_GIF_PROVIDER` (default `tenor`)
- `NUXT_TENOR_API_KEY` (opcional, GIF)
- `NUXT_TENOR_BASE_URL` (default `https://tenor.googleapis.com/v2`)

## Operacao em desenvolvimento (watch)

- O servico `web` roda em `npm run dev` com HMR.
- Alteracoes em `apps/omni-nuxt-ui` refletem automaticamente no navegador.
- A primeira compilacao apos subir/reiniciar o container pode ser mais lenta; depois estabiliza.

## Como levar para outro projeto (modulo plugavel)

1. Copiar pasta `app/components/omnichannel` e `app/composables/omnichannel`.
2. Copiar `app/composables/useApi.ts`, `app/composables/useAuth.ts`, `app/stores/auth.ts`, `app/types/index.ts`.
3. Copiar rotas wrapper de `app/pages/admin/omnichannel`.
4. Copiar middleware `app/middleware/omnichannel-auth.ts`.
5. Copiar server routes: `server/api/bff`, `server/api/gif`, `server/api/docs` e `server/utils/project-docs.ts`.
6. Aplicar runtime config/deps no `nuxt.config.ts` e `package.json`.
7. Incluir item de menu para `Omnichannel` no layout admin do projeto host.

## Pendencias da fase seguinte

- [ ] Extrair pacote interno `modules/omnichannel-ui` (sem copia manual de arquivos).
- [ ] Publicar contrato de interfaces para provider (Evolution/oficial/alternativos).
- [x] Alinhar auth do modulo com auth global do painel (evitar sessao paralela).
- [ ] Revisar rotas legacy em `apps/web` para deprecacao controlada.
