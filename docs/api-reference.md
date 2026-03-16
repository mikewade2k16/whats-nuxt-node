# Referencia de API

Base URL local: `http://localhost:4000`

Base URL do front (Nuxt): `http://localhost:3000`

Autenticacao:

1. Login em `POST /auth/login`.
2. Usar `Authorization: Bearer <token>` nas rotas protegidas.

Correlation id (observabilidade):

1. Header opcional: `x-correlation-id`.
2. Quando enviado, a API reutiliza esse valor na trilha outbound (`message.metadataJson.correlationId`, fila, worker, auditoria e eventos realtime).
3. Quando nao enviado, a API gera correlation id automaticamente.

## Mapa de rotas e local de implementacao

| Metodo | Rota | Auth | Arquivo |
| --- | --- | --- | --- |
| GET | `/health` | Nao | `apps/api/src/routes/health.ts` |
| POST | `/auth/login` | Nao | `apps/api/src/routes/auth.ts` |
| GET | `/me` | Sim | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant` | Sim | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/audit-events` | Sim (ADMIN/SUPERVISOR) | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/metrics/failures` | Sim (ADMIN/SUPERVISOR) | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/metrics/http-endpoints` | Sim (ADMIN/SUPERVISOR) | `apps/api/src/routes/tenant.ts` |
| PATCH | `/tenant` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/whatsapp/status` | Sim | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/validate-endpoints` | Sim (ADMIN/SUPERVISOR) | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/whatsapp/qrcode` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/bootstrap` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/connect` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/logout` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| GET | `/users` | Sim | `apps/api/src/routes/users.ts` |
| POST | `/users` | Sim (ADMIN) | `apps/api/src/routes/users.ts` |
| PATCH | `/users/:userId` | Sim (ADMIN) | `apps/api/src/routes/users.ts` (desativado: `501`) |
| GET | `/contacts` | Sim | `apps/api/src/routes/contacts.ts` |
| POST | `/contacts` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/contacts.ts` |
| PATCH | `/contacts/:contactId` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/contacts.ts` |
| POST | `/contacts/:contactId/open-conversation` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/contacts.ts` |
| POST | `/contacts/import-whatsapp` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/contacts.ts` |
| GET | `/stickers` | Sim | `apps/api/src/routes/stickers.ts` |
| POST | `/stickers` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/stickers.ts` |
| DELETE | `/stickers/:stickerId` | Sim (ADMIN/SUPERVISOR/AGENT) | `apps/api/src/routes/stickers.ts` |
| GET | `/conversations` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/sync-open` | Sim | `apps/api/src/routes/conversations/routes-core-sync-open.ts` |
| GET | `/conversations/sandbox/test` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations` | Sim | `apps/api/src/routes/conversations.ts` |
| GET | `/conversations/:conversationId/messages` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/:conversationId/messages/sync-history` | Sim | `apps/api/src/routes/conversations.ts` |
| GET | `/conversations/:conversationId/messages/:messageId` | Sim | `apps/api/src/routes/conversations.ts` |
| GET | `/conversations/:conversationId/messages/:messageId/media` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/:conversationId/messages` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/:conversationId/messages/:messageId/reprocess` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/:conversationId/messages/reprocess-failed` | Sim | `apps/api/src/routes/conversations.ts` |
| PATCH | `/conversations/:conversationId/assign` | Sim | `apps/api/src/routes/conversations.ts` |
| PATCH | `/conversations/:conversationId/status` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/webhooks/evolution/:tenantSlug` | Nao (token opcional via header) | `apps/api/src/routes/webhooks.ts` |
| POST | `/webhooks/evolution/:tenantSlug/:eventName` | Nao (token opcional via header) | `apps/api/src/routes/webhooks.ts` |

## Rotas internas do portal de docs (Nuxt server)

Estas rotas existem no `web` para leitura dos arquivos `.md`:

| Metodo | Rota | Auth | Arquivo |
| --- | --- | --- | --- |
| GET | `/api/docs` | Sessao no front | `apps/omni-nuxt-ui/server/api/docs/index.get.ts` |
| GET | `/api/docs/:slug` | Sessao no front | `apps/omni-nuxt-ui/server/api/docs/[slug].get.ts` |

Implementacao de leitura e parse de checklist:

- `apps/omni-nuxt-ui/server/utils/project-docs.ts`

Campos de BI retornados por `/api/docs` e `/api/docs/:slug`:

1. `checklist`: totais e percentual do documento.
2. `sections`: progresso por secao (`##` / `###`) com checklist.
3. `priorities`: progresso por prioridade (`P0`, `P1`, `P2`) quando as tarefas possuem tag.

## Como alterar uma rota com seguranca

1. Localize a rota no arquivo da tabela acima.
2. Ajuste schema de entrada (`zod`) antes da regra de negocio.
3. Garanta filtro por `tenantId` em queries de dados.
4. Se rota impacta UI realtime:
   - publique evento no Redis (`publishEvent`)
   - valide listeners Socket.IO no front
5. Se rota impacta envio outbound:
   - revise contrato com worker e fila (`outboundQueue`)

## Permissoes por papel (Sprint 4)

Papeis disponiveis:

1. `ADMIN`
2. `SUPERVISOR`
3. `AGENT`
4. `VIEWER`

Matriz operacional atual:

1. `ADMIN`: acesso total (tenant, usuarios, whatsapp, inbox escrita e leitura, auditoria e dashboard de falhas).
2. `SUPERVISOR`: leitura operacional + escrita na inbox (envio, status, atribuicao, reprocesso); sem alteracao de tenant/usuarios.
3. `AGENT`: escrita e leitura na inbox; sem alteracao de tenant/usuarios.
4. `VIEWER`: somente leitura na inbox (backend bloqueia rotas de escrita com `403`).

## Contratos importantes

### `POST /auth/login`

Request:

```json
{
  "tenantSlug": "demo",
  "email": "admin@demo.local",
  "password": "123456"
}
```

Response:

```json
{
  "token": "jwt",
  "user": {
    "id": "cuid",
    "tenantId": "cuid",
    "tenantSlug": "demo",
    "email": "admin@demo.local",
    "name": "Admin Demo",
    "role": "ADMIN"
  },
  "coreAccessToken": "jwt-core",
  "coreUser": {
    "id": "uuid",
    "name": "Admin Demo",
    "email": "admin@demo.local",
    "isPlatformAdmin": false,
    "tenantId": "uuid-tenant-core"
  }
}
```

Observacoes:

1. Credenciais sao validadas no `platform-core` (Go).
2. O token `token` e a sessao JWT do modulo de atendimento (Node), emitida apos validacao no core.
3. `coreAccessToken` e retornado para o front acessar `/api/core-bff/*` sem segundo login.

### `POST /tenant/whatsapp/bootstrap`

Uso: criar/garantir instancia na Evolution, configurar webhook e solicitar conexao.

Request:

```json
{
  "instanceName": "demo-wa",
  "number": "5511999999999"
}
```

Response (resumo):

```json
{
  "success": true,
  "instanceName": "demo-wa",
  "webhookUrl": "http://api:4000/webhooks/evolution/demo",
  "created": true
}
```

Regras de limite (plano):

1. Usa `tenant.maxChannels` para bloquear novas instancias acima do limite.
2. Quando limite for atingido, retorna `409` com detalhes (`maxChannels`, `currentChannels`).

### `GET /tenant` e `PATCH /tenant`

Uso:

1. Ler configuracoes atuais do tenant.
2. Atualizar configuracoes e limites do plano no MVP.

Campos de plano retornados:

1. `maxChannels`
2. `maxUsers`
3. `retentionDays`
4. `maxUploadMb` (limite maximo por arquivo, em MB)
5. `currentChannels`
6. `currentUsers`

Regras de validacao no `PATCH /tenant`:

1. Nao permite `maxUsers` menor que o total atual de usuarios do tenant.
2. Nao permite `maxChannels` menor que os canais ja configurados no tenant.
3. Em conflito de limite, retorna `409`.
4. `retentionDays` define a janela de historico que sera mantida pelo worker de retencao.
5. `maxUploadMb` aceita `1..2048` (default `500`) e passa a valer para todos os tipos de midia outbound.

Payload minimo para ajuste de limite de upload:

```json
{
  "maxUploadMb": 500
}
```

### `GET /tenant/audit-events`

Uso:

1. Consultar trilha de auditoria de eventos criticos no tenant (`ADMIN`/`SUPERVISOR`).
2. Filtrar por tipo de evento, conversa, mensagem, ator e cursor temporal.

Query:

1. `limit` (opcional, default `100`, max `200`)
2. `before` (opcional, data ISO para paginar historico para tras)
3. `eventType` (opcional, `AuditEventType`)
4. `conversationId` (opcional)
5. `messageId` (opcional)
6. `actorUserId` (opcional)

Eventos atualmente auditados:

1. `MESSAGE_OUTBOUND_QUEUED`
2. `MESSAGE_OUTBOUND_SENT`
3. `MESSAGE_OUTBOUND_FAILED`
4. `CONVERSATION_STATUS_CHANGED`
5. `CONVERSATION_ASSIGNED`

Response (resumo):

```json
{
  "events": [],
  "hasMore": false,
  "nextBefore": null
}
```

### `GET /tenant/metrics/failures`

Uso:

1. Dashboard de falhas outbound por tenant e tipo de mensagem.
2. Suporta perfis `ADMIN` e `SUPERVISOR`.

Query:

1. `days` (opcional, default `7`, max `90`)

Response (resumo):

```json
{
  "generatedAt": "2026-02-26T13:43:57.833Z",
  "windowDays": 7,
  "since": "2026-02-19T13:43:57.833Z",
  "failedTotal": 12,
  "failedByType": [
    { "messageType": "IMAGE", "total": 5 }
  ],
  "dailySeries": [
    {
      "day": "2026-02-26",
      "total": 3,
      "byType": { "TEXT": 0, "IMAGE": 2, "AUDIO": 1, "VIDEO": 0, "DOCUMENT": 0 }
    }
  ],
  "recentFailures": []
}
```

### `GET /tenant/metrics/http-endpoints`

Uso:

1. Dashboard tecnico de latencia e taxa de erro por endpoint HTTP da API.
2. Suporta perfis `ADMIN` e `SUPERVISOR`.

Query:

1. `limit` (opcional, default `20`, max `100`)
2. `sortBy` (opcional, `p95|avg|errors|requests`, default `p95`)
3. `order` (opcional, `asc|desc`, default `desc`)
4. `routeContains` (opcional, filtro por trecho de rota)

Response (resumo):

```json
{
  "generatedAt": "2026-03-05T23:30:00.000Z",
  "startedAt": "2026-03-05T20:10:00.000Z",
  "uptimeSeconds": 12000,
  "summary": {
    "totalRequests": 540,
    "totalErrors": 12,
    "clientErrors": 7,
    "serverErrors": 5,
    "errorRatePercent": 2.22
  },
  "endpoints": [
    {
      "key": "GET /conversations",
      "method": "GET",
      "route": "/conversations",
      "totalRequests": 130,
      "errors": 2,
      "clientErrors": 2,
      "serverErrors": 0,
      "errorRatePercent": 1.54,
      "avgMs": 143.72,
      "p95Ms": 389.11,
      "minMs": 11.52,
      "maxMs": 771.21,
      "lastStatusCode": 200,
      "lastSeenAt": "2026-03-05T23:29:58.000Z"
    }
  ]
}
```

### `POST /users`

Regras de limite (plano):

1. A criacao passou a usar `platform-core` como fonte de verdade (`/core/tenants/{tenantId}/users/invite`).
2. A API de atendimento sincroniza o usuario no banco local apenas como shadow tecnico para manter compatibilidade de atribuicao/conversas.
3. Quando o `platform-core` estiver indisponivel ou rejeitar a operacao, a API retorna o erro equivalente.

### `PATCH /users/:userId` e `DELETE /users/:userId`

1. Fluxo legado desativado para evitar duplicidade de gestao de usuarios.
2. Ambas as rotas retornam `501`.
3. Gestao de edicao/remocao deve ser feita no painel core (`/admin/core`).

### `POST /contacts/import-whatsapp`

Uso:

1. Gerar preview e importar contatos salvos na instancia WhatsApp conectada para `Contact` do tenant.
2. Aplicar dedupe por telefone/JID com decisao `create/update/skip`.
3. Sincronizar `contactId` e dados do contato nas conversas diretas apos o merge.

Payload (preview):

```json
{
  "dryRun": true,
  "updateExisting": true,
  "overwriteNames": false,
  "overwriteAvatars": false,
  "includeGroups": false,
  "limit": 500
}
```

Payload (aplicar merge):

```json
{
  "dryRun": false,
  "updateExisting": true,
  "overwriteNames": false,
  "overwriteAvatars": false,
  "includeGroups": false,
  "limit": 500,
  "selectedPhones": ["5511999999999", "5511911111111"]
}
```

Response (resumo):

```json
{
  "dryRun": true,
  "generatedAt": "2026-03-06T23:10:00.000Z",
  "summary": {
    "totalProviderRecords": 120,
    "candidates": 98,
    "create": 35,
    "update": 12,
    "skip": 51,
    "invalid": 4,
    "selected": 98
  },
  "items": [
    {
      "phone": "5511999999999",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "name": "Contato Exemplo",
      "avatarUrl": "https://...",
      "existingContactId": null,
      "existingName": null,
      "existingAvatarUrl": null,
      "action": "create",
      "reason": "Novo contato identificado no WhatsApp."
    }
  ],
  "applied": null,
  "warnings": []
}
```

Regras:

1. Requer perfil com escrita (`ADMIN`, `SUPERVISOR` ou `AGENT`).
2. Quando `dryRun=true`, retorna apenas preview para revisao antes do merge.
3. Quando `dryRun=false`, executa criacao/atualizacao por lote e retorna `applied.created/updated/skipped/failed`.
4. Se `selectedPhones` for enviado, o merge aplica somente aos telefones selecionados.
5. O endpoint tenta usar a instancia WhatsApp do tenant; sem instancia configurada retorna `400`.
6. Erros de conector Evolution retornam status/erro detalhado para ajuste operacional.

### `GET /stickers`

Uso:

1. Carregar biblioteca de figurinhas persistidas por tenant para o composer.

Query:

1. `limit` (opcional, default `36`, max `200`)

Response (resumo):

```json
[
  {
    "id": "cuid",
    "name": "figurinha.webp",
    "dataUrl": "data:image/webp;base64,...",
    "mimeType": "image/webp",
    "sizeBytes": 12345,
    "createdAt": "2026-02-27T01:10:00.000Z",
    "updatedAt": "2026-02-27T01:10:00.000Z",
    "createdByUserId": "cuid"
  }
]
```

### `POST /stickers`

Uso:

1. Salvar figurinha na biblioteca do tenant para reuso.

Payload:

```json
{
  "name": "figurinha.webp",
  "dataUrl": "data:image/webp;base64,...",
  "mimeType": "image/webp",
  "sizeBytes": 12345
}
```

Regras:

1. Aceita apenas imagens (`webp`, `png`, `jpeg/jpg`, `gif`).
2. Limite efetivo de tamanho por figurinha: `min(tenant.maxUploadMb, 20MB)`.
3. Biblioteca por tenant mantem os itens mais recentes (janela operacional de ate `200` itens).

### `DELETE /stickers/:stickerId`

Uso:

1. Remover figurinha da biblioteca do tenant.

Response:

1. `204 No Content` em sucesso.

### `GET /tenant/whatsapp/qrcode`

Uso: buscar QR atual da instancia e forcar refresh do QR na Evolution.

Query:

- `force=true|false` (default `true`)

Response (resumo):

```json
{
  "configured": true,
  "instanceName": "demo-instance",
  "qrCode": "data:image/png;base64,...",
  "pairingCode": null,
  "source": "connect",
  "connectionState": {
    "instance": {
      "state": "connecting"
    }
  }
}
```

Observacao:

- Fluxo QR nao exige numero.
- Numero e usado apenas para pairing code opcional.
- Quando a instancia estiver `open/connected`, o endpoint pode retornar `qrCode: null` com `message` explicando que e preciso desconectar a sessao para gerar novo QR.

### `POST /tenant/whatsapp/validate-endpoints`

Uso: validar, endpoint por endpoint, se as rotas configuradas da Evolution estao disponiveis para a instancia atual.

Auth:

- `ADMIN` ou `SUPERVISOR`.

Request (opcional):

```json
{
  "instanceName": "demo-instance"
}
```

Response (resumo):

```json
{
  "instanceName": "demo-instance",
  "generatedAt": "2026-02-27T12:00:00.000Z",
  "baseUrl": "http://evolution:8080",
  "timeoutMs": 90000,
  "endpoints": [
    {
      "key": "contact",
      "label": "sendContact",
      "pathTemplate": "/message/sendContact/:instance",
      "resolvedPath": "/message/sendContact/demo-instance",
      "status": "validation_error",
      "available": true,
      "httpStatus": 400,
      "message": "probe payload invalido"
    }
  ],
  "summary": {
    "total": 6,
    "available": 6,
    "missingRoute": 0,
    "authError": 0,
    "providerError": 0,
    "networkError": 0
  }
}
```

Regras:

1. `available=true` para `status=ok` e `status=validation_error` (rota respondeu e esta ativa).
2. `status=missing_route` indica path incorreto/inexistente (ex.: `404/405`).
3. `status=auth_error` indica API key invalida/sem permissao (`401/403`).
4. `status=provider_error` e `status=network_error` indicam indisponibilidade operacional.
5. O endpoint usa payloads de probe para nao depender de conversa real.

### `POST /tenant/whatsapp/logout`

Uso: desconectar a sessao atual da instancia para permitir novo pareamento por QR.

Response (resumo):

```json
{
  "success": true,
  "instanceName": "demo-instance",
  "logoutResult": {},
  "connectionState": {
    "instance": {
      "state": "close"
    }
  }
}
```

### `GET /conversations`

Uso: listar conversas do tenant com ultima mensagem.

Campos chave no retorno:

1. `contactName`: nome do contato ou do grupo.
2. `contactAvatarUrl`: foto do contato/grupo (quando disponivel).
3. `lastMessage`: ultima mensagem para preview.
4. `lastMessage.messageType`: tipo da ultima mensagem (`TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`).
5. `lastMessage.mediaUrl`: URL de midia quando aplicavel.
   - para eventos/listagem realtime, `data:` URI e sanitizada (retorna `null`) para evitar payload muito pesado.

### `POST /conversations/sync-open`

Uso: importar/atualizar conversas abertas da instancia WhatsApp (Evolution) para a lista local do tenant.

Payload (opcional):

```json
{
  "limitConversations": 200,
  "includeGroups": true
}
```

Response (resumo):

```json
{
  "instanceName": "demo-instance",
  "fetchedChatsCount": 344,
  "selectedChatsCount": 200,
  "createdCount": 31,
  "updatedCount": 14,
  "skippedCount": 155,
  "totalConversationsAfterSync": 202
}
```

Regras:

1. Requer permissao de escrita na inbox (`ADMIN`, `SUPERVISOR`, `AGENT`).
2. Retorna `409` quando a instancia estiver desconectada.
3. Deduplica por `remoteJid` e evita regredir `lastMessageAt`.
4. Nomes tecnicos (`@lid`, JID puro, numero cru) nao sobrescrevem nome humano ja salvo.

### `GET /conversations/:conversationId/messages`

Uso: carregar mensagens da conversa com paginacao para historico (scroll infinito).

Query:

1. `limit` (opcional, default `100`, max `200`)
2. `beforeId` (opcional, id da mensagem ancora para buscar mensagens mais antigas)

Response (resumo):

```json
{
  "conversationId": "cuid",
  "messages": [],
  "hasMore": true
}
```

Regra:

1. Sem `beforeId`, retorna o bloco mais recente da conversa.
2. Com `beforeId`, retorna mensagens anteriores a essa ancora.
3. `hasMore=true` indica que ainda existe historico para carregar.
4. Cada mensagem pode incluir metadados de midia (`messageType`, `mediaUrl`, `mediaMimeType`, etc.).

### `POST /conversations/:conversationId/messages/sync-history`

Uso: sincronizar historico da conversa direto da Evolution (backfill para mensagens que nao chegaram por webhook durante desconexao).

Payload (opcional):

```json
{
  "maxMessages": 300,
  "page": 1
}
```

Response (resumo):

```json
{
  "conversationId": "cuid",
  "externalId": "5511999999999@s.whatsapp.net",
  "conversationLastMessageAt": "2026-03-11T13:22:11.000Z",
  "queryVariant": "where.key+limit",
  "queryAttempts": 4,
  "queryCandidates": 2,
  "fetchedCount": 320,
  "selectedCount": 300,
  "processedCount": 300,
  "createdCount": 12,
  "deduplicatedCount": 288,
  "ignoredCount": 0,
  "failedCount": 0,
  "firstFailureMessage": null
}
```

Regras:

1. Disponivel para perfis com escrita na inbox (`ADMIN`, `SUPERVISOR`, `AGENT`).
2. Disponivel apenas para conversa `WHATSAPP`.
3. Consulta Evolution via `findMessages` escopada por `where.key.remoteJid`, com estrategias de compatibilidade apenas de paginacao (`offset/limit`).
4. Reaproveita o mesmo pipeline de webhook para deduplicacao/normalizacao.
5. Mensagens novas respeitam timestamp original do provedor (`messageTimestamp`) na coluna `createdAt`.

### `GET /conversations/:conversationId/messages/:messageId`

Uso: buscar uma mensagem especifica (hidratacao pontual de payload realtime sanitizado).

Response:

1. Retorna o objeto completo da mensagem, incluindo `mediaUrl` quando existir.
2. Retorna `404` se a mensagem nao existir no `tenant`/conversa.

### `GET /conversations/:conversationId/messages/:messageId/media`

Uso: abrir/baixar midia da mensagem via proxy autenticado (evita download legado com nome `.enc` em links cross-origin).

Query:

1. `disposition=inline|attachment` (opcional; default `inline`)
2. `download=true|false` (opcional; atalho para `attachment`)

Regras:

1. Valida isolamento por `tenantId` e `conversationId`.
2. Forca `Content-Disposition` com nome de arquivo normalizado por MIME/tipo de mensagem.
3. Para `mediaUrl` em `data:`, devolve bytes decodificados direto.
4. Para `mediaUrl` HTTP/HTTPS, baixa no backend e devolve ao front com headers coerentes.
5. Bloqueia host local/interno (`localhost`, ranges privados) por seguranca.
6. Quando detectar midia legada/criptografada (`.enc`, `url_encrypted`, URL expiravel), tenta reidratar automatico via Evolution `chat/getBase64FromMediaMessage`.
7. Em reidratacao bem sucedida, persiste `mediaUrl` como `data:` base64 no banco, normaliza `mediaFileName` e atualiza `metadataJson` (`mediaSourceKind=base64`, `requiresMediaDecrypt=false`).
8. Publica `message.updated` no realtime apos reidratacao para o front hidratar sem recarregar pagina.

### `POST /conversations/:conversationId/messages`

Uso: enviar mensagem outbound (texto ou midia).

Payload texto (padrao):

```json
{
  "type": "TEXT",
  "content": "Oi! Tudo bem?"
}
```

Payload midia:

```json
{
  "type": "IMAGE",
  "content": "Legenda opcional",
  "mediaUrl": "https://cdn.exemplo.com/imagem.jpg",
  "mediaMimeType": "image/jpeg",
  "mediaFileName": "imagem.jpg",
  "mediaFileSizeBytes": 240123
}
```

Payload com reply estruturado:

```json
{
  "type": "TEXT",
  "content": "Perfeito, combinado",
  "metadataJson": {
    "reply": {
      "messageId": "cuid-da-msg-original-no-banco",
      "externalMessageId": "BAE5F8A0A1D2C3",
      "author": "Contato",
      "content": "Mensagem original resumida",
      "messageType": "TEXT",
      "fromMe": false
    }
  }
}
```

Regras:

1. `type` default: `TEXT`.
2. Para `TEXT`, `content` e obrigatorio.
3. Para `IMAGE`/`AUDIO`/`VIDEO`/`DOCUMENT`, `mediaUrl` e obrigatorio.
4. `content` em midia pode ser legenda; se vazio, backend salva placeholder (`[imagem]`, `[audio]`, etc.).
5. `mediaUrl` aceita URL HTTP/HTTPS e `data:` URL (base64) para teste rapido no MVP.
6. No worker outbound, `data:*;base64,...` e convertido para base64 puro antes da chamada `sendMedia`.
   - Evolution `v2.3.7` retorna `400` (`Owned media must be a url or base64`) se receber `data:` URI crua.
7. Em reply outbound, `metadataJson.reply.externalMessageId` deve carregar o ID real do provedor para que o WhatsApp mantenha o link clicavel para a mensagem original.
8. O worker envia `quoted` no formato minimo (`{ key: { id } }`) para evitar mismatch de `remoteJid/fromMe/participant` no provedor.
9. Para conversas de grupo, o front pode enviar `metadataJson.mentions`:

```json
{
  "mentions": {
    "everyOne": false,
    "mentioned": ["5511999999999@s.whatsapp.net"]
  }
}
```

8. O worker converte `metadataJson.mentions` para payload nativo da Evolution no `sendText`:
   - `mentionsEveryOne`
   - `mentioned[]`
9. No envio `DOCUMENT`, o worker forca rota de documento (`mediatype=document`) e normaliza MIME para binario quando necessario (ex.: `image/webp`) para evitar falha de conversao da Evolution.
10. No envio `AUDIO`, o worker tenta primeiro `sendWhatsAppAudio`; se a Evolution rejeitar o codec, faz fallback para envio como documento no `sendMedia`.
11. Mensagem outbound criada pela API passa a persistir `senderUserId` com o usuario autenticado (operador que enviou).
12. Mensagens vindas do celular/WhatsApp conectado (fora do painel) podem permanecer com `senderUserId = null`.
13. Quando `SANDBOX_ENABLED=true`, envio e reprocessamento outbound sao bloqueados com `403` para destinos fora da allowlist (`SANDBOX_ALLOWLIST`).
14. Rotas de escrita da inbox exigem perfil `ADMIN`, `SUPERVISOR` ou `AGENT`; `VIEWER` recebe `403`.
15. Upload outbound de midia aplica limite unico por tenant (`tenant.maxUploadMb`, default `500MB`).
16. O limite e configuravel no painel Admin (secao `Tenant`) e via `PATCH /tenant`.
17. Erros de upload retornam payload estruturado com `code` e `details`:
   - `UPLOAD_LIMIT_EXCEEDED` (`413`)
   - `UPLOAD_MIME_INVALID` (`400`)
   - `UPLOAD_SIZE_REQUIRED` (`400`)
18. Se houver falha de enfileiramento (`outboundQueue.add`), a API nao deixa a mensagem em `PENDING`: marca `FAILED`, publica evento realtime e registra auditoria de falha (`provider=queue`, `stage=queue_add`), retornando o objeto da mensagem ja com status final.
19. Quando o front marcar o anexo com `metadataJson.media.sendAsSticker=true`, o worker usa endpoint dedicado de figurinha (`EVOLUTION_SEND_STICKER_PATH`) e fallback para `sendMedia` caso o provider recuse o formato.
20. Quando houver URL no texto, o front envia `metadataJson.linkPreview` e o worker ativa `linkPreview=true` no `sendText` (salvo quando `metadataJson.linkPreview.enabled=false`).
21. Para envio de contato via composer, o front envia `metadataJson.contact` no payload de texto.
22. O worker exige envio nativo de contato no endpoint dedicado (`EVOLUTION_SEND_CONTACT_PATH`) e nao faz fallback para texto.
23. Se o endpoint de contato estiver ausente/mal configurado, a mensagem falha com erro explicito para correcao do path/provider.

### `POST /conversations/:conversationId/messages/:messageId/reaction`

Uso: adicionar/alterar/remover reacao de um atendente na mensagem alvo.

Payload:

```json
{
  "emoji": "👍"
}
```

Remover reacao do atendente atual:

```json
{
  "emoji": null
}
```

Regras:

1. Requer perfil com escrita (`ADMIN`, `SUPERVISOR` ou `AGENT`).
2. Persiste em `message.metadataJson.reactions` com granularidade por ator (`actorKey`).
3. Publica `message.updated` em tempo real com snapshot atualizado da mensagem.
4. Quando Evolution estiver configurada, tenta sincronizar no WhatsApp via `EVOLUTION_SEND_REACTION_PATH`.
5. Se a mensagem ainda nao tiver `externalMessageId`, retorna `409` (nao ha como enviar reacao no provider).

### `GET /conversations/sandbox/test`

Uso: obter/criar conversa dedicada de homologacao segura.

Regras:

1. Requer `SANDBOX_ENABLED=true`.
2. Usa `SANDBOX_TEST_EXTERNAL_ID` como destino da conversa de teste.
3. Retorna conversa padronizada como `Conversa de Teste (Sandbox)` para uso no painel.

Variaveis de ambiente do sandbox:

1. `SANDBOX_ENABLED` (`true|false`)
2. `SANDBOX_ALLOWLIST` (separado por virgula, ponto e virgula ou quebra de linha; aceita numero ou JID)
3. `SANDBOX_TEST_EXTERNAL_ID` (destino padrao da conversa de teste)

### `GET /conversations/:conversationId/group-participants`

Uso: carregar participantes de conversa de grupo para autocomplete de `@` e resolucao de nome/avatar no chat.

Response (resumo):

```json
{
  "conversationId": "cuid",
  "participants": [
    {
      "jid": "91397088624838@lid",
      "phone": "554284138129",
      "name": "Nome do contato",
      "avatarUrl": "https://..."
    }
  ]
}
```

Regras:

1. Disponivel apenas para conversas WhatsApp de grupo (`@g.us`).
2. A API combina historico local + `group/findGroupInfos` da Evolution.
3. Quando o participante vier como `@lid`, a API tenta mapear para contato real via `chat/findContacts`.
4. Se nao houver nome disponivel no provedor para um participante, o fallback continua sendo identificador numerico.

### `POST /conversations/:conversationId/messages/:messageId/reprocess`

Uso: reenfileirar uma mensagem outbound especifica (FAILED/PENDING/SENT).

Payload:

```json
{
  "force": false
}
```

Regras:

1. Somente mensagens `OUTBOUND`.
2. Se `status = SENT`, exige `force=true`.
3. O endpoint redefine `status` para `PENDING`, limpa `externalMessageId` e reenfileira no worker.
4. Se o reenfileiramento falhar, a API reverte para `FAILED` imediatamente e registra auditoria (`stage=queue_add_reprocess_single`), evitando `PENDING` infinito.

### `POST /conversations/:conversationId/messages/reprocess-failed`

Uso: reenfileirar mensagens outbound `FAILED` em lote na conversa.

Payload:

```json
{
  "limit": 50
}
```

Retorno (resumo):

```json
{
  "queued": 12,
  "totalFailed": 12,
  "messageIds": ["..."],
  "failedToQueueCount": 0,
  "failedToQueueMessageIds": []
}
```

Regras adicionais:

1. Cada mensagem `FAILED` selecionada e atualizada para `PENDING` antes de tentar enfileirar.
2. Se `outboundQueue.add` falhar em um item, esse item volta para `FAILED`, recebe evento realtime de update e evento de auditoria (`stage=queue_add_reprocess_batch`).

### `POST /webhooks/evolution/:tenantSlug`

Header recomendado:

`x-webhook-token: <EVOLUTION_WEBHOOK_TOKEN>`

Responsavel por:

1. Validar tenant.
2. Criar/atualizar conversa WhatsApp (contato ou grupo).
3. Em grupo, priorizar nome do grupo na conversa (nao nome do participante).
4. Persistir foto da conversa (`contactAvatarUrl`) e do autor da mensagem (`senderAvatarUrl`) quando disponivel.
5. Em conversa direta sem avatar no payload, consultar fallback de foto via Evolution (`/chat/fetchProfilePictureUrl/:instance`).
6. Detectar tipo da mensagem (`TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`) e persistir metadados de midia.
   - `stickerMessage` e persistido como `IMAGE` com `metadataJson.mediaKind=sticker` e placeholder `[figurinha]`.
7. Gravar mensagem com direcao correta (`INBOUND` ou `OUTBOUND` via `fromMe`).
8. Deduplicar eco de mensagem enviada (quando webhook devolve a propria mensagem).
9. Publicar eventos realtime.
10. Priorizar base64 de midia no parse inbound para evitar preview quebrado por URL temporaria.
11. Ignorar eventos fora de mensagem (`SEND_MESSAGE`, etc.) retornando `202`.
12. Tratar `reactionMessage` (em `MESSAGES_UPSERT`/`MESSAGES_UPDATE`) como update de metadado na mensagem alvo, sem criar nova mensagem.
13. Para payload de mensagem nao suportada, criar mensagem placeholder com:
   - `content`: `[conteudo nao suportado: <tipo>]`
   - `metadataJson.unsupported`: tipo/label detectado.
14. Em inbound de midia, salvar diagnostico de origem da midia:
   - `metadataJson.mediaSourceKind` (`base64`, `url`, `url_encrypted`, `none`)
   - `metadataJson.requiresMediaDecrypt` quando o provider entregar apenas URL potencialmente criptografada.
15. Em mensagens com URL, persistir metadado de preview (`metadataJson.linkPreview`) quando disponivel no payload (`extendedTextMessage` etc.), com fallback de URL extraida do texto.
16. Em `contactMessage`/`contactsArrayMessage`, persistir metadado de contato (`metadataJson.contact`) para renderizacao de card no front.

Response (resumo):

```json
{
  "status": "ok",
  "created": true,
  "deduplicated": false,
  "messageId": "cuid",
  "conversationId": "cuid"
}
```

## Eventos realtime

Canal por tenant no Socket.IO:

`tenant:<tenantId>`

Eventos emitidos:

1. `conversation.updated`
2. `message.created`
3. `message.updated`

Observacao:

1. Eventos realtime nao carregam `mediaUrl` em formato `data:` (base64) para evitar travamento da UI com payload gigante.
2. Em webhook de midia, `message.updated` pode carregar snapshot completo da mensagem (com `mediaUrl` sanitizado) para o front reconciliar preview sem reload.

Publicacao de eventos:

`apps/api/src/event-bus.ts`

## Estrutura outbound por tipo

Arquivos:

1. Orquestrador da fila: `apps/api/src/workers/outbound-worker.ts`
2. Envio de texto: `apps/api/src/workers/senders/send-text.ts`
3. Envio de midia/audio: `apps/api/src/workers/senders/send-media.ts`
4. Utilitarios comuns: `apps/api/src/workers/senders/common.ts`

Objetivo:

1. Isolar regressao entre tipos de mensagem.
2. Permitir evolucao de midia sem impactar fluxo de texto.
3. Classificar erros nao recuperaveis da Evolution (ex.: `exists:false`) para evitar retries desnecessarios na fila.

## Retencao automatica por tenant

Arquivos:

1. Servico de expurgo: `apps/api/src/services/retention-service.ts`
2. Worker de retencao: `apps/api/src/workers/retention-worker.ts`

Comportamento:

1. O worker executa sweep por tenant usando `tenant.retentionDays`.
2. Remove mensagens antigas (`message.createdAt < cutoff`).
3. Remove conversas vazias antigas (`messages none` + `lastMessageAt < cutoff`).
4. O sweep roda no boot (configuravel) e depois no intervalo configurado.

Variaveis de ambiente:

1. `RETENTION_SWEEP_ON_BOOT` (default `true`)
2. `RETENTION_SWEEP_INTERVAL_MINUTES` (default `1440`, minimo `5`)
