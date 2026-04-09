# Fusao Omni Nuxt UI + Modulo Omnichannel

Ultima atualizacao: 2026-03-04

## Objetivo

Consolidar o front no projeto `apps/painel-web` e manter o omnichannel como modulo plugavel dentro do mesmo painel, com backend operacional separado em `apps/atendimento-online-api`.

## Resultado da fusao (fase atual)

- [x] Front principal definido como `apps/painel-web`.
- [x] Modulo omnichannel copiado para `apps/painel-web/app/components/omnichannel`.
- [x] Composables omnichannel copiados para `apps/painel-web/app/composables/omnichannel`.
- [x] Store/composables de auth do modulo adicionados ao front principal.
- [x] Rotas do modulo padronizadas em namespace `admin/omnichannel`.
- [x] Proxy BFF (`/api/bff/*`) e APIs auxiliares de docs/gif adicionadas ao `painel-web`.
- [x] Menu do layout admin atualizado com entrada `Omnichannel`.
- [x] Build de validacao executado com sucesso em `apps/painel-web`.
- [x] Limpeza estrutural concluida (remocao de duplicados na raiz e artefatos temporarios).
- [x] `docker-compose` ajustado para desenvolvimento com hot reload no servico `painel-web`.

## Mapa de rotas do modulo

- Login unico do painel: `/admin/login`
- Inbox: `/admin/omnichannel/inbox`
- Operacao (admin WhatsApp): `/admin/omnichannel/operacao`
- Docs operacionais: `/admin/omnichannel/docs`
- Atalho base: `/admin/omnichannel` (redireciona para inbox)
- Rotas legadas removidas: `/admin/omnichannel/login` e `/auth/*`.

## Arquivos principais adicionados/mesclados

### Front

- `apps/painel-web/app/components/omnichannel/*`
- `apps/painel-web/app/components/docs/ProjectDocsModule.vue`
- `apps/painel-web/app/composables/omnichannel/*`
- `apps/painel-web/app/composables/docs/useProjectDocs.ts`
- `apps/painel-web/app/composables/useApi.ts`
- `apps/painel-web/app/composables/useAuth.ts`
- `apps/painel-web/app/stores/auth.ts`
- `apps/painel-web/app/types/index.ts`
- `apps/painel-web/app/middleware/omnichannel-auth.ts`
- `apps/painel-web/app/pages/admin/omnichannel/*`

### Server Nuxt (BFF/auxiliares do modulo)

- `apps/painel-web/server/api/bff/[...path].ts`
- `apps/painel-web/server/api/docs/index.get.ts`
- `apps/painel-web/server/api/docs/[slug].get.ts`
- `apps/painel-web/server/api/gif/search.get.ts`
- `apps/painel-web/server/api/gif/media.get.ts`
- `apps/painel-web/server/utils/project-docs.ts`

### Configuracao

- `apps/painel-web/nuxt.config.ts`
  - runtime keys adicionadas: `apiInternalBase`, `gifProvider`, `tenorApiKey`, `tenorBaseUrl`, `public.apiBase`
- `apps/painel-web/package.json`
  - deps adicionadas: `socket.io-client`, `markdown-it`, `@emoji-mart/data`
- `apps/painel-web/app/layouts/admin.vue`
  - menu `Omnichannel` integrado

## Backend separado (mantido)

- API operacional do modulo continua em `apps/atendimento-online-api` (Node/Fastify + worker/redis/postgres).
- O front chama o backend do modulo via:
  - navegador -> `/api/bff/*` no Nuxt
  - BFF -> `NUXT_API_INTERNAL_BASE` (default `http://atendimento-online-api:4000`)

## Variaveis relevantes

- `NUXT_PUBLIC_API_BASE` (browser/realtime do omnichannel)
- `NUXT_API_INTERNAL_BASE` (BFF do Nuxt para backend `apps/atendimento-online-api`)
- `NUXT_GIF_PROVIDER` (default `tenor`)
- `NUXT_TENOR_API_KEY` (opcional, GIF)
- `NUXT_TENOR_BASE_URL` (default `https://tenor.googleapis.com/v2`)

## Operacao em desenvolvimento (watch)

- O servico `painel-web` roda em `npm run dev` com HMR.
- Alteracoes em `apps/painel-web` refletem automaticamente no navegador.
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
- [x] Revisar referencias restantes do front legado; `old_web` foi removido do repositorio em `2026-04-04`.
