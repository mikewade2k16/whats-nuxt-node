# AGENTS.md - reports

## Identidade do módulo

- papel: leituras gerenciais e relatórios derivados do histórico operacional
- status: ativo no runtime atual e em transição para contratos portáveis do shell

## Responsabilidades

- entregar agregados de overview para relatórios
- entregar resultados paginados e leitura de atendimentos recentes
- entregar visão consolidada multiloja
- respeitar escopo de acesso antes de qualquer agregação

## Contratos que consome

- obrigatórios:
  - `AccessContext`
  - `StoreCatalogProvider`
  - `Repository`
- opcionais:
  - `AccessContextResolver` na borda HTTP
  - `RouteGuard` do host

## Contratos que exporta

- `OverviewResponse`
- `ResultsResponse`
- `RecentServicesResponse`
- `MultiStoreOverviewResponse`
- `RegisterRoutesWithOptions(...)`
- `RegisterRoutes(...)` como compatibilidade com `auth.Middleware`

## Estado atual da fase

- feito em `2026-04-06`:
  - o service deixou de depender estruturalmente de `auth.Principal` e `stores.Service`
  - a borda HTTP passou a aceitar `AccessContextResolver + RouteGuard`
  - o runtime hospedado já injeta `stores.CatalogProvider` via `app.go`
  - smoke hospedado validado com sessão real do módulo em `multistore-overview` e `overview`
- próximo corte recomendado:
  - adicionar smoke hospedado de `results` e `recent-services`
  - depois alinhar exports e filtros do front real de relatórios ao host

## O que o módulo não pode conhecer

- `auth.Principal` como contrato-base
- detalhes internos de `stores.Service`
- estado de tela do frontend

## Checks mínimos de mudança

- `go test ./...`
- smoke de `GET /v1/reports/overview`
- smoke de `GET /v1/reports/multistore-overview`