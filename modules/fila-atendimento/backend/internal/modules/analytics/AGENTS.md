# AGENTS.md - analytics

## Identidade do módulo

- papel: leituras gerenciais prontas para `ranking`, `dados` e `inteligência`
- status: ativo no runtime atual e em transição para contratos portáveis do shell

## Responsabilidades

- ranking mensal e diário por consultor
- agregados de produtos, motivos, origens e horários
- diagnóstico operacional e ações recomendadas
- leitura analítica sempre respeitando escopo autenticado de loja

## Contratos que consome

- obrigatórios:
  - `AccessContext`
  - `StoreCatalogProvider`
  - `Repository`
- opcionais:
  - `AccessContextResolver` na borda HTTP
  - `RouteGuard` do host

## Contratos que exporta

- `RankingResponse`
- `DataResponse`
- `IntelligenceResponse`
- `RegisterRoutesWithOptions(...)`
- `RegisterRoutes(...)` como compatibilidade com `auth.Middleware`

## Estado atual da fase

- feito em `2026-04-06`:
  - o service deixou de depender estruturalmente de `auth.Principal` e `stores.Service`
  - a borda HTTP passou a aceitar `AccessContextResolver + RouteGuard`
  - o runtime hospedado já injeta `stores.CatalogProvider` via `app.go`
  - `LoadSettings(...)` passou a tratar ausência de linha em `store_operation_settings` como defaults válidos, evitando 500 em lojas sem configuração persistida
  - smoke hospedado validado com sessão real do módulo em `ranking` e `intelligence`
- próximo corte recomendado:
  - adicionar smoke hospedado de `data`
  - depois alinhar payloads do frontend real às leituras hospedadas

## O que o módulo não pode conhecer

- `auth.Principal` como contrato-base
- detalhes internos do host de lojas
- estado de tela do frontend

## Checks mínimos de mudança

- `go test ./...`
- smoke de `GET /v1/analytics/ranking`
- smoke de `GET /v1/analytics/intelligence`