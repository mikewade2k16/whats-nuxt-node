# AGENTS.md - apps/atendimento-online-api

## Identidade do módulo

- papel: backend operacional do módulo `atendimento-online`
- status: ativo

## Responsabilidades

- conversas, mensagens e contatos
- inbox e atribuição operacional
- stickers e anexos operacionais
- webhooks do canal
- envio outbound via fila
- sweep de retenção
- projeção operacional mínima de tenant e user no schema `public`, vinculada por IDs do core

## Contratos que consome

- `ActorContext`: sessão principal vinda do `plataforma-api`
- `TenantContext`: tenant ativo vindo do token do core, de `x-selected-tenant-slug` e do contexto administrativo do shell (`x-client-id`) quando a sessão for platform/root
- `AccessPolicy`: módulos ativos e permissões resolvidos pelo `plataforma-api`
- `PersistenceProvider`: Prisma sobre o schema `public`
- `QueueProvider`: BullMQ para envio outbound
- `RealtimePublisher`: Redis + Socket.IO para atualização da inbox
- `ChannelGateway`: integração com `whatsapp-evolution-gateway`

## Contratos que exporta

- rotas operacionais de sessão/tenant, conversas e webhooks
- filas e workers de outbound e retenção
- resolvedor compartilhado de auth em `src/services/auth-context.ts`
- projeção de identidade core -> runtime local em `src/services/core-identity.ts`

## Persistência sob responsabilidade do módulo

- schema: `public`
- tabelas/modelos principais: `Tenant`, `User`, `WhatsAppInstance`, `WhatsAppInstanceUserAccess`, `SavedSticker`, `Conversation`, `Message`, `AuditEvent`, `Contact`, `HiddenMessageForUser`
- filas/storage: BullMQ no Redis para outbound; pub/sub realtime no Redis
- seeds locais: `prisma/seed.ts`

## Endpoints, filas e interfaces expostas

- `src/routes/session-context.ts`
- `src/routes/tenant/register-routes.ts`
- `src/routes/conversations/*`
- `src/routes/webhooks/*`
- `src/workers/outbound-worker.ts`
- `src/workers/retention-worker.ts`
- Socket.IO em `src/main.ts`

Regra:

- nao existe mais rota local de login para o painel neste módulo
- qualquer sessão administrativa deve nascer no `POST /core/auth/login` do `plataforma-api`

## Eventos e sinais de integração

- publicados: eventos realtime de inbox, mudanças de mensagem e atualização de conversa via Redis/Socket.IO
- consumidos: jobs BullMQ de outbound e webhooks do `whatsapp-evolution-gateway`
- sinais indiretos: contexto de tenant selecionado via `x-selected-tenant-slug` ou `x-client-id` do shell

## O que o módulo não pode conhecer

- auth paralela independente do `plataforma-api`
- regra administrativa de `finance`
- tabela interna do schema `platform_core`
- detalhe de tela concreta do `painel-web`
- decisão de RBAC baseada apenas em shadow local

## Checks mínimos de mudança

- `npm run prisma:generate`
- `npm run build`
- `npm run test:tenant:isolation`
- se alterar fila/outbound: `npm run test:media:integration`
- se alterar gate de acesso: `npm run test:gate:mvp`

## Realidade atual que precisa ser conhecida

- HTTP e Socket.IO aceitam `core token` como sessão principal
- o login principal vive em `POST /core/auth/login` no `plataforma-api`; o módulo não expõe mais login próprio
- `POST /session/context` apenas atualiza o contexto operacional de tenant para platform admins e reaproveita o mesmo `core token`
- no runtime hospedado, o shell pode selecionar o tenant efetivo do módulo por `x-client-id` sem exigir login paralelo nem shadow de sessão
- vários fluxos ainda dependem de projeção local de `Tenant` e `User` por causa das FKs operacionais
- `Tenant.coreTenantId`, `User.coreUserId` e `User.coreTenantUserId` são o vínculo canônico da projeção com o `plataforma-api`
- quando auth, users ou clients divergirem entre `public` e `platform_core`, considerar o core como fonte de verdade

## Direção arquitetural

- manter a projeção local estritamente derivada do core, sem autenticação paralela nem match por conveniência
- usar `plataforma-api` como contexto real de auth e módulos
- manter o módulo focado em operação omnichannel, webhooks, fila e histórico operacional

## Funções desejadas do módulo

- autocaptura de contato inbound: quando um número enviar mensagem e ainda não existir em `Contact`, o módulo deve criar o contato automaticamente no tenant correto
- projeção de lead para o shell: todo contato autocapturado deve poder ser publicado em um contrato explícito para o fluxo de leads/kanban do shell, sem acoplamento direto de tela
- idempotência obrigatória: a autocaptura não pode gerar contatos duplicados nem duplicar lead quando a mesma conversa receber várias mensagens seguidas
- rastreabilidade mínima: o evento de autocaptura deve registrar origem (`whatsapp`), instância, tenant, horário e se houve criação ou reaproveitamento do contato existente
