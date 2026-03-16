# Backend

Este documento descreve a estrutura operacional do backend e a regra de modularizacao das rotas grandes.

## Regra de manutencao

Qualquer alteracao estrutural em rotas, services, filas, webhooks ou contratos do backend deve ser registrada neste arquivo no mesmo ciclo da mudanca.

## Objetivo

- reduzir risco de regressao em arquivos monoliticos
- manter entrypoints publicos estaveis durante refatoracao
- separar responsabilidades por dominio
- preservar um backup completo enquanto a migracao modular ainda nao terminou

## Integracao com front principal (2026-03-04)

- Front principal: `apps/omni-nuxt-ui`.
- Modulo omnichannel no front chama esta API (`apps/api`) via BFF Nuxt:
  - browser -> `apps/omni-nuxt-ui/server/api/bff/[...path].ts`
  - BFF -> `NUXT_API_INTERNAL_BASE` (default `http://api:4000`)
- O backend operacional do modulo continua isolado aqui em `apps/api`.

## Padrao de modularizacao

Para rotas grandes, o padrao agora e:

1. manter o entrypoint publico original em `apps/api/src/routes/*.ts`
2. criar uma pasta dedicada do dominio em `apps/api/src/routes/<dominio>/`
3. mover a implementacao atual para um arquivo de backup completo (`<dominio>-backup.ts`) ou preservar um backup equivalente
4. criar um `index.ts` e um `register-routes.ts` pequenos
5. iniciar a extracao progressiva por responsabilidade sem quebrar import externo

Enquanto a modularizacao nao estiver concluida, deve existir um backup unico (`*-backup.ts`) como referencia de rollback. O `*-legado.ts` pode ser usado como registrador fino durante a migracao.

## Estrutura atual

- `apps/api/src/routes/conversations.ts`
  - facade publica do modulo de conversas
  - mantem o import antigo estavel para `main.ts`
- `apps/api/src/routes/conversations/index.ts`
  - entrypoint da pasta modular de conversas
- `apps/api/src/routes/conversations/register-routes.ts`
  - facade do registrador do modulo
  - delega para o registrador fino atual
- `apps/api/src/routes/conversations/conversations-legado.ts`
  - registrador fino atual de `conversationRoutes`
  - apenas compoe os registradores especializados
- `apps/api/src/routes/conversations/conversations-backup.ts`
  - backup monolitico preservado do modulo de conversas
  - nao deve ser usado como entrypoint; serve como referencia de rollback
- `apps/api/src/routes/conversations/schemas.ts`
  - primeiro corte interno do modulo de conversas
  - concentra schemas zod de payload e query
- `apps/api/src/routes/conversations/types.ts`
  - primeiro corte interno do modulo de conversas
  - concentra tipos locais de apoio do dominio
- `apps/api/src/routes/conversations/object-utils.ts`
  - utilitarios basicos compartilhados do dominio
- `apps/api/src/routes/conversations/reactions.ts`
  - helpers de metadata de reacoes
- `apps/api/src/routes/conversations/participants.ts`
  - resolucao de participante, grupo e busca de contato auxiliar
- `apps/api/src/routes/conversations/realtime.ts`
  - mapeadores de payload para realtime e preview de conversa
- `apps/api/src/routes/conversations/media.ts`
  - helpers de midia, download e rehidratacao
- `apps/api/src/routes/conversations/sandbox.ts`
  - regras e validacao do sandbox
- `apps/api/src/routes/conversations/message-actions.ts`
  - helpers de encaminhamento e exclusao para todos
- `apps/api/src/routes/conversations/routes-core.ts`
  - facade do bloco core de conversas
- `apps/api/src/routes/conversations/routes-message-read.ts`
  - facade do bloco de leitura de mensagens
- `apps/api/src/routes/conversations/routes-group.ts`
  - participantes de grupo
- `apps/api/src/routes/conversations/routes-message-write.ts`
  - facade do bloco de escrita de mensagens
- `apps/api/src/routes/conversations/routes-operational.ts`
  - facade do bloco operacional
- `apps/api/src/routes/conversations/routes-core-list.ts`
  - listagem de conversas
- `apps/api/src/routes/conversations/routes-core-sandbox.ts`
  - rota de sandbox test
- `apps/api/src/routes/conversations/routes-core-create.ts`
  - criacao de conversa
- `apps/api/src/routes/conversations/routes-message-read-list.ts`
  - listagem de mensagens da conversa
- `apps/api/src/routes/conversations/routes-message-read-single.ts`
  - leitura de uma mensagem especifica
- `apps/api/src/routes/conversations/routes-message-read-media.ts`
  - proxy e entrega de midia da mensagem
- `apps/api/src/routes/conversations/routes-message-write-send.ts`
  - envio de mensagem
- `apps/api/src/routes/conversations/routes-message-write-delete-for-me.ts`
  - apagar para mim
- `apps/api/src/routes/conversations/routes-message-write-delete-for-all.ts`
  - apagar para todos
- `apps/api/src/routes/conversations/routes-message-write-forward.ts`
  - encaminhamento
- `apps/api/src/routes/conversations/routes-operational-reaction.ts`
  - reacoes
- `apps/api/src/routes/conversations/routes-operational-reprocess.ts`
  - reprocessamento individual
- `apps/api/src/routes/conversations/routes-operational-reprocess-failed.ts`
  - reprocessamento em lote
- `apps/api/src/routes/conversations/routes-operational-assign.ts`
  - atribuicao de conversa
- `apps/api/src/routes/conversations/routes-operational-status.ts`
  - alteracao de status
- `apps/api/src/routes/webhooks.ts`
  - facade publica do modulo de webhook
- `apps/api/src/routes/webhooks/`
  - modulo de webhook ja quebrado em facades e submodulos por dominio
- `apps/api/src/routes/tenant.ts`
  - facade publica do modulo de tenant
  - mantem o import antigo estavel para `main.ts`
- `apps/api/src/routes/tenant/index.ts`
  - entrypoint da pasta modular de tenant
- `apps/api/src/routes/tenant/register-routes.ts`
  - facade do registrador do modulo
  - delega para o registrador fino atual
- `apps/api/src/routes/tenant/tenant-legado.ts`
  - registrador fino atual de `tenantRoutes`
  - apenas compoe os registradores especializados
- `apps/api/src/routes/tenant/tenant-backup.ts`
  - backup monolitico preservado do modulo de tenant
  - nao deve ser usado como entrypoint; serve como referencia de rollback
- `apps/api/src/routes/tenant/schemas.ts`
  - schemas zod de payload e query do dominio
- `apps/api/src/routes/tenant/helpers.ts`
  - barrel de compatibilidade dos helpers de tenant
- `apps/api/src/routes/tenant/tenant-response.ts`
  - barrel de compatibilidade para resposta do tenant
- `apps/api/src/routes/tenant/tenant-evolution.ts`
  - barrel de compatibilidade para operacoes Evolution do tenant
- `apps/api/src/routes/tenant/tenant-whatsapp-utils.ts`
  - barrel de compatibilidade para utilitarios de WhatsApp do tenant
- `apps/api/src/routes/tenant/tenant-endpoint-probes.ts`
  - barrel de compatibilidade para probes/validacao de endpoints
- `apps/api/src/routes/tenant/tenant-capacity.ts`
  - limites, capacidade e permissao sensivel do tenant
- `apps/api/src/routes/tenant/tenant-response-mapper.ts`
  - payload final de resposta do tenant para o front
- `apps/api/src/routes/tenant/tenant-evolution-config.ts`
  - API key e client Evolution
- `apps/api/src/routes/tenant/tenant-evolution-tenant.ts`
  - tenant lookup, nome de instancia e conflito de instancia
- `apps/api/src/routes/tenant/tenant-webhook-config.ts`
  - webhook URL, headers e path templates
- `apps/api/src/routes/tenant/tenant-qr-utils.ts`
  - parse de QR e pairing code
- `apps/api/src/routes/tenant/tenant-date-utils.ts`
  - normalizacao de datas para dashboard
- `apps/api/src/routes/tenant/tenant-endpoint-validation.ts`
  - classificacao e mensagens de validacao de endpoint
- `apps/api/src/routes/tenant/tenant-endpoint-catalog.ts`
  - catalogo de probes de validacao da Evolution
- `apps/api/src/routes/tenant/routes-core.ts`
  - `/me`, `/tenant` e `PATCH /tenant`
- `apps/api/src/routes/tenant/routes-clients.ts`
  - leitura de clientes a partir do `platform-core` (`GET /clients`)
  - leitura/criacao de usuarios por cliente via `platform-core` (`GET/POST /clients/:clientId/users`)
  - mutacoes legadas (`POST/PATCH/DELETE /clients` e `PATCH/DELETE /clients/:clientId/users/:userId`) foram desativadas com `501` para evitar duplicidade com o painel core
- `apps/api/src/routes/tenant/routes-audit.ts`
  - auditoria e dashboard de falhas
- `apps/api/src/routes/tenant/routes-whatsapp.ts`
  - facade do bloco de WhatsApp do tenant
- `apps/api/src/routes/tenant/routes-whatsapp-status.ts`
  - status da instancia e webhook
- `apps/api/src/routes/tenant/routes-whatsapp-validate.ts`
  - validacao dos endpoints da Evolution
- `apps/api/src/routes/tenant/routes-whatsapp-qrcode.ts`
  - geracao e resolucao de QR/pairing
- `apps/api/src/routes/tenant/routes-whatsapp-session.ts`
  - bootstrap, connect e logout

## Backlog futuro em conversations

O modulo de `conversations` esta aceitavel para o escopo atual. Os itens abaixo ficam registrados como melhoria futura e nao bloqueiam a base atual.

- reduzir os registradores especializados:
  - revisar `routes-message-read-media.ts`
  - revisar `routes-message-write-send.ts`
  - revisar `routes-message-write-forward.ts`
- extrair services dedicados para:
  - proxy de midia
  - reprocessamento
  - exclusao para todos
  - encaminhamento
- revisar `conversations-backup.ts` periodicamente:
  - manter apenas enquanto a migracao ainda estiver em andamento

## Backlog futuro em tenant

O modulo de `tenant` esta modularizado o suficiente para o escopo atual. Os itens abaixo ficam como melhoria futura e nao bloqueiam a base atual.

- revisar os arquivos ainda maiores de `tenant`:
  - `routes-whatsapp-session.ts`
  - `routes-whatsapp-validate.ts`
- revisar `tenant-backup.ts` periodicamente:
  - manter apenas enquanto a migracao ainda estiver em andamento

## Observacoes

- `conversations-legado.ts` e temporario como registrador fino. Quando a modularizacao de conversas estiver concluida, ele pode ser substituido por um `register-routes.ts` final ou removido.
- `conversations-backup.ts` e temporario e deve ser removido quando o modulo estiver estabilizado e a equipe nao precisar mais de rollback estrutural manual.
- o entrypoint publico nao mudou; `main.ts` continua importando `./routes/conversations.js`.
- `tenant-legado.ts` e temporario como registrador fino. Quando a modularizacao de tenant estiver concluida, ele pode ser substituido por um `register-routes.ts` final ou removido.
- `tenant-backup.ts` e temporario e deve ser removido quando o modulo estiver estabilizado e a equipe nao precisar mais de rollback estrutural manual.
- o entrypoint publico nao mudou; `main.ts` continua importando `./routes/tenant.js`.
