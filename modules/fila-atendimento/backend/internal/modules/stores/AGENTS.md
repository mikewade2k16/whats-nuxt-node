# AGENTS.md - stores

## Identidade do módulo

- papel: catálogo e administração básica de lojas acessíveis no tenant
- status: ativo no runtime atual e agora também expõe provider de escopo consumível por slices portáveis

## Responsabilidades

- listar lojas acessíveis por contexto de acesso
- criar, atualizar, arquivar, restaurar e remover lojas conforme regra administrativa
- devolver DTOs leves para seleção de contexto e escopo operacional
- publicar sinais de contexto quando houver mutação administrativa
- adaptar o catálogo de lojas para contratos portáveis do módulo quando necessário

## Contratos que consome

- obrigatórios:
  - `Repository`
  - `ContextPublisher` para mutações com invalidação
- opcionais:
  - `moduleapi/contracts.AccessContext` quando usado via `ScopeProvider`

## Contratos que exporta

- `Service`
- `ScopeProvider`
- `CatalogProvider`
- `StoreView`, `DeleteResult`, `DeleteDependency`
- endpoints HTTP `/v1/stores/*`

## Regras de escopo

- `platform_admin` pode listar e administrar lojas de qualquer tenant
- `owner` pode listar e administrar lojas do próprio tenant
- `marketing` pode listar lojas do próprio tenant, mas não administrar
- `manager` e `consultant` listam apenas as lojas às quais pertencem

## Estado atual da fase

- feito em `2026-04-06`:
  - `stores` passou a exportar `ScopeProvider`, que converte `moduleapi/contracts.AccessContext` para o contrato interno sem deixar essa adaptação no `app`
  - o boot do módulo hospedado deixou de usar `operations_store_scope_adapter.go`; `operations` agora consome o provider direto do módulo `stores`
  - o provider foi validado indiretamente no compose local pelo smoke de `context -> operations-snapshot -> operations/overview`
  - `stores` passou a exportar também `CatalogProvider`, reutilizado por `reports` e `analytics` para validar lojas acessíveis sem depender de `stores.Service` como contrato-base
- próximo corte recomendado:
  - reaproveitar `ScopeProvider` para alinhar `reports` e `analytics` à mesma fronteira de `operations`

## O que o módulo não pode conhecer

- regras operacionais da fila
- decisões de layout ou navegação do painel
- detalhes do shell além do contrato de acesso serializável quando usado como provider

## Checks mínimos de mudança

- `go test ./...`
- smoke de `GET /v1/stores`
- smoke indireto por `GET /v1/operations/overview` quando o provider for alterado