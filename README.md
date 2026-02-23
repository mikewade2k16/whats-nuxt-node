# Omnichannel MVP (Nuxt 4 + Node Stateless + Docker)

MVP multi-tenant de atendimento com:

- Frontend proprio em `Nuxt 4 + Nuxt UI`
- Backend `Node.js + TypeScript` stateless
- Realtime com `Socket.IO + Redis adapter`
- Banco `PostgreSQL` (Prisma)
- Fila de envio `BullMQ + Redis`
- Webhook de entrada para WhatsApp nao-oficial (Evolution)

## Estrutura

```txt
.
|- apps/
|  |- api/     # API + worker + Prisma
|  `- web/     # Front Nuxt 4
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

3. Acesse:

- Front: `http://localhost:3000`
- API health: `http://localhost:4000/health`

## Credenciais seed (tenant demo)

- Tenant: `demo`
- Admin: `admin@demo.local`
- Agente: `agente@demo.local`
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
- Responder pela plataforma (`POST /conversations/:id/messages`)
- Atribuicao e status da conversa (`PATCH /conversations/:id/assign`, `PATCH /conversations/:id/status`)
- Worker de envio outbound via fila Redis
- Realtime por tenant com Socket.IO
- Webhook inbound de WhatsApp (`POST /webhooks/evolution/:tenantSlug`)

## Integracao Evolution (outbound)

Para ativar envio real para WhatsApp via Evolution:

- Defina no `.env`:
  - `EVOLUTION_BASE_URL`
  - `EVOLUTION_API_KEY`
  - `EVOLUTION_IMAGE` (recomendado: `evoapicloud/evolution-api:v2.3.7`)
  - `EVOLUTION_CONFIG_SESSION_PHONE_VERSION`
  - `EVOLUTION_DATABASE_URL`
  - `EVOLUTION_SEND_PATH` (padrao: `/message/sendText/:instance`)
  - `EVOLUTION_DEFAULT_INSTANCE`
  - `EVOLUTION_WEBHOOK_TOKEN`
  - `WEBHOOK_RECEIVER_BASE_URL` (ex.: `http://api:4000` no docker interno ou URL publica da API)
- Opcional: salve `whatsappInstance` e `evolutionApiKey` por tenant no banco para multi-instancia.

Se `EVOLUTION_BASE_URL` estiver vazio, o worker marca mensagens outbound como `SENT` em modo simulacao.

## Painel admin

- URL: `http://localhost:3000/admin`
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

## Documentacao detalhada

- Guia geral: `docs/README.md`
- Arquitetura: `docs/architecture.md`
- Referencia de rotas/API: `docs/api-reference.md`
- Setup Evolution: `docs/evolution-setup.md`
- Troubleshooting: `docs/troubleshooting.md`
- Modelo atual de dados: `docs/data-model-current.md`
- Modelo alvo de dados (escala): `docs/data-model-target.md`
