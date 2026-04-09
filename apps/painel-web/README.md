# Painel Web

Frontend principal em Nuxt 4 para o painel admin e o modulo de atendimento online.

## Auth e rotas do painel

Rotas implementadas:

- `GET /admin/login` (login unico do painel, tenant-based)
- `GET /admin` (home do painel omnichannel, protegido)
- `GET /admin/omnichannel/inbox` (atendimento, protegido)
- `GET /admin/omnichannel/auditoria` (auditoria do atendimento, protegido)

Atalhos ativos:

1. `/`
2. `/login`

Rotas legadas removidas (nao usar):

1. `/auth/*`
2. `/admin/omnichannel/login`

Fluxo do painel:

1. Login do painel via `POST /api/core-bff/core/auth/login`
2. O `plataforma-api` emite a sessao canonica do painel e o shell a ancora por cookie `HttpOnly`
3. Middleware global `admin-auth.global` protege todo namespace `/admin/**` (exceto `/admin/login`)
4. O modulo de atendimento reutiliza essa mesma sessao e nao possui auth/login proprio no painel
5. A conexao WhatsApp agora nasce dentro do proprio inbox; `operacao` e `docs` antigos apenas redirecionam

## Gestao centralizada no core Go

Rotas:

1. `GET /admin/manage/clientes`
2. `GET /admin/manage/users`
3. `ALL /api/core-bff/**`
4. `ALL /api/admin/clients*` e `ALL /api/admin/users*` (agora proxy para `plataforma-api`)

Fluxo:

1. Credenciais sao validadas primeiro no `plataforma-api`
2. O front mantem o estado da sessao em memoria e o shell usa cookie `HttpOnly` como persistencia canônica
3. Paginas de manage usam sessao core via `useBffFetch()` (`x-core-token`) e persistem direto no banco do `plataforma-api`

## Variaveis de ambiente

- `NUXT_API_INTERNAL_BASE` (proxy para `apps/atendimento-online-api`)
- `NUXT_CORE_API_INTERNAL_BASE` (proxy para `apps/plataforma-api`, default `http://plataforma-api:4100`)
- `NUXT_PUBLIC_API_BASE` (base publica, usada por partes do front)

## Desenvolvimento

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Com Docker Compose, o servico `painel-web` ja sobe com hot reload.

## Testes

```bash
npm run test:composables
```

Suite atual:

- `tests/composables/useOmnichannelAdmin.spec.ts`
- `tests/composables/useOmnichannelInbox.spec.ts`
