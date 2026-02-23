# Arquitetura do MVP

## Objetivo tecnico

Montar um fluxo omnichannel com separacao clara entre:

1. Interface de atendimento.
2. API de negocio multi-tenant.
3. Processamento assincrono de envio.
4. Persistencia de dados.
5. Integracao com canal externo (Evolution/WhatsApp).

## Componentes

1. `web` (Nuxt 4 + Nuxt UI)
2. `web-bff` (rotas server do Nuxt para proxy HTTP `/api/bff/*`)
3. `api` (Fastify + Prisma + JWT + Socket.IO)
4. `worker` (BullMQ para envio outbound)
5. `postgres` (dados transacionais)
6. `redis` (fila e pub/sub realtime)
7. `evolution` (conector WhatsApp nao oficial; profile opcional)

## Fluxo de entrada (inbound)

1. Usuario final envia mensagem no WhatsApp.
2. Evolution recebe do WhatsApp Web e chama webhook da API.
3. API processa webhook em `POST /webhooks/evolution/:tenantSlug`.
4. API cria/atualiza conversa e grava mensagem inbound.
5. API publica evento no Redis.
6. Socket.IO envia atualizacao em tempo real para agentes do tenant.

## Fluxo de saida (outbound)

1. Agente envia mensagem pela Inbox no Nuxt.
2. Front chama BFF local (`/api/bff/conversations/...`).
3. BFF encaminha request para API Node.
4. API grava mensagem com status `PENDING`.
5. API enfileira job no BullMQ.
6. Worker consome fila, chama endpoint de envio da Evolution.
7. Worker atualiza status para `SENT` ou `FAILED`.
8. Worker publica evento para atualizar UI em tempo real.

## Multi-tenant

1. Tenant identificado no JWT (`tenantId`, `tenantSlug`).
2. Todas as consultas de conversa/mensagem/usuario filtram por `tenantId`.
3. Um tenant representa uma empresa.
4. Cada tenant pode ter sua propria `whatsappInstance` e `evolutionApiKey`.

## Escalabilidade

1. API e Worker sao stateless.
2. Estado de fila/eventos fica no Redis.
3. Estado transacional fica no Postgres.
4. Para escalar:
   - subir mais replicas de `api`
   - subir mais replicas de `worker`
   - manter Redis/Postgres gerenciados e monitorados

## Onde cada responsabilidade vive

1. Autenticacao JWT: `apps/api/src/plugins/auth.ts`
2. Endpoints de tenant e canal: `apps/api/src/routes/tenant.ts`
3. Endpoints de usuarios: `apps/api/src/routes/users.ts`
4. Endpoints de conversa/mensagem: `apps/api/src/routes/conversations.ts`
5. Webhook de entrada: `apps/api/src/routes/webhooks.ts`
6. Cliente Evolution: `apps/api/src/services/evolution-client.ts`
7. Worker outbound: `apps/api/src/workers/outbound-worker.ts`
8. Modulo Inbox front: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
9. Estado e dominio da Inbox: `apps/web/composables/omnichannel/useOmnichannelInbox.ts`
10. Modulo admin front: `apps/web/components/omnichannel/OmnichannelAdminModule.vue`
11. Wrappers de rota do modulo: `apps/web/pages/index.vue` e `apps/web/pages/admin.vue`
12. Estado de sessao front (Pinia): `apps/web/stores/auth.ts`
13. Cliente HTTP front: `apps/web/composables/useApi.ts`
14. BFF Nuxt (proxy HTTP): `apps/web/server/api/bff/[...path].ts`
