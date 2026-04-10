# apps/atendimento-online-api Ã¢â‚¬â€ MÃƒÂ³dulo de Atendimento (Node.js / Fastify)

Backend do **mÃƒÂ³dulo de atendimento omnichannel**: conversas, mensagens, contatos, WhatsApp via Evolution API, webhooks e workers de envio.

**Porta:** `4000`
**Schema PostgreSQL:** `public` (Prisma ORM)
**Runtime:** Node.js 20+ com TypeScript

---

## Contexto no Projeto

```
Frontend (Nuxt 4)
  Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ BFF (Nuxt server/api)
        Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ plataforma-api :4100   Ã¢â€ â€™ auth, tenants, finance, admin
        Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ apps/atendimento-online-api :4000        Ã¢â€ Â VOCÃƒÅ  ESTÃƒÂ AQUI
              Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ PostgreSQL (public schema, Prisma)
              Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Redis (filas BullMQ)
              Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ Evolution API :8080 (WhatsApp)
```

Este serviÃƒÂ§o ÃƒÂ© **independente do plataforma-api** para funcionar, mas consome sua API para:
- Validar tokens JWT na autenticaÃƒÂ§ÃƒÂ£o (via `platformCoreClient`)
- Sincronizar tenants e usuÃƒÂ¡rios no login (`ensureLocalTenant`, `ensureLocalUser`)
- Verificar acesso ao mÃƒÂ³dulo de atendimento (`resolveCoreAtendimentoAccessByEmail`)

---

## MÃƒÂ³dulos / Grupos de Rotas

### Auth (`src/routes/auth.ts`)
- Login principal do painel e do host centralizado em `POST /core/auth/login` no `plataforma-api`
- `POST /session/context` Ã¢â‚¬â€ Atualizacao de contexto operacional para platform admins

### Conversas (`src/routes/conversations/`)
Rotas do mÃƒÂ³dulo de atendimento agrupadas por responsabilidade:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes-core-sync-open.ts` | Abrir/criar conversa via sync com plataforma-api |
| `routes-message-write*.ts` | Enviar mensagens (texto, mÃƒÂ­dia, ÃƒÂ¡udio, sticker) |
| `routes-message-read*.ts` | Ler/listar mensagens |
| `routes-message-actions.ts` | AÃƒÂ§ÃƒÂµes em mensagens (deletar, reagir, encaminhar) |
| `routes-operational*.ts` | OperaÃƒÂ§ÃƒÂµes de conversa (fechar, atribuir, status) |
| `routes-group.ts` | Grupos WhatsApp |

Prefixo base: `/conversations`

### Tenant (`src/routes/tenant/`)
ConfiguraÃƒÂ§ÃƒÂµes de instÃƒÂ¢ncias WhatsApp e integraÃƒÂ§ÃƒÂµes por tenant.

| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes-whatsapp.ts` | CRUD de instÃƒÂ¢ncias WhatsApp |
| `routes-whatsapp-qrcode.ts` | QR code de conexÃƒÂ£o |
| `routes-whatsapp-session.ts` | Gerenciamento de sessÃƒÂ£o WhatsApp |
| `routes-whatsapp-status.ts` | Status de conexÃƒÂ£o |
| `routes-clients.ts` | Dados de clientes/tenants |

Prefixo base: `/tenant`

### Webhooks (`src/routes/webhooks/`)
Recebe eventos da Evolution API (WhatsApp) e os processa.

| Arquivo | Responsabilidade |
|---------|-----------------|
| `handlers/message-upsert/` | Processamento de mensagens recebidas |
| `handlers/message-update.ts` | AtualizaÃƒÂ§ÃƒÂµes de mensagens (lida, enviada, etc.) |
| `handlers/reaction.ts` | ReaÃƒÂ§ÃƒÂµes em mensagens |
| `handlers/qr.ts` | Eventos de QR code |

Prefixo base: `/webhooks`

### Admin (`src/routes/admin.ts`)
Rotas administrativas do mÃƒÂ³dulo de atendimento.

### Outros
- `GET /health` Ã¢â‚¬â€ Health check
- `/contacts` Ã¢â‚¬â€ CRUD de contatos
- `/stickers` Ã¢â‚¬â€ Gerenciamento de stickers

---

## Banco de Dados (Prisma / schema `public`)

Tabelas principais (PascalCase = convenÃƒÂ§ÃƒÂ£o Prisma):

| Tabela | Uso |
|--------|-----|
| `Tenant` | Tenant local sincronizado do plataforma-api |
| `User` | UsuÃƒÂ¡rio local sincronizado do plataforma-api |
| `Conversation` | Conversa omnichannel (WhatsApp, etc.) |
| `Message` | Mensagem individual |
| `Contact` | Contato de WhatsApp |
| `WhatsAppInstance` | InstÃƒÂ¢ncia WhatsApp conectada |
| `WhatsAppInstanceUserAccess` | Controle de acesso por instÃƒÂ¢ncia |
| `AuditEvent` | Auditoria de aÃƒÂ§ÃƒÂµes |

Schema: `apps/atendimento-online-api/prisma/schema.prisma`

---

## Workers AssÃƒÂ­ncronos

### Outbound Worker (`src/workers/outbound-worker.ts`)
- Processa fila BullMQ de mensagens a enviar
- Chama Evolution API para envio real
- Lida com retry, timeout e fallback

### Retention Worker (`src/workers/retention-worker.ts`)
- Limpa dados antigos conforme polÃƒÂ­tica de retenÃƒÂ§ÃƒÂ£o
- Roda em intervalo configurÃƒÂ¡vel (`RETENTION_SWEEP_INTERVAL_MINUTES`)

---

## ServiÃƒÂ§os Auxiliares

| Arquivo | Responsabilidade |
|---------|-----------------|
| `services/evolution-client.ts` | Cliente HTTP para Evolution API (WhatsApp) |
| `services/core-client.ts` | Cliente HTTP para plataforma-api (service account) |
| `services/core-atendimento-access.ts` | Cache de permissÃƒÂµes de acesso ao atendimento |
| `services/whatsapp-instances.ts` | Gerenciamento de instÃƒÂ¢ncias WhatsApp |
| `services/whatsapp-qr-cache.ts` | Cache de QR codes |
| `services/core-identity.ts` | Mapeamento de roles core Ã¢â€ â€ legacy |
| `services/audit-log.ts` | Registro de eventos de auditoria |
| `services/upload-policy.ts` | PolÃƒÂ­ticas de upload de mÃƒÂ­dia |

---

## VariÃƒÂ¡veis de Ambiente Principais

| VariÃƒÂ¡vel | PadrÃƒÂ£o | DescriÃƒÂ§ÃƒÂ£o |
|----------|--------|-----------|
| `DATABASE_URL` | Ã¢â‚¬â€ | PostgreSQL connection string |
| `REDIS_URL` | Ã¢â‚¬â€ | Redis URL |
| `CORE_API_BASE_URL` | `http://plataforma-api:4100` | URL do plataforma-api |
| `CORE_API_EMAIL` | `root@core.local` | Service account email |
| `CORE_API_PASSWORD` | `123456` | Service account password |
| `EVOLUTION_BASE_URL` | Ã¢â‚¬â€ | URL da Evolution API |
| `EVOLUTION_API_KEY` | Ã¢â‚¬â€ | API key da Evolution |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `PORT` | `4000` | Porta de escuta |

---

## Rodar Localmente

```bash
cd apps/atendimento-online-api
npm install
npx prisma migrate dev   # aplicar migrations Prisma
npm run dev              # modo desenvolvimento com watch
```

---

## PadrÃƒÂ£o de AutenticaÃƒÂ§ÃƒÂ£o

O token principal ÃƒÂ© **emitido pelo `plataforma-api`** e reutilizado pelo `apps/atendimento-online-api`.
Rotas protegidas usam o plugin `src/plugins/auth.ts` para validar o token do core e resolver o contexto operacional local.

```typescript
// Em route handlers:
await app.authenticate(request, reply)
// request.coreAccessToken = token emitido pelo plataforma-api
// request.authUser = contexto operacional local resolvido a partir do core
```

O contexto operacional local continua existindo para IDs internos do schema `public`, mas o token principal e o mesmo `coreAccessToken` usado pelo browser para chamar o `plataforma-api`.

---

## RelaÃƒÂ§ÃƒÂ£o com plataforma-api

```
Login flow:
  1. apps/atendimento-online-api recebe email + password
  2. Chama platformCoreClient.loginUser() Ã¢â€ â€™ autentica no plataforma-api
  3. Sincroniza tenant e usuÃƒÂ¡rio local (ensureLocalTenant, ensureLocalUser)
  4. Repassa o `coreAccessToken` ao browser e devolve o contexto operacional local no payload

Durante uso:
  - Fastify usa o token do `plataforma-api` para autorizar rotas
  - browser usa o mesmo `coreAccessToken` para chamadas diretas ao plataforma-api (via core-bff)
  - apps/atendimento-online-api usa service account (CORE_API_EMAIL/PASSWORD) para chamadas admin ao plataforma-api
```
