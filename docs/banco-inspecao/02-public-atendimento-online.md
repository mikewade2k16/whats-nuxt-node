# Catálogo Completo do Runtime Operacional do atendimento-online no schema `atendimento_online`

## Escopo

Este catálogo cobre o banco operacional modelado em Prisma em `apps/atendimento-online-api/prisma/schema.prisma`.

O schema físico do módulo agora é `atendimento_online`. Tenant, usuário, grants autoritativos, limites de uso e elegibilidade de acesso vêm do `platform_core`; aqui ficam apenas dados operacionais e configuração estritamente local ao runtime.

## Diagnóstico rápido do schema

### O que ele faz bem

1. mantém o domínio operacional de conversa, mensagem, contato e instância de canal isolado do shell;
2. consome tenant, usuário e acesso do `platform_core` sem shadow local de `Tenant` ou `User`;
3. usa ids canônicos do core em colunas como `tenantId`, `assignedToId`, `senderUserId`, `actorUserId`, `createdByUserId` e `userId`;
4. removeu a whitelist local por instância e deixou o acesso do módulo totalmente dependente do core;
5. removeu do banco local o segredo `evolutionApiKey`, mantendo-o apenas em ambiente.
6. removeu do schema os enums locais `UserRole` e `WhatsAppInstanceUserScopePolicy`, mantendo no banco apenas tipos operacionais usados pelas tabelas vivas.

### O que ainda merece atenção

1. o schema está convergido estruturalmente; os próximos trabalhos aqui passam a ser evolução funcional, não limpeza de ownership;
2. referências a usuário e tenant continuam lógicas, por contrato com o shell, e não por FK cruzada entre schemas.

## Observação física importante

Como o `schema.prisma` não usa `@@map`, as tabelas físicas esperadas no PostgreSQL seguem o nome dos models do Prisma.

Estado atual do schema:

1. `AtendimentoTenantConfig`
2. `WhatsAppInstance`
3. `SavedSticker`
4. `Contact`
5. `Conversation`
6. `Message`
7. `AuditEvent`
8. `HiddenMessageForUser`

Total: 8 tabelas.

## Tabelas do schema

### `AtendimentoTenantConfig`

- Classificação: `Atual + integração`
- Papel: configuração operacional local do runtime por tenant canônico do shell.
- Campos: `tenantId` string PK; `retentionDays` int default 15; `maxUploadMb` int default 500; `createdAt` datetime; `updatedAt` datetime.
- Relações: não possui FK física local; `tenantId` referencia logicamente `platform_core.tenants.id`.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","retentionDays":15,"maxUploadMb":500}`.
- Observações: esta tabela não replica mais nome, slug, limite de usuários, grants nem segredo operacional de canal.

### `WhatsAppInstance`

- Classificação: `Atual`
- Papel: instância operacional de WhatsApp dentro do tenant canônico.
- Campos: `id` string cuid PK; `tenantId` string; `instanceName` string; `displayName` string nullable; `phoneNumber` string nullable; `queueLabel` string nullable; `isDefault` boolean; `isActive` boolean; `createdByUserId` string nullable; `responsibleUserId` string nullable; `createdAt` datetime; `updatedAt` datetime.
- Relações: 1:N com `Conversation` e `Message`; colunas de usuário e tenant são referências lógicas ao core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","instanceName":"demo-instance","displayName":"WhatsApp Demo Core Tenant","isDefault":true,"isActive":true}`.
- Observações: o runtime continua dono do canal operacional, não da identidade nem do grant de acesso.

### `SavedSticker`

- Classificação: `Atual`
- Papel: biblioteca de figurinhas operacionais reutilizáveis.
- Campos: `id` string cuid PK; `tenantId` string; `createdByUserId` string nullable; `name` string; `dataUrl` text; `mimeType` string; `sizeBytes` int; `createdAt` datetime; `updatedAt` datetime.
- Relações: referência lógica ao tenant e ao usuário criador do core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","name":"Boas-vindas seed core","mimeType":"image/webp","sizeBytes":128}`.

### `Contact`

- Classificação: `Atual`
- Papel: cadastro operacional de contato dentro do tenant contextualizado pelo shell.
- Campos: `id` string cuid PK; `tenantId` string; `name` string; `phone` string; `avatarUrl` string nullable; `source` string; `createdAt` datetime; `updatedAt` datetime.
- Relações: 1:N com `Conversation`; `tenantId` é referência lógica ao core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","name":"Cliente Demo Core Tenant","phone":"5511999001000","source":"SEED_CORE_RUNTIME"}`.

### `Conversation`

- Classificação: `Atual`
- Papel: conversa consolidada por contato, canal e instância no contexto do tenant vindo do shell.
- Campos: `id` string cuid PK; `tenantId` string; `instanceId` string FK nullable; `instanceScopeKey` string; `assignedToId` string nullable; `contactId` string FK nullable; `channel` enum `WHATSAPP|INSTAGRAM`; `externalId` string; `contactName` string nullable; `contactAvatarUrl` string nullable; `contactPhone` string nullable; `status` enum `OPEN|PENDING|CLOSED`; `lastMessageAt` datetime; `createdAt` datetime; `updatedAt` datetime.
- Relações: N:1 com `WhatsAppInstance` e `Contact`; 1:N com `Message` e `AuditEvent`; ids de tenant e usuário são lógicos e canônicos do core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","externalId":"5511999001000@s.whatsapp.net","instanceScopeKey":"demo-instance","channel":"WHATSAPP","status":"OPEN"}`.
- Observações: a unique key real é `tenantId + externalId + channel + instanceScopeKey`.

### `Message`

- Classificação: `Atual`
- Papel: mensagem inbound ou outbound da operação.
- Campos: `id` string cuid PK; `tenantId` string; `conversationId` string FK; `instanceId` string FK nullable; `instanceScopeKey` string; `senderUserId` string nullable; `direction` enum `INBOUND|OUTBOUND`; `messageType` enum `TEXT|IMAGE|AUDIO|VIDEO|DOCUMENT`; `senderName` string nullable; `senderAvatarUrl` string nullable; `content` string; `mediaUrl` string nullable; `mediaMimeType` string nullable; `mediaFileName` string nullable; `mediaFileSizeBytes` int nullable; `mediaCaption` string nullable; `mediaDurationSeconds` int nullable; `metadataJson` json nullable; `externalMessageId` string nullable; `status` enum `PENDING|SENT|FAILED`; `createdAt` datetime; `updatedAt` datetime.
- Relações: N:1 com `Conversation` e `WhatsAppInstance`; 1:N com `AuditEvent` e `HiddenMessageForUser`.
- Exemplo: `{"direction":"OUTBOUND","senderUserId":"e0556192-acd1-4774-ac2f-f79410178cf7","content":"Perfeito! Aqui o runtime operacional já está vinculado ao core.","status":"SENT"}`.
- Observações: a autoria humana usa `senderUserId` do core; o módulo não replica mais tabela local de operador.

### `AuditEvent`

- Classificação: `Técnico-operacional`
- Papel: trilha operacional ligada a conversa e mensagem.
- Campos: `id` string cuid PK; `tenantId` string; `actorUserId` string nullable; `conversationId` string FK nullable; `messageId` string FK nullable; `eventType` enum `MESSAGE_OUTBOUND_QUEUED|MESSAGE_OUTBOUND_SENT|MESSAGE_OUTBOUND_FAILED|CONVERSATION_STATUS_CHANGED|CONVERSATION_ASSIGNED`; `payloadJson` json nullable; `createdAt` datetime.
- Relações: N:1 com `Conversation` e `Message`; ator referenciado logicamente no core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","eventType":"CONVERSATION_ASSIGNED","payloadJson":{"seededFrom":"platform_core"}}`.

### `HiddenMessageForUser`

- Classificação: `Atual`
- Papel: ocultação individual de mensagem para um operador do core.
- Campos: `id` string cuid PK; `tenantId` string; `userId` string; `messageId` string FK; `createdAt` datetime.
- Relações: N:1 com `Message`; `tenantId` e `userId` referenciam logicamente o core.
- Exemplo: `{"tenantId":"67668cc8-bc63-457d-b6ce-94118c593d6f","userId":"e05f7b10-5893-49ae-862d-1d606c6f9b99","messageId":"cmnyv4j540009qserqz9m7q0b"}`.

## Leituras finais sobre o schema `atendimento_online`

### O que está bem encaminhado

1. não existe mais shadow local de `Tenant` ou `User`;
2. o shell é a fonte de verdade de tenant, usuário, acesso ao módulo e limites;
3. a operação de conversa, mensagem e instância segue isolada e coerente;
4. a configuração local ficou reduzida ao que realmente é operacional;
5. o segredo da Evolution saiu do banco local;
6. a elegibilidade por instância deixou de ser persistida localmente.

### O que ainda pode evoluir

1. fortalecer contratos de integração e observabilidade entre shell e runtime;
2. revisar, quando fizer sentido, se algumas referências lógicas merecem contratos explícitos adicionais com o core.
