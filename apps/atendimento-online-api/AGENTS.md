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
- configuração operacional local mínima por tenant canônico

## Contratos que consome

- `ActorContext`: sessão principal vinda do `plataforma-api`
- `TenantContext`: tenant ativo vindo do token do core, de `x-selected-tenant-slug` e do contexto administrativo do shell (`x-client-id`) quando a sessão for platform/root
- `AccessPolicy`: módulos ativos e permissões resolvidos pelo `plataforma-api`
- `TenantDirectory`: usuários do tenant lidos do core, sem shadow local
- `PersistenceProvider`: Prisma sobre o schema `atendimento_online`
- `QueueProvider`: BullMQ para envio outbound
- `RealtimePublisher`: Redis + Socket.IO para atualização da inbox
- `ChannelGateway`: integração com `whatsapp-evolution-gateway`

## Contratos que exporta

- rotas operacionais de sessão/contexto, tenant runtime, conversas e webhooks
- filas e workers de outbound e retenção
- resolvedor compartilhado de auth em `src/services/auth-context.ts`
- resolvedores de diretório e runtime em `src/services/core-tenant-directory.ts` e `src/services/tenant-runtime.ts`

## Persistência sob responsabilidade do módulo

- schema: `atendimento_online`
- tabelas/modelos principais: `AtendimentoTenantConfig`, `WhatsAppInstance`, `SavedSticker`, `Conversation`, `Message`, `AuditEvent`, `Contact`, `HiddenMessageForUser`
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

- não existe rota local de login para o painel neste módulo
- qualquer sessão administrativa deve nascer no `POST /core/auth/login` do `plataforma-api`

## Eventos e sinais de integração

- publicados: eventos realtime de inbox, mudanças de mensagem e atualização de conversa via Redis/Socket.IO
- consumidos: jobs BullMQ de outbound e webhooks do `whatsapp-evolution-gateway`
- sinais indiretos: contexto de tenant selecionado via `x-selected-tenant-slug` ou `x-client-id` do shell

## O que o módulo não pode conhecer

- auth paralela independente do `plataforma-api`
- regra administrativa de `finance`
- tabela interna do schema `platform_core` fora dos contratos de serviço
- detalhe de tela concreta do `painel-web`
- decisão de RBAC baseada apenas em tabela local do módulo

## Checks mínimos de mudança

- `npm run prisma:generate`
- `npm run build`
- `npm run prisma:seed` quando alterar seed ou schema operacional
- `npm run test:tenant:isolation`
- se alterar fila/outbound: `npm run test:media:integration`
- se alterar gate de acesso: `npm run test:gate:mvp`

## Realidade atual que precisa ser conhecida

- HTTP e Socket.IO aceitam `core token` como sessão principal
- o login principal vive em `POST /core/auth/login` no `plataforma-api`; o módulo não expõe mais login próprio
- `POST /session/context` apenas atualiza o contexto operacional de tenant para platform admins e reaproveita o mesmo `core token`
- no runtime hospedado, o shell pode selecionar o tenant efetivo do módulo por `x-client-id` sem exigir login paralelo nem shadow de sessão
- `Tenant` e `User` locais foram removidos do schema Prisma
- colunas como `tenantId`, `assignedToId`, `senderUserId`, `actorUserId`, `createdByUserId`, `responsibleUserId` e `userId` armazenam ids canônicos do core
- a elegibilidade por instância não é mais persistida localmente; o módulo assume o grant resolvido no `platform_core`
- `evolutionApiKey` não é mais persistido no banco do módulo; o runtime usa apenas segredo de ambiente
- quando auth, users, clients ou limits divergirem entre runtime e `platform_core`, considerar o core como fonte de verdade

## Direção arquitetural

- manter o módulo focado em operação omnichannel, webhooks, fila e histórico operacional
- usar `plataforma-api` como contexto real de auth, módulos, limits e diretório de usuários
- manter configuração local apenas quando ela for estritamente operacional ao runtime
- manter o schema `atendimento_online` como owner físico do runtime operacional do módulo

## Funções desejadas do módulo

- autocaptura de contato inbound: quando um número enviar mensagem e ainda não existir em `Contact`, o módulo deve criar o contato automaticamente no tenant correto
- projeção de lead para o shell: todo contato autocapturado deve poder ser publicado em um contrato explícito para o fluxo de leads/kanban do shell, sem acoplamento direto de tela
- idempotência obrigatória: a autocaptura não pode gerar contatos duplicados nem duplicar lead quando a mesma conversa receber várias mensagens seguidas
- rastreabilidade mínima: o evento de autocaptura deve registrar origem (`whatsapp`), instância, tenant, horário e se houve criação ou reaproveitamento do contato existente
