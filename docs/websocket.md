# WebSocket e Webhooks

Este documento descreve a estrutura operacional do fluxo de webhook da Evolution e da entrega realtime por Socket.IO.

## Regra de manutencao

Qualquer alteracao em arquivos de webhook, socket, payload de evento, contratos de realtime ou parsers de mensagem deve ser registrada neste arquivo no mesmo ciclo da mudanca.

## Objetivo

- evitar regressao em um arquivo monolitico
- isolar responsabilidades por modulo
- permitir refatoracao progressiva sem quebrar o endpoint publico
- manter um backup estavel do webhook anterior enquanto a modularizacao nao termina

## Entry points

- `apps/api/src/main.ts`: registra `webhookRoutes` e inicializa o `Socket.IO`.
- `apps/api/src/routes/webhooks.ts`: facade publica minima. Mantem o import antigo estavel e reexporta a versao modular.
- `apps/api/src/routes/webhooks/index.ts`: entrypoint da pasta modular.

## Estrutura atual

- `apps/api/src/routes/webhooks/register-routes.ts`
  - registra a rota `POST /webhooks/evolution/:tenantSlug` e `POST /webhooks/evolution/:tenantSlug/:eventName`
  - concentra a orquestracao do request, validacao inicial e delega os handlers por branch
- `apps/api/src/routes/webhooks/handlers/message-upsert.ts`
  - orquestra o branch principal de persistencia de mensagem e delega subfluxos
- `apps/api/src/routes/webhooks/handlers/message-upsert/preflight.ts`
  - isola a pre-validacao do payload e a resolucao de `content`
- `apps/api/src/routes/webhooks/handlers/message-upsert/context.ts`
  - resolve contexto de conversa, nomes, avatar, group info e metadata enriquecido
- `apps/api/src/routes/webhooks/handlers/message-upsert/events.ts`
  - isola a publicacao de `message.created`, `message.updated` e `conversation.updated`
- `apps/api/src/routes/webhooks/handlers/message-upsert/deduplication.ts`
  - isola busca por mensagem existente, reconciliacao de echo outbound e sincronizacao de status
- `apps/api/src/routes/webhooks/handlers/message-upsert/sync-stage.ts`
  - isola a reconciliacao de pending outbound e o sync da mensagem existente
- `apps/api/src/routes/webhooks/handlers/message-upsert/persistence.ts`
  - isola a criacao da mensagem quando ela ainda nao existe
- `apps/api/src/routes/webhooks/handlers/message-upsert/correlation.ts`
  - isola a garantia de `correlationId` no metadata da mensagem
- `apps/api/src/routes/webhooks/handlers/message-upsert/sender-avatar.ts`
  - isola o fallback de avatar do remetente em grupos
- `apps/api/src/routes/webhooks/handlers/message-upsert/result.ts`
  - isola a montagem do response final do branch `message-upsert`
- `apps/api/src/routes/webhooks/handlers/qr.ts`
  - isola o fluxo de cache e resposta de QR
- `apps/api/src/routes/webhooks/handlers/reaction.ts`
  - isola o fluxo de reaction update, persistencia e `publishEvent`
- `apps/api/src/routes/webhooks/shared.ts`
  - facade minima para manter imports antigos estaveis
- `apps/api/src/routes/webhooks/shared-core.ts`
  - barrel de compatibilidade que reexporta os modulos finais
  - revisado para permanecer explicito, evitando colisao de nomes via `export *`
- `apps/api/src/routes/webhooks/webhook-contracts.ts`
  - concentra contratos base do webhook (`IncomingWebhookPayload`, `EvolutionContactMatch`)
- `apps/api/src/routes/webhooks/webhook-metadata.ts`
  - concentra metadados de request e validacao (`event`, `instance`, QR, token e sets de evento)
- `apps/api/src/routes/webhooks/object-utils.ts`
  - concentra utilitarios basicos compartilhados, hoje `asRecord`
- `apps/api/src/routes/webhooks/participant-identity.ts`
  - concentra identidade de participante/JID compartilhada entre `contacts`, `groups` e `mentions`
  - remove o acoplamento implicito entre esses modulos
- `apps/api/src/routes/webhooks/message-json.ts`
  - concentra merge e serializacao de metadata JSON do webhook
- `apps/api/src/routes/webhooks/message-parser.ts`
  - facade do parser ativo de mensagem (`parseIncomingMessage`)
  - delega a resolucao estrutural e o estado final para modulos menores
- `apps/api/src/routes/webhooks/message-parser-context.ts`
  - extrai a estrutura base do payload (`message`, `contextInfo`, `remoteJid`, `participantJid`)
- `apps/api/src/routes/webhooks/message-parser-state.ts`
  - resolve o estado final parseado (tipo, texto, midia, metadata, avatar, grupo)
- `apps/api/src/routes/webhooks/message-parser-text.ts`
  - separa parsing de texto, unwrap de payload e deteccao de tipo nao suportado
- `apps/api/src/routes/webhooks/message-parser-media.ts`
  - separa a superficie de parsing de midia e sticker/link preview
- `apps/api/src/routes/webhooks/message-parser-contact.ts`
  - separa a superficie de parsing de contatos recebidos
- `apps/api/src/routes/webhooks/message-parser-reply.ts`
  - separa a superficie de parsing de quoted reply
- `apps/api/src/routes/webhooks/media.ts`
  - facade da camada de midia do webhook
  - mantem os imports antigos estaveis e reexporta os submodulos
- `apps/api/src/routes/webhooks/media-url.ts`
  - concentra normalizacao de URL/base64/avatar e extracao de avatar em payloads
- `apps/api/src/routes/webhooks/media-link-preview.ts`
  - concentra normalizacao e extracao de link preview
- `apps/api/src/routes/webhooks/media-source.ts`
  - concentra descoberta de fonte de midia (base64, URL, URL criptografada)
- `apps/api/src/routes/webhooks/media-file.ts`
  - concentra labels, parse numerico e saneamento de nome/extensao de arquivo
- `apps/api/src/routes/webhooks/mentions.ts`
  - facade da camada de mencoes e reacoes
  - mantem os imports antigos estaveis e reexporta os submodulos
- `apps/api/src/routes/webhooks/mentions-targets.ts`
  - concentra deteccao de alvos de mencao e extracao de `mentionedJid`
- `apps/api/src/routes/webhooks/mentions-reactions.ts`
  - concentra contratos e mutacao de metadata de reacoes
- `apps/api/src/routes/webhooks/mentions-reaction-parser.ts`
  - concentra o parser do payload de reaction recebida
- `apps/api/src/routes/webhooks/mentions-enrichment.ts`
  - concentra o enriquecimento de metadata de mencoes com display names
- `apps/api/src/routes/webhooks/contacts.ts`
  - facade da camada de contatos
  - mantem os imports antigos estaveis e reexporta os submodulos
- `apps/api/src/routes/webhooks/contacts-inbound.ts`
  - concentra parsing de contato inbound, `vcard` e normalizacao de telefone
- `apps/api/src/routes/webhooks/contacts-match.ts`
  - concentra busca e selecao de contato via Evolution e extracao de avatar de payload
- `apps/api/src/routes/webhooks/contacts-tenant-users.ts`
  - concentra cache e resolucao de nomes de usuarios internos do tenant
- `apps/api/src/routes/webhooks/contacts-direct.ts`
  - concentra cliente Evolution e resolucao de nome para conversas diretas
- `apps/api/src/routes/webhooks/groups.ts`
  - facade da camada de grupos
  - mantem os imports antigos estaveis e reexporta os submodulos
- `apps/api/src/routes/webhooks/groups-payload.ts`
  - concentra nome/avatar do grupo e fallback de nome
- `apps/api/src/routes/webhooks/groups-participants.ts`
  - concentra resolucao de participantes de grupo (JIDs relacionados, avatar e nome)
- `apps/api/src/routes/webhooks/groups-conversation.ts`
  - concentra a resolucao final do nome de conversa de grupo
- `apps/api/src/routes/webhooks/old_webhook.ts`
  - backup compilavel do webhook original
  - nao deve ser importado pela aplicacao
  - serve apenas como referencia temporaria ate a modularizacao total terminar

## Fluxo realtime

1. Evolution chama o endpoint de webhook.
2. O registrador valida tenant e token de webhook (quando ativo).
3. O parser transforma payload bruto em contrato interno.
4. O backend persiste conversa/mensagem/reacao.
5. O backend publica evento em Redis via `publishEvent`.
6. O `Socket.IO` em `apps/api/src/main.ts` entrega o evento para a sala do tenant.

## Proximos cortes recomendados

- manter `message-parser-state.ts` sob controle:
  - se crescer de novo, quebrar por dominio interno (`metadata`, `avatar`, `media-state`)
- revisar `message-parser-state.ts` e os submodulos novos:
  - garantir que as facades continuem pequenas e sem logica acoplada
- manter `shared-core.ts` explicito:
  - nao trocar por `export *` generalizado se isso reintroduzir colisao entre facades
- revisar se alguns `asRecord` locais em modulos de parser devem convergir para `object-utils.ts`

## Observacoes

- `old_webhook.ts` e temporario. Quando a modularizacao estiver concluida, ele deve ser removido.
- `shared-legacy.ts` foi removido. A compatibilidade agora passa por `shared.ts` + `shared-core.ts`.
- O endpoint publico nao mudou. O contrato de import continua o mesmo para evitar regressao em `main.ts`.
