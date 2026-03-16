# Omnichannel MVP (Nuxt 4 + Node Stateless + Docker)

MVP multi-tenant de atendimento com:

- Frontend proprio em `Nuxt 4 + Nuxt UI`
- Backend `Node.js + TypeScript` stateless
- Core de plataforma em `Go` (`apps/platform-core`)
- Realtime com `Socket.IO + Redis adapter`
- Banco `PostgreSQL` (Prisma)
- Fila de envio `BullMQ + Redis`
- Webhook de entrada para WhatsApp nao-oficial (Evolution)

## Estrutura

```txt
.
|- apps/
|  |- api/     # API + worker + Prisma
|  |- platform-core/ # Core de plataforma (auth, limites, modulos)
|  |- omni-nuxt-ui/ # Front Nuxt 4 principal (painel + modulo omnichannel)
|  `- web/     # Front legado do modulo (referencia)
|- docs/       # documentacao tecnica e operacional
|- docker-compose.yml
`- .env.example
```

## Como rodar local (sem instalar Node no host)

1. Copie variaveis:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Suba os servicos:

```bash
docker compose up --build
```

O servico `web` roda em modo desenvolvimento (`npm run dev`) com hot reload.
Ao editar arquivos em `apps/omni-nuxt-ui`, o Nuxt aplica HMR automaticamente.
Na primeira abertura apos subir os containers, a compilacao inicial pode levar alguns segundos.

Observacoes de performance local (atualizadas em 2026-03-05):

- `api/worker/retention-worker/web` so executam `npm install` quando `node_modules` estiver vazio.
- O bootstrap de banco da API (`prisma:push` + `prisma:seed`) roda apenas no primeiro boot do volume.
- Para forcar bootstrap novamente: defina `API_DB_BOOTSTRAP_ALWAYS=true` no `.env`.
- Redis roda apenas na rede interna Docker (sem porta host), com limite de memoria via `REDIS_MAXMEMORY`.

3. Acesse:

- Front: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- Platform Core health: `http://localhost:4100/health`
- Front Core login: `http://localhost:3000/admin/core/login`
- Front Core cadastro: `http://localhost:3000/admin/core/cadastro`
- Front Auth login (omnichannel): `http://localhost:3000/admin/login`

## Credenciais seed (platform-core)

- Platform root (criar tenant): `root@core.local` / `123456`
- Demo owner: `admin@demo-core.local` / `123456`
- Demo agent: `agent@demo-core.local` / `123456`

## Credenciais seed (tenant demo)

- Tenant: `demo`
- Admin: `admin@demo.local`
- Agente: `agente@demo.local`
- Senha: `123456`

## Credenciais seed (tenant acme)

- Tenant: `acme`
- Admin: `admin@acme.local`
- Agente: `agente@acme.local`
- Senha: `123456`

## Fluxo MVP implementado

- Login multi-tenant (`/auth/login`)
- Perfil do usuario logado (`/me`)
- Gestao de tenant (`GET/PATCH /tenant`)
- Gestao de usuarios do tenant (`GET/POST/PATCH /users`)
- Conexao WhatsApp por QR (`GET /tenant/whatsapp/qrcode`, `POST /tenant/whatsapp/connect`)
- Lista de conversas por tenant (`/conversations`)
- Criacao de conversa para testes (`POST /conversations`)
- Visualizar mensagens (`GET /conversations/:id/messages`)
- Responder pela plataforma (`POST /conversations/:id/messages`) com suporte a texto e midia
- Atribuicao e status da conversa (`PATCH /conversations/:id/assign`, `PATCH /conversations/:id/status`)
- Worker de envio outbound via fila Redis
- Worker dedicado de retencao por tenant (expurgo diario por `retentionDays`)
- Realtime por tenant com Socket.IO
- Webhook inbound de WhatsApp (`POST /webhooks/evolution/:tenantSlug`)

## Integracao Evolution (outbound)

Para ativar envio real para WhatsApp via Evolution:

- Defina no `.env`:
  - `API_BODY_LIMIT_MB` (padrao `80`, aumenta limite de payload para webhook de midia base64)
  - `EVOLUTION_BASE_URL`
  - `EVOLUTION_API_KEY`
  - `EVOLUTION_IMAGE` (recomendado: `evoapicloud/evolution-api:v2.3.7`)
  - `EVOLUTION_CONFIG_SESSION_PHONE_VERSION`
  - `EVOLUTION_DATABASE_URL`
  - `EVOLUTION_SEND_PATH` (padrao: `/message/sendText/:instance`)
  - `EVOLUTION_SEND_MEDIA_PATH` (padrao: `/message/sendMedia/:instance`)
  - `EVOLUTION_SEND_AUDIO_PATH` (padrao: `/message/sendWhatsAppAudio/:instance`)
  - `EVOLUTION_SEND_STICKER_PATH` (padrao: `/message/sendSticker/:instance`)
  - `EVOLUTION_SEND_REACTION_PATH` (padrao: `/message/sendReaction/:instance`)
  - `EVOLUTION_REQUEST_TIMEOUT_MS` (padrao `90000` para uploads midia/audio maiores)
  - `EVOLUTION_DEFAULT_INSTANCE`
  - `EVOLUTION_WEBHOOK_TOKEN`
  - `WEBHOOK_RECEIVER_BASE_URL` (ex.: `http://api:4000` no docker interno ou URL publica da API)
  - `NUXT_GIF_PROVIDER` (padrao: `tenor`)
  - `NUXT_TENOR_API_KEY` (obrigatorio para busca de GIF no composer)
  - `NUXT_TENOR_BASE_URL` (padrao: `https://tenor.googleapis.com/v2`)
- Opcional: salve `whatsappInstance` e `evolutionApiKey` por tenant no banco para multi-instancia.

Se `EVOLUTION_BASE_URL` estiver vazio, o worker marca mensagens outbound como `SENT` em modo simulacao.

## Retencao de historico por tenant

- Variaveis no `.env`:
  - `RETENTION_SWEEP_ON_BOOT` (default `true`)
  - `RETENTION_SWEEP_INTERVAL_MINUTES` (default `1440`)
- O servico `retention-worker` executa expurgo com base em `tenant.retentionDays`.
- Expurgo remove mensagens antigas e conversas vazias antigas.

## Painel admin (omnichannel)

- URL: `http://localhost:3000/admin/omnichannel/operacao`
- Disponivel para usuarios `ADMIN`
- Permite:
  - atualizar dados do tenant
  - criar usuarios (ADMIN/AGENT)
  - bootstrap da instancia WhatsApp via Evolution
  - consultar status da conexao/webhook da instancia

## Servico Evolution no compose

`docker-compose.yml` inclui um servico `evolution` no profile `channels`.

Para subir com ele:

```bash
docker compose --profile channels up --build
```

## Testes automatizados

### Front (composables)

```bash
cd apps/omni-nuxt-ui
npm run test:composables
```

Obs: se o script de testes ainda nao estiver disponivel no front final, execute no legado `apps/web` ate concluir a migracao.

### Bateria de midia (API/worker/fila)

Comando:

```bash
cd apps/api
npm run test:media:battery
```

Comportamento:

1. Sem `BATTERY_DESTINATION_EXTERNAL_ID`, roda em destino invalido controlado para validar pipeline sem disparo real.
2. Com `BATTERY_DESTINATION_EXTERNAL_ID`, valida entrega em destino de homologacao.

### Auditoria de isolamento por tenant (seguranca)

Comando:

```bash
cd apps/api
npm run test:tenant:isolation
```

O script valida acesso cruzado entre os tenants `demo` e `acme` e falha com exit code quando detectar quebra de isolamento.

## Documentacao detalhada

- Guia geral: `docs/README.md`
- Arquitetura: `docs/architecture.md`
- Referencia de rotas/API: `docs/api-reference.md`
- Core de plataforma (Go): `apps/platform-core/README.md`
- Setup Evolution: `docs/evolution-setup.md`
- Troubleshooting: `docs/troubleshooting.md`
- Modelo atual de dados: `docs/data-model-current.md`
- Modelo alvo de dados (escala): `docs/data-model-target.md`
