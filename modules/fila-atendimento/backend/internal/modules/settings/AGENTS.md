# AGENTS.md - settings

## Identidade do módulo

- papel: pacote configurável da operação por loja
- status: ativo no runtime atual e em transição para contratos portáveis do shell

## Responsabilidades

- bundle de settings consumido pela UI
- configuração do modal operacional
- catálogos de motivos, origens, perdas, profissões, produtos e campanhas
- seleção de template operacional

## Contratos que consome

- obrigatórios:
  - `AccessContext`
  - `Repository`
- opcionais:
  - `AccessContextResolver` na borda HTTP
  - `RouteGuard` do host

## Contratos que exporta

- `Bundle`
- `MutationAck`
- endpoints `/v1/settings/*`
- `RegisterRoutesWithOptions(...)`
- `RegisterRoutes(...)` como compatibilidade com `auth.Middleware`

## Estado atual da fase

- feito em `2026-04-06`:
  - o service deixou de depender estruturalmente de `auth.Principal`
  - a borda HTTP passou a aceitar `AccessContextResolver + RouteGuard`
  - o runtime hospedado já monta `settings` pela borda genérica
  - smoke hospedado validado com sessão real do módulo em `GET /v1/settings?storeId=...`
  - campanhas passaram a integrar o bundle hospedado com CRUD por loja em `settings/campaigns`
- próximo corte recomendado:
  - smoke hospedado de leitura de bundle e de ao menos uma mutação segura
  - depois alinhar a futura tela real de configurações ao host principal

## O que o módulo não pode conhecer

- `auth.Principal` como contrato-base
- estado de tela do frontend
- regras operacionais de fila e atendimento

## Checks mínimos de mudança

- `go test ./...`
- smoke de `GET /v1/settings?storeId=...`