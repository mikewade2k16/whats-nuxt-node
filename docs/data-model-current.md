# Modelo de Dados Atual

Fonte de verdade: `apps/api/prisma/schema.prisma`

## Visao geral

O banco atual foi desenhado para MVP com foco em:

1. Multi-tenant basico.
2. Conversas por canal.
3. Mensagens inbound/outbound.
4. Controle simples de usuarios e papeis.

## Enumeracoes

1. `UserRole`: `ADMIN`, `AGENT`
2. `ChannelType`: `WHATSAPP`, `INSTAGRAM`
3. `ConversationStatus`: `OPEN`, `PENDING`, `CLOSED`
4. `MessageDirection`: `INBOUND`, `OUTBOUND`
5. `MessageStatus`: `PENDING`, `SENT`, `FAILED`

## Tabela `Tenant`

Campos:

1. `id` (PK, string/cuid)
2. `slug` (unico)
3. `name`
4. `whatsappInstance` (opcional)
5. `evolutionApiKey` (opcional)
6. `createdAt`
7. `updatedAt`

Relacoes:

1. `Tenant 1:N User`
2. `Tenant 1:N Conversation`
3. `Tenant 1:N Message`

## Tabela `User`

Campos:

1. `id` (PK)
2. `tenantId` (FK -> Tenant)
3. `email`
4. `name`
5. `passwordHash`
6. `role`
7. `createdAt`
8. `updatedAt`

Restricoes:

1. Unico composto: `tenantId + email`

Relacoes:

1. Pertence a um tenant.
2. Pode ser responsavel por conversas (`assignedToId` em Conversation).

## Tabela `Conversation`

Campos:

1. `id` (PK)
2. `tenantId` (FK -> Tenant)
3. `assignedToId` (FK opcional -> User)
4. `channel` (`WHATSAPP`/`INSTAGRAM`)
5. `externalId` (id externo do contato/conversa no canal)
6. `contactName`
7. `contactAvatarUrl` (url da foto do contato/grupo)
8. `contactPhone`
9. `status`
10. `lastMessageAt`
11. `createdAt`
12. `updatedAt`

Restricoes:

1. Unico composto: `tenantId + externalId + channel`

Indices:

1. `tenantId + lastMessageAt DESC`
2. `assignedToId`

## Tabela `Message`

Campos:

1. `id` (PK)
2. `tenantId` (FK -> Tenant)
3. `conversationId` (FK -> Conversation)
4. `direction`
5. `senderName`
6. `senderAvatarUrl` (url da foto do autor da mensagem, quando disponivel)
7. `content`
8. `externalMessageId`
9. `status`
10. `createdAt`
11. `updatedAt`

Indices:

1. `tenantId + createdAt`
2. `conversationId + createdAt`

## Diagrama relacional (atual)

```text
Tenant (1) ---- (N) User
Tenant (1) ---- (N) Conversation
Tenant (1) ---- (N) Message
User (1)   ---- (N) Conversation [assignedToId opcional]
Conversation (1) ---- (N) Message
```

## Pontos fortes do modelo atual

1. Simples para operar no MVP.
2. Isolamento basico por `tenantId`.
3. Suporte a fila/outbound sem complexidade extra.

## Limitacoes atuais

1. `evolutionApiKey` em texto simples na tabela `Tenant`.
2. Sem trilha de auditoria de mudancas.
3. Sem historico de atribuicao.
4. Sem anexos e metadados ricos de mensagem.
5. Sem estrutura de filas/skills de atendimento.
