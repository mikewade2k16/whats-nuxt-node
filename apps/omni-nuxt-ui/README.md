# Omni Nuxt UI

Frontend principal em Nuxt 4 para painel admin e modulo omnichannel.

## Auth e rotas do painel

Rotas implementadas:

- `GET /admin/login` (login unico do painel, tenant-based)
- `GET /admin` (home do painel omnichannel, protegido)
- `GET /admin/omnichannel/inbox` (atendimento, protegido)
- `GET /admin/omnichannel/operacao` (operacao, protegido)
- `GET /admin/omnichannel/docs` (docs, protegido)

Atalhos ativos:

1. `/`
2. `/login`

Rotas legadas removidas (nao usar):

1. `/auth/*`
2. `/admin/omnichannel/login`

Fluxo do painel:

1. Login via `POST /api/bff/auth/login`
2. Token salvo em `localStorage` (`omni:token`, `omni:user`)
3. Sessao core tambem e hidratada no login (`core:token`, `core:user`) para chamadas internas de gestao
4. Middleware global `admin-auth.global` protege todo namespace `/admin/**` (exceto `/admin/login`)
4. O modulo de atendimento reutiliza essa mesma sessao e nao possui auth/login proprio

## Gestao centralizada no core Go

Rotas:

1. `GET /admin/manage/clientes`
2. `GET /admin/manage/users`
3. `ALL /api/core-bff/**`
4. `ALL /api/admin/clients*` e `ALL /api/admin/users*` (agora proxy para `platform-core`)

Fluxo:

1. Login unico via `POST /api/bff/auth/login` (credenciais validadas no `platform-core`)
2. Front salva sessao do painel (`omni:*`) e sessao do core (`core:*`) no mesmo fluxo
3. Paginas de manage usam sessao core via `useBffFetch()` (`x-core-token`) e persistem direto no banco do `platform-core`

## Variaveis de ambiente

- `NUXT_API_INTERNAL_BASE` (proxy para `apps/api`)
- `NUXT_CORE_API_INTERNAL_BASE` (proxy para `apps/platform-core`, default `http://platform-core:4100`)
- `NUXT_PUBLIC_API_BASE` (base publica, usada por partes do front)

## Desenvolvimento

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Com Docker Compose, o servico `web` ja sobe com hot reload.
