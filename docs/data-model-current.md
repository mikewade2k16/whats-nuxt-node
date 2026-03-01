# Modelo de Dados Atual

Fonte de verdade: `apps/api/prisma/schema.prisma`

## Visao geral

O banco atual foi desenhado para MVP com foco em:

1. Multi-tenant basico.
2. Conversas por canal.
3. Mensagens inbound/outbound.
4. Controle simples de usuarios e papeis.

## Enumeracoes

1. `UserRole`: `ADMIN`, `SUPERVISOR`, `AGENT`, `VIEWER`
2. `ChannelType`: `WHATSAPP`, `INSTAGRAM`
3. `ConversationStatus`: `OPEN`, `PENDING`, `CLOSED`
4. `MessageDirection`: `INBOUND`, `OUTBOUND`
5. `MessageStatus`: `PENDING`, `SENT`, `FAILED`
6. `MessageType`: `TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`
7. `AuditEventType`: `MESSAGE_OUTBOUND_QUEUED`, `MESSAGE_OUTBOUND_SENT`, `MESSAGE_OUTBOUND_FAILED`, `CONVERSATION_STATUS_CHANGED`, `CONVERSATION_ASSIGNED`

## Tabela `Tenant`

Campos:

1. `id` (PK, string/cuid)
2. `slug` (unico)
3. `name`
4. `whatsappInstance` (opcional)
5. `evolutionApiKey` (opcional)
6. `maxChannels` (limite de canais por tenant)
7. `maxUsers` (limite de usuarios por tenant)
8. `retentionDays` (retencao configurada por tenant)
9. `maxUploadMb` (limite de upload por arquivo, em MB, default 500)
10. `createdAt`
11. `updatedAt`

Relacoes:

1. `Tenant 1:N User`
2. `Tenant 1:N Conversation`
3. `Tenant 1:N Message`
4. `Tenant 1:N AuditEvent`
5. `Tenant 1:N SavedSticker`

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
3. Pode ser autor interno de mensagens outbound (`senderUserId` em Message).
4. Pode ser autor de figurinhas salvas (`createdByUserId` em SavedSticker).

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
4. `senderUserId` (FK opcional -> User; identifica o atendente no outbound interno)
5. `direction`
6. `messageType`
7. `senderName`
8. `senderAvatarUrl` (url da foto do autor da mensagem, quando disponivel)
9. `content` (texto, legenda ou placeholder de midia)
10. `mediaUrl` (url/data-uri da midia quando aplicavel)
11. `mediaMimeType`
12. `mediaFileName`
13. `mediaFileSizeBytes`
14. `mediaCaption`
15. `mediaDurationSeconds`
16. `metadataJson` (metadados do provider/webhook)
17. `externalMessageId`
18. `status`
19. `createdAt`
20. `updatedAt`

Indices:

1. `tenantId + createdAt`
2. `conversationId + createdAt`
3. `senderUserId`

## Tabela `AuditEvent`

Campos:

1. `id` (PK)
2. `tenantId` (FK -> Tenant)
3. `actorUserId` (FK opcional -> User)
4. `conversationId` (FK opcional -> Conversation)
5. `messageId` (FK opcional -> Message)
6. `eventType` (`AuditEventType`)
7. `payloadJson` (detalhes do evento)
8. `createdAt`

Indices:

1. `tenantId + createdAt DESC`
2. `conversationId + createdAt DESC`
3. `messageId + createdAt DESC`
4. `eventType + createdAt DESC`

## Tabela `SavedSticker`

Campos:

1. `id` (PK)
2. `tenantId` (FK -> Tenant)
3. `createdByUserId` (FK opcional -> User)
4. `name`
5. `dataUrl` (base64 data URL da figurinha)
6. `mimeType`
7. `sizeBytes`
8. `createdAt`
9. `updatedAt`

Indices:

1. `tenantId + createdAt DESC`
2. `createdByUserId`

## Diagrama relacional (atual)

```text
Tenant (1) ---- (N) User
Tenant (1) ---- (N) Conversation
Tenant (1) ---- (N) Message
Tenant (1) ---- (N) AuditEvent
Tenant (1) ---- (N) SavedSticker
User (1)   ---- (N) Conversation [assignedToId opcional]
User (1)   ---- (N) Message [senderUserId opcional]
User (1)   ---- (N) AuditEvent [actorUserId opcional]
User (1)   ---- (N) SavedSticker [createdByUserId opcional]
Conversation (1) ---- (N) Message
Conversation (1) ---- (N) AuditEvent
Message (1) ---- (N) AuditEvent
```

## Pontos fortes do modelo atual

1. Simples para operar no MVP.
2. Isolamento basico por `tenantId`.
3. Suporte a fila/outbound sem complexidade extra.

## Limitacoes atuais

1. `evolutionApiKey` em texto simples na tabela `Tenant`.
2. Auditoria cobre eventos criticos, mas ainda nao cobre 100% das acoes administrativas.
3. Sem historico de atribuicao.
4. Midia ainda fica na propria tabela `Message` (sem tabela dedicada de anexos).
5. Sem estrutura de filas/skills de atendimento.
