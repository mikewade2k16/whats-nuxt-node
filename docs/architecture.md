# Arquitetura do MVP

## Objetivo tecnico

Montar um fluxo omnichannel com separacao clara entre:

1. Interface de atendimento.
2. API de negocio multi-tenant.
3. Processamento assincrono de envio.
4. Persistencia de dados.
5. Integracao com canal externo (Evolution/WhatsApp).

## Componentes

1. `painel-web` (Nuxt 4 + Nuxt UI)
2. `web-bff` (rotas server do Nuxt para proxy HTTP `/api/bff/*`)
3. `atendimento-online-api` (Fastify + Prisma + JWT + Socket.IO)
4. `atendimento-online-worker` (BullMQ para envio outbound)
5. `atendimento-online-retencao-worker` (expurgo diario por `retentionDays` de cada tenant)
6. `postgres` (dados transacionais)
7. `redis` (fila e pub/sub realtime)
8. `whatsapp-evolution-gateway` (conector WhatsApp nao oficial; profile opcional)

## Decisao de runtime atual

Decisao registrada em `2026-04-04`:

1. `atendimento-online-worker` permanece como servico separado no runtime atual.
2. `atendimento-online-retencao-worker` continua temporariamente separado, mas entrou no backlog como primeiro candidato real a fusao futura.
3. `whatsapp-evolution-gateway` permanece opcional via profile `channels`.
4. `adminer` e `redis-commander` permanecem fora do boot padrao via profile `ops`.
5. A consolidacao fisica do runtime fica para depois da estabilizacao modular e da validacao online na VPS.

## Separacao de dominios (alvo pos-MVP)

1. `omnichannel-api` fica responsavel apenas por:
   - conversas, mensagens, webhooks, outbound queue, websocket de atendimento.
2. `plataforma-api` (separado) fica responsavel por:
   - autenticacao, RBAC global do painel, clientes (tenant), usuarios do painel, planos e billing.
3. `crm` (separado) fica responsavel por:
   - cadastro comercial (lead/cliente), pipeline e dados de relacionamento.
4. `automation` e `ai-assistant` (separados) ficam responsaveis por:
   - bots, workflows, copiloto e inteligencia aplicada no atendimento.
5. Integracao entre os dominios:
   - via JWT/claims do core e contratos HTTP/eventos entre modulos.
6. Objetivo:
   - evitar acoplamento entre atendimento e identidade/plataforma, reduzindo regressao e melhorando escala por modulo.
7. Matriz funcional por ownership:
   - `docs/modular-feature-matrix.md`.

## Fluxo de entrada (inbound)

1. Usuario final envia mensagem no WhatsApp.
2. Evolution recebe do WhatsApp Web e chama webhook da API.
3. API processa webhook em `POST /webhooks/evolution/:tenantSlug`.
4. API cria/atualiza conversa e grava mensagem inbound (texto e/ou midia).
5. API publica evento no Redis.
6. Socket.IO envia atualizacao em tempo real para agentes do tenant.

## Fluxo de saida (outbound)

1. Agente envia mensagem pela Inbox no Nuxt.
2. Front chama BFF local (`/api/bff/conversations/...`).
3. BFF encaminha request para API Node.
4. API grava mensagem com status `PENDING`.
5. API enfileira job no BullMQ.
6. Worker consome fila, chama endpoint de envio da Evolution conforme tipo (`sendText`, `sendMedia`, `sendWhatsAppAudio`).
   - bloco `IMAGE`: `sendImageMessage`
   - bloco `VIDEO`: `sendVideoMessage`
   - bloco `DOCUMENT`: `sendDocumentMessage`
   - bloco `AUDIO`: `sendAudioMessage` (com fallback para envio como documento)
7. Worker atualiza status para `SENT` ou `FAILED`.
8. Worker publica evento para atualizar UI em tempo real.
9. Eventos realtime sanitizam `mediaUrl` em formato `data:` para evitar payload gigante no Redis/Socket.

## Fluxo de retencao (expurgo)

1. `atendimento-online-retencao-worker` inicia e executa sweep inicial (quando `RETENTION_SWEEP_ON_BOOT=true`).
2. Para cada tenant, calcula cutoff com base em `tenant.retentionDays`.
3. Remove mensagens antigas (`Message.createdAt < cutoff`).
4. Remove conversas antigas sem mensagens.
5. Agenda novo sweep no intervalo `RETENTION_SWEEP_INTERVAL_MINUTES`.

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
   - subir mais replicas de `atendimento-online-api`
   - subir mais replicas de `atendimento-online-worker`
   - subir mais replicas de `atendimento-online-retencao-worker` apenas com coordenacao (ou manter 1 replica)
   - manter Redis/Postgres gerenciados e monitorados

## Onde cada responsabilidade vive

1. Autenticacao JWT: `apps/atendimento-online-api/src/plugins/auth.ts`
2. Endpoints de tenant e canal: `apps/atendimento-online-api/src/routes/tenant.ts`
3. Endpoints de usuarios: `apps/atendimento-online-api/src/routes/users.ts`
   - leitura/criacao usa `plataforma-api` como fonte de verdade e sincroniza shadow local para compatibilidade de conversas/atribuicao
4. Endpoints de conversa/mensagem: `apps/atendimento-online-api/src/routes/conversations.ts`
5. Webhook de entrada: `apps/atendimento-online-api/src/routes/webhooks.ts`
6. Cliente Evolution: `apps/atendimento-online-api/src/services/evolution-client.ts`
7. Worker outbound: `apps/atendimento-online-api/src/workers/outbound-worker.ts`
   - senders por tipo: `apps/atendimento-online-api/src/workers/senders/send-media.ts`
8. Worker de retencao: `apps/atendimento-online-api/src/workers/retention-worker.ts`
9. Servico de retencao: `apps/atendimento-online-api/src/services/retention-service.ts`
10. Modulo Inbox front: `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue`
11. Estado e dominio da Inbox: `apps/painel-web/app/composables/omnichannel/useOmnichannelInbox.ts`
12. Modulo admin front: `apps/painel-web/app/components/omnichannel/OmnichannelAdminModule.vue`
13. Estado e dominio do Admin: `apps/painel-web/app/composables/omnichannel/useOmnichannelAdmin.ts`
14. Wrappers de rota do modulo: `apps/painel-web/app/pages/index.vue` e `apps/painel-web/app/pages/admin.vue`
15. Estado de sessao front (Pinia): `apps/painel-web/app/stores/auth.ts`
16. Cliente HTTP front: `apps/painel-web/app/composables/useApi.ts`
17. BFF Nuxt (proxy HTTP): `apps/painel-web/server/api/bff/[...path].ts`
