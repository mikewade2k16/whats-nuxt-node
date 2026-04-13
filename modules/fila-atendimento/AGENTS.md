# AGENTS.md - modules/fila-atendimento

## Identidade do módulo

- papel: módulo plugável de fila, operação, relatórios e analytics operacionais
- status: integração ativa no runtime principal
- entrada atual no host: `/admin/fila-atendimento`

## Responsabilidades

- fila de atendimento
- operação da loja/unidade
- relatórios operacionais
- analytics da operação
- configurações operacionais por loja
- roster operacional de consultores, sem ser dono da identidade global
- sinais realtime de atualização operacional

## Contratos que consome

- obrigatórios:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
  - `StoreScopeProvider`
  - `PersistenceProvider`
  - `ModuleRegistry`
  - `Clock`
- opcionais:
  - `IdentityProvisioner`
  - `RealtimeContextResolver`
  - `DomainEventBus`
  - `AuditSink`
  - `UsersDirectory`
  - `CustomersFeed`

## Contratos que exporta

- rotas e handlers operacionais de fila e operação
- componentes e páginas plugáveis do domínio
- DTOs de operação, relatórios e analytics
- sinais realtime de atualização operacional
- manifesto do módulo
- cenários de regressão do módulo

## Protocolo de integração

- entrada: request envelope serializável em JSON, conforme `packages/shell-contracts/examples/module-request-envelope.example.json`
- saída: response envelope serializável em JSON, conforme `packages/shell-contracts/examples/module-response-envelope.example.json`
- regra: o módulo declara o que precisa; o shell resolve e injeta esse contexto
- `HTTP + JSON` é a borda canônica; adapters internos podem usar tipos nativos quando isso não quebrar o contrato publicado

## Sessão integrada atual

- o shell gera um bridge efêmero para o módulo
- o painel inicia a sessão do módulo por `POST /api/admin/modules/fila-atendimento/session`
- o backend do módulo troca o bridge em `POST /v1/auth/shell/exchange`
- o módulo mantém sua própria sessão depois da troca
- o vínculo externo do shell é estabilizado por `provider + user_id`, permitindo rotação de `external_subject` sem quebrar a sessão integrada
- cadastro, nivel, loja vinculada e liberacao de acesso ficam centralizados na pagina global de usuarios do shell
- o bridge do shell passa a ser o caminho principal de entrada; papel e escopo devem respeitar `level`, `businessRole` e loja vinculada do core
- quando o bridge do shell estiver habilitado, `POST /v1/auth/login` deve ficar aposentado no runtime hospedado e orientar o uso do shell
- o runtime hospedado nao deve expor CRUD administrativo proprio de usuarios; o modulo apenas consome a sessao autorizada do shell

Campos obrigatórios do bridge quando houver escopo de tenant:

- `tenantSlug`
- `scopeMode`

Regra operacional importante:

- como o host autentica por header (`x-core-token`), `bootstrap`, `session`, `context` e `operations-snapshot` devem ser chamados pelo BFF do painel
- a validação mínima de SSO deve cobrir `shellBridgeToken -> /v1/auth/shell/exchange -> /v1/me/context -> /v1/operations/snapshot`

## Persistência sob responsabilidade do módulo

- ownership atual distribuído em `incubadora/fila-atendimento/back`
- ownership oficial alvo do domínio:
  - `consultants`
  - `store_operation_settings`
  - `store_setting_options`
  - `store_catalog_products`
  - `operation_queue_entries`
  - `operation_active_services`
  - `operation_paused_consultants`
  - `operation_current_status`
  - `operation_status_sessions`
  - `operation_service_history`
  - `user_external_identities` enquanto a sessão integrada continuar usando vínculo `provider + user_id`

- dependências legadas transitórias ainda presentes no pack de migrations da incubadora:
  - `users`
  - `tenants`
  - `stores`
  - `user_platform_roles`
  - `user_tenant_roles`
  - `user_store_roles`

- regra de corte da Fase 2:
  - o runtime hospedado ainda aceita essas tabelas legadas porque o pacote externo da incubadora continua sendo a implementação concreta
  - nenhum slice novo pode ampliar esse legado nem criar novas dependências sobre auth local, tenant local ou cadastro local de lojas
  - o próximo corte estrutural deve trocar a implementação concreta preservando como ownership oficial apenas as tabelas do domínio e o vínculo externo necessário para SSO do módulo

Regra:

- auth global, tenants globais e cadastro principal de usuários não pertencem a este módulo

## Runtime atual

- backend hospedado em `apps/plataforma-api` no prefixo `/core/modules/fila-atendimento`
- implementação concreta atual do backend hospedado em `modules/fila-atendimento/backend`
- frontend hospedado em `apps/painel-web` na rota `/admin/fila-atendimento`
- persistência no mesmo PostgreSQL do shell, com schema próprio `fila_atendimento`
- bootstrap do host: `apps/painel-web/server/api/admin/modules/fila-atendimento/bootstrap.get.ts`
- BFF de sessão: `apps/painel-web/server/api/admin/modules/fila-atendimento/session.post.ts`
- BFF de consultants: `apps/painel-web/server/api/admin/modules/fila-atendimento/consultants.get.ts`

## Estado atual da incorporação

- feito em `2026-04-06`:
  - foi criada a primeira fronteira Go exportada do módulo em `incubadora/fila-atendimento/back/moduleapi/contracts`
  - `operations` deixou de depender estruturalmente de `auth.Principal` na borda HTTP e agora aceita `AccessContextResolver` + `RouteGuard`, mantendo adapter legado para o runtime atual
  - o backend hospedado atual já monta `operations` pela nova borda genérica, reduzindo o acoplamento do boot ao auth local
  - o escopo de lojas de `operations` saiu do adapter local do `app` e passou a ser fornecido por `stores.ScopeProvider`, reduzindo mais um acoplamento do boot hospedado
  - smoke hospedado executado no compose principal com `root@core.local`: `bootstrap`, `session`, `context`, `operations-snapshot` e `overview` responderam no fluxo `painel-web -> plataforma-api -> módulo`
  - `reports` e `analytics` passaram a usar `AccessContext` + `StoreCatalogProvider`; o boot hospedado deixou de injetar `stores.Service` diretamente nesses slices
  - `settings` passou a usar `AccessContext` na regra de negócio e a borda HTTP genérica, reduzindo mais um acoplamento do runtime ao auth local
  - `realtime` passou a usar `RealtimeContextResolver` no handshake websocket; o boot hospedado deixou de injetar auth/store/tenant diretamente no service principal e preservou compatibilidade via adapter local
  - `consultants` passou a usar `AccessContext` + `StoreCatalogProvider` + `IdentityProvisioner`; o boot hospedado deixou de injetar hasher/auth direto na regra de negócio e preservou compatibilidade via adapter local
  - smoke hospedado também validou `reports/multistore-overview`, `reports/overview`, `analytics/ranking`, `analytics/intelligence` e `settings`
  - smoke hospedado de `GET /v1/consultants?storeId=...` respondeu no fluxo integrado com roster e contas vinculadas
  - smoke reversível de write-path foi fechado via `settings`: criação e remoção imediata de option item no mesmo store, sem resíduo operacional permanente
  - o host de `apps/painel-web/app/components/admin/modules/FilaAtendimentoHost.vue` deixou de ser apenas diagnóstico e passou a renderizar uma primeira workspace operacional hospedada com contexto, snapshot e roster real
  - após restart do `painel-web`, o runtime do host validou no compose principal a cadeia `session -> context -> consultants -> operations-snapshot`; sem autenticação a rota do novo BFF responde `403 login-required`, confirmando que o endpoint está servido pelo Nuxt
  - o painel ganhou BFFs finos para `reports-overview`, `reports-results`, `reports-recent-services`, `analytics-ranking`, `analytics-data`, `analytics-intelligence` e `settings`; o host agora renderiza resumos hospedados de operação, relatórios, analytics e configuração por loja
  - o painel ganhou `realtime-ticket.post.ts` e proxies websocket em `/ws/fila-atendimento/operations` e `/ws/fila-atendimento/context`; o smoke do preview validou handshake completo do bridge de operações com `realtime.connected`
  - o canal de contexto ficou scaffoldado no servidor, mas o handshake direto do upstream ainda retorna `403` com o tenant id hoje disponível no host; por isso a conexão automática desse tópico ficou desligada no `FilaAtendimentoHost.vue` até fechar o mapeamento correto
  - o `plataforma-api` ganhou um pacote local de runtime hospedado para `fila-atendimento`; o `main.go` deixou de importar a incubadora diretamente e passou a tratar o módulo por uma borda local, preparando a troca futura da implementação concreta sem espalhar acoplamento externo pelo serviço
  - o backend concreto usado pelo build do `plataforma-api` saiu de `incubadora/fila-atendimento/back` e passou para `modules/fila-atendimento/backend`; a incubadora deixou de ser a fonte principal do runtime ativo
- fatia atual priorizada:
  - estabilizar `operations` como primeiro slice testável do backend hospedado
- próximo corte recomendado:
	- manter mutações de sucesso de `operations` fora do ambiente compartilhado enquanto a trilha append-only (`operation_status_sessions`, `operation_service_history`) continuar sendo o caminho oficial
  - fechar o mapeamento de tenant do tópico `context.updated` para ligar o segundo canal realtime sem alerta falso no host
  - decidir se `reports-results` e `analytics-data` entram no host atual ou ficam reservados para telas dedicadas, já que o resumo hospedado principal está coberto

## O que o módulo não pode conhecer

- auth paralela própria como dependência permanente
- CRUD principal de tenants
- CRUD principal de usuários do painel
- layout ou store global do shell como dependência rígida
- regra interna de `finance`
- regra interna de `atendimento-online`
- acesso direto a tabelas privadas do `plataforma-api`

## Checks mínimos de mudança

- `go test ./...` em `incubadora/fila-atendimento/back`
- `npm --prefix apps/painel-web run build`
- `docker compose -f docker-compose.yml config`
