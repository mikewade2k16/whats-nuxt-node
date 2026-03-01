# Planejamento Chat Interno e Suporte Tenant -> Admin

Objetivo: definir implementacao de dois canais internos sem bloquear o MVP comercial:

1. Chat interno entre usuarios do mesmo tenant.
2. Chat de suporte entre tenant e equipe admin da plataforma.

## Escopo funcional planejado

## 1) Chat interno do tenant

1. Conversa de equipe sem canal externo (nao passa por WhatsApp).
2. Mensagens `TEXT` no P1.
3. Midia (`IMAGE`, `DOCUMENT`, `AUDIO`, `VIDEO`) no P2.
4. Participantes por tenant (roles permitidos: `ADMIN`, `SUPERVISOR`, `AGENT`).
5. `VIEWER` com leitura opcional (configuravel por tenant em fase futura).

## 2) Chat suporte tenant -> admin plataforma

1. Canal privado para abrir chamados operacionais.
2. Participantes:
   - lado tenant: `ADMIN`/`SUPERVISOR`
   - lado plataforma: `platform_admin` (fora do tenant comercial).
3. Estado minimo de ticket:
   - `OPEN`
   - `PENDING_CUSTOMER`
   - `PENDING_PLATFORM`
   - `RESOLVED`

## Modelo de dados planejado (incremental)

Novas tabelas sugeridas:

1. `internal_thread`
   - `id`, `tenantId`, `type` (`TEAM`, `SUPPORT`), `subject`, `status`, `createdAt`, `updatedAt`
2. `internal_thread_participant`
   - `id`, `threadId`, `userId`, `roleInThread`, `createdAt`
3. `internal_message`
   - `id`, `threadId`, `authorUserId`, `messageType`, `content`, `metadataJson`, `createdAt`, `updatedAt`

Observacao:

1. Reusar padrao de auditoria (`AuditEvent`) para eventos de thread/status.

## API planejada

Rotas P1:

1. `GET /internal/threads`
2. `POST /internal/threads`
3. `GET /internal/threads/:threadId/messages`
4. `POST /internal/threads/:threadId/messages`
5. `PATCH /internal/threads/:threadId/status`

Regras:

1. Isolamento por `tenantId` em todas as queries.
2. Controle por papel (somente roles permitidas).
3. Realtime via Socket.IO (`internal.thread.updated`, `internal.message.created`).

## Fases de entrega

Fase 1 (P1):

1. Chat interno de equipe `TEXT`.
2. Realtime basico.
3. Historico paginado.
4. Auditoria de mudanca de status.

Fase 2 (P2):

1. Suporte tenant -> admin com status de ticket.
2. SLA basico e fila de atendimento.
3. Midia no chat interno/suporte.

## Riscos e mitigacoes

1. Misturar dominio interno com conversa de canal externo.
   - mitigacao: tabelas/rotas dedicadas (`internal_*`).
2. Falha de isolamento tenant.
   - mitigacao: estender `tenant-isolation-audit` para rotas internas.
3. Realtime sem ordenacao consistente.
   - mitigacao: ordenacao por `createdAt` + `id` e reconciliacao por API ao reconectar.
