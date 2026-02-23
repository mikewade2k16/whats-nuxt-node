# Referencia de API

Base URL local: `http://localhost:4000`

Autenticacao:

1. Login em `POST /auth/login`.
2. Usar `Authorization: Bearer <token>` nas rotas protegidas.

## Mapa de rotas e local de implementacao

| Metodo | Rota | Auth | Arquivo |
| --- | --- | --- | --- |
| GET | `/health` | Nao | `apps/api/src/routes/health.ts` |
| POST | `/auth/login` | Nao | `apps/api/src/routes/auth.ts` |
| GET | `/me` | Sim | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant` | Sim | `apps/api/src/routes/tenant.ts` |
| PATCH | `/tenant` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/whatsapp/status` | Sim | `apps/api/src/routes/tenant.ts` |
| GET | `/tenant/whatsapp/qrcode` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/bootstrap` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| POST | `/tenant/whatsapp/connect` | Sim (ADMIN) | `apps/api/src/routes/tenant.ts` |
| GET | `/users` | Sim | `apps/api/src/routes/users.ts` |
| POST | `/users` | Sim (ADMIN) | `apps/api/src/routes/users.ts` |
| PATCH | `/users/:userId` | Sim (ADMIN) | `apps/api/src/routes/users.ts` |
| GET | `/conversations` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations` | Sim | `apps/api/src/routes/conversations.ts` |
| GET | `/conversations/:conversationId/messages` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/conversations/:conversationId/messages` | Sim | `apps/api/src/routes/conversations.ts` |
| PATCH | `/conversations/:conversationId/assign` | Sim | `apps/api/src/routes/conversations.ts` |
| PATCH | `/conversations/:conversationId/status` | Sim | `apps/api/src/routes/conversations.ts` |
| POST | `/webhooks/evolution/:tenantSlug` | Nao (token opcional via header) | `apps/api/src/routes/webhooks.ts` |

## Como alterar uma rota com seguranca

1. Localize a rota no arquivo da tabela acima.
2. Ajuste schema de entrada (`zod`) antes da regra de negocio.
3. Garanta filtro por `tenantId` em queries de dados.
4. Se rota impacta UI realtime:
   - publique evento no Redis (`publishEvent`)
   - valide listeners Socket.IO no front
5. Se rota impacta envio outbound:
   - revise contrato com worker e fila (`outboundQueue`)

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
  }
}
```

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

### `GET /conversations`

Uso: listar conversas do tenant com ultima mensagem.

Campos chave no retorno:

1. `contactName`: nome do contato ou do grupo.
2. `contactAvatarUrl`: foto do contato/grupo (quando disponivel).
3. `lastMessage`: ultima mensagem para preview.

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

### `POST /webhooks/evolution/:tenantSlug`

Header recomendado:

`x-webhook-token: <EVOLUTION_WEBHOOK_TOKEN>`

Responsavel por:

1. Validar tenant.
2. Criar/atualizar conversa WhatsApp (contato ou grupo).
3. Em grupo, priorizar nome do grupo na conversa (nao nome do participante).
4. Persistir foto da conversa (`contactAvatarUrl`) e do autor da mensagem (`senderAvatarUrl`) quando disponivel.
5. Em conversa direta sem avatar no payload, consultar fallback de foto via Evolution (`/chat/fetchProfilePictureUrl/:instance`).
6. Gravar mensagem com direcao correta (`INBOUND` ou `OUTBOUND` via `fromMe`).
7. Deduplicar eco de mensagem enviada (quando webhook devolve a propria mensagem).
8. Publicar eventos realtime.

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

Publicacao de eventos:

`apps/api/src/event-bus.ts`
