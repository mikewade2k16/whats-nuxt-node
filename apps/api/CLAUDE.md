# apps/api — Módulo de Atendimento (Node.js / Fastify)

Backend do **módulo de atendimento omnichannel**: conversas, mensagens, contatos, WhatsApp via Evolution API, webhooks e workers de envio.

**Porta:** `4000`
**Schema PostgreSQL:** `public` (Prisma ORM)
**Runtime:** Node.js 20+ com TypeScript

---

## Contexto no Projeto

```
Frontend (Nuxt 4)
  └── BFF (Nuxt server/api)
        ├── platform-core :4100   → auth, tenants, finance, admin
        └── apps/api :4000        ← VOCÊ ESTÁ AQUI
              ├── PostgreSQL (public schema, Prisma)
              ├── Redis (filas BullMQ)
              └── Evolution API :8080 (WhatsApp)
```

Este serviço é **independente do platform-core** para funcionar, mas consome sua API para:
- Validar tokens JWT na autenticação (via `platformCoreClient`)
- Sincronizar tenants e usuários no login (`ensureLocalTenant`, `ensureLocalUser`)
- Verificar acesso ao módulo de atendimento (`resolveCoreAtendimentoAccessByEmail`)

---

## Módulos / Grupos de Rotas

### Auth (`src/routes/auth.ts`)
- `POST /auth/login` — Login unificado: valida no platform-core + sincroniza local
- `POST /auth/switch-tenant` — Troca de tenant para platform admins

### Conversas (`src/routes/conversations/`)
Rotas do módulo de atendimento agrupadas por responsabilidade:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes-core-sync-open.ts` | Abrir/criar conversa via sync com platform-core |
| `routes-message-write*.ts` | Enviar mensagens (texto, mídia, áudio, sticker) |
| `routes-message-read*.ts` | Ler/listar mensagens |
| `routes-message-actions.ts` | Ações em mensagens (deletar, reagir, encaminhar) |
| `routes-operational*.ts` | Operações de conversa (fechar, atribuir, status) |
| `routes-group.ts` | Grupos WhatsApp |

Prefixo base: `/conversations`

### Tenant (`src/routes/tenant/`)
Configurações de instâncias WhatsApp e integrações por tenant.

| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes-whatsapp.ts` | CRUD de instâncias WhatsApp |
| `routes-whatsapp-qrcode.ts` | QR code de conexão |
| `routes-whatsapp-session.ts` | Gerenciamento de sessão WhatsApp |
| `routes-whatsapp-status.ts` | Status de conexão |
| `routes-clients.ts` | Dados de clientes/tenants |
| `routes-atendimento-users.ts` | Usuários com acesso ao atendimento |

Prefixo base: `/tenant`

### Webhooks (`src/routes/webhooks/`)
Recebe eventos da Evolution API (WhatsApp) e os processa.

| Arquivo | Responsabilidade |
|---------|-----------------|
| `handlers/message-upsert/` | Processamento de mensagens recebidas |
| `handlers/message-update.ts` | Atualizações de mensagens (lida, enviada, etc.) |
| `handlers/reaction.ts` | Reações em mensagens |
| `handlers/qr.ts` | Eventos de QR code |

Prefixo base: `/webhooks`

### Admin (`src/routes/admin.ts`)
Rotas administrativas do módulo de atendimento.

### Outros
- `GET /health` — Health check
- `/contacts` — CRUD de contatos
- `/stickers` — Gerenciamento de stickers

---

## Banco de Dados (Prisma / schema `public`)

Tabelas principais (PascalCase = convenção Prisma):

| Tabela | Uso |
|--------|-----|
| `Tenant` | Tenant local sincronizado do platform-core |
| `User` | Usuário local sincronizado do platform-core |
| `Conversation` | Conversa omnichannel (WhatsApp, etc.) |
| `Message` | Mensagem individual |
| `Contact` | Contato de WhatsApp |
| `WhatsAppInstance` | Instância WhatsApp conectada |
| `WhatsAppInstanceUserAccess` | Controle de acesso por instância |
| `AuditEvent` | Auditoria de ações |

Schema: `apps/api/prisma/schema.prisma`

---

## Workers Assíncronos

### Outbound Worker (`src/workers/outbound-worker.ts`)
- Processa fila BullMQ de mensagens a enviar
- Chama Evolution API para envio real
- Lida com retry, timeout e fallback

### Retention Worker (`src/workers/retention-worker.ts`)
- Limpa dados antigos conforme política de retenção
- Roda em intervalo configurável (`RETENTION_SWEEP_INTERVAL_MINUTES`)

---

## Serviços Auxiliares

| Arquivo | Responsabilidade |
|---------|-----------------|
| `services/evolution-client.ts` | Cliente HTTP para Evolution API (WhatsApp) |
| `services/core-client.ts` | Cliente HTTP para platform-core (service account) |
| `services/core-atendimento-access.ts` | Cache de permissões de acesso ao atendimento |
| `services/whatsapp-instances.ts` | Gerenciamento de instâncias WhatsApp |
| `services/whatsapp-qr-cache.ts` | Cache de QR codes |
| `services/core-identity.ts` | Mapeamento de roles core ↔ legacy |
| `services/audit-log.ts` | Registro de eventos de auditoria |
| `services/upload-policy.ts` | Políticas de upload de mídia |

---

## Variáveis de Ambiente Principais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis URL |
| `JWT_SECRET` | — | Segredo JWT (deve ser igual ao CORE_JWT_SECRET) |
| `CORE_API_BASE_URL` | `http://platform-core:4100` | URL do platform-core |
| `CORE_API_EMAIL` | `root@core.local` | Service account email |
| `CORE_API_PASSWORD` | `123456` | Service account password |
| `EVOLUTION_BASE_URL` | — | URL da Evolution API |
| `EVOLUTION_API_KEY` | — | API key da Evolution |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `PORT` | `4000` | Porta de escuta |

---

## Rodar Localmente

```bash
cd apps/api
npm install
npx prisma migrate dev   # aplicar migrations Prisma
npm run dev              # modo desenvolvimento com watch
```

---

## Padrão de Autenticação

O JWT é **emitido pelo apps/api** (no login) mas usa o mesmo `JWT_SECRET` do platform-core.
Rotas protegidas usam o plugin `src/plugins/auth.ts` que verifica o JWT localmente.

```typescript
// Em route handlers:
const user = await request.jwtVerify<JwtUser>();
// user.sub = localUserId
// user.tenantId = localTenantId
// user.role = ADMIN | MANAGER | VIEWER
```

O `JwtUser` é o token de sessão do **módulo de atendimento** — diferente do `coreAccessToken` que o browser também recebe para chamar platform-core diretamente.

---

## Relação com platform-core

```
Login flow:
  1. apps/api recebe email + password
  2. Chama platformCoreClient.loginUser() → autentica no platform-core
  3. Sincroniza tenant e usuário local (ensureLocalTenant, ensureLocalUser)
  4. Emite JWT próprio (apps/api) + repassa coreAccessToken ao browser

Durante uso:
  - Fastify usa JWT próprio para autorizar rotas
  - browser usa coreAccessToken para chamadas diretas ao platform-core (via core-bff)
  - apps/api usa service account (CORE_API_EMAIL/PASSWORD) para chamadas admin ao platform-core
```
