# AGENTS.md - operations

## Identidade do módulo

- papel: núcleo de fila operacional por loja e visão integrada da operação
- status: ativo no runtime atual e em transição de fronteira para o shell

## Responsabilidades

- gerar snapshot operacional por loja
- gerar overview integrado das lojas acessíveis
- enfileirar consultor
- pausar, retomar e deslocar para tarefa/reunião
- iniciar e encerrar atendimento
- persistir estado corrente da operação
- persistir histórico append-only e sessões de status

## Contratos que consome

- obrigatórias:
  - `AccessContext`
  - `Repository`
  - `StoreScopeProvider`
  - `EventPublisher`
- opcionais:
  - `AccessContextResolver` na borda HTTP
  - `RouteGuard`/middleware do host

## Contratos que exporta

- `Snapshot`
- `OperationOverview`
- `QueueCommandInput`, `PauseCommandInput`, `AssignTaskCommandInput`, `StartCommandInput`, `FinishCommandInput`
- `MutationAck`
- `RegisterRoutesWithOptions(...)` para hosts que injetam guard/resolver próprios
- `RegisterRoutes(...)` como adapter legado compatível com `auth.Middleware`
- `AccessContextFromShell(...)` e `AccessContextFromPrincipal(...)`

## Protocolo de integração

- entrada:
  - `GET /v1/operations/overview`
  - `GET /v1/operations/snapshot?storeId=...`
  - `POST /v1/operations/queue`
  - `POST /v1/operations/pause`
  - `POST /v1/operations/resume`
  - `POST /v1/operations/assign-task`
  - `POST /v1/operations/start`
  - `POST /v1/operations/finish`
- saída:
  - overview leve para leitura integrada
  - snapshot completo por loja para leitura operacional
  - `ack` mínimo para mutações, com revalidação posterior do frontend

## Persistência sob responsabilidade do módulo

- schema alvo: `fila_atendimento`
- tabelas correntes:
  - `operation_queue_entries`
  - `operation_active_services`
  - `operation_paused_consultants`
  - `operation_current_status`
- tabelas append-only:
  - `operation_status_sessions`
  - `operation_service_history`

## Endpoints, filas e interfaces expostas

- rotas HTTP `/v1/operations/*`
- `Service` plugável com `Repository + StoreScopeProvider + EventPublisher`
- borda HTTP desacoplável via `HTTPRouteOptions`

## Eventos e sinais de integração

- publicados:
  - invalidação operacional por loja via `EventPublisher`
- consumidos:
  - nenhum evento formal obrigatório; o host fornece contexto por adapter

## Estado atual da fase

- feito em `2026-04-06`:
  - `AccessContext` e `StoreScopeProvider` passaram a sair da fronteira exportada `moduleapi/contracts`
  - a borda HTTP deixou de depender estruturalmente de `auth.Principal` e agora aceita `AccessContextResolver` + `RouteGuard`
  - a compatibilidade com o runtime atual foi preservada em `RegisterRoutes(...)` por adapter legado
  - o app hospedado atual passou a montar `operations` por `RegisterRoutesWithOptions(...)` em vez de depender do wrapper legado
  - o escopo de lojas deixou de ser adaptado no `app`; `operations` agora consome o `stores.ScopeProvider` direto do módulo de lojas
  - smoke hospedado validado com `plataforma-api + painel-web`: `bootstrap`, `session`, `context`, `snapshot` e `overview` responderam com sucesso no compose local
- próximo corte recomendado:
	- preparar smoke real do fluxo hospedado de `operations`
	- depois substituir o provider de lojas atual por um provider vindo do shell quando a extração do catálogo estiver pronta
  - manter `operations` como primeira fatia testável do módulo hospedado

## O que o módulo não pode conhecer

- `auth.Principal` como contrato-base da regra de negócio
- CRUD completo de lojas do host
- detalhes internos de `stores.Service`
- sessão paralela do shell como dependência estrutural
- frontend concreto do painel

## Checks mínimos de mudança

- `go test ./...`
- smoke de `GET /v1/operations/overview`
- smoke de `GET /v1/operations/snapshot`
- smoke de ao menos uma mutação `POST /v1/operations/*` com revalidação posterior quando for seguro alterar o estado do ambiente local