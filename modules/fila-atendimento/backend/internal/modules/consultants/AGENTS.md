# AGENTS.md - consultants

## Identidade do módulo

- papel: roster administrativo de consultores por loja
- status: alinhado à fronteira exportada no service e na borda HTTP do runtime hospedado atual

## Responsabilidades

- listar consultores ativos da loja
- criar consultor com vínculo de identidade provisionado
- atualizar consultor e manter sincronismo mínimo com a identidade vinculada
- arquivar consultor e encerrar o acesso vinculado

## Contratos consumidos

- `AccessContext`
- `StoreCatalogProvider`
- `IdentityProvisioner`

Compatibilidade atual do runtime hospedado:

- `NewAuthAccessContextResolver()` converte `auth.Principal` para `AccessContext`
- `AuthIdentityProvisioner` traduz a identidade local atual do módulo para o contrato exportado

## Interfaces expostas

- `GET /v1/consultants?storeId=...`
- `POST /v1/consultants`
- `PATCH /v1/consultants/{id}`
- `POST /v1/consultants/{id}/archive`

## Regras de arquitetura

- a regra de acesso do roster não deve depender estruturalmente de `auth.Principal`
- o roster continua dono do ciclo de vida do consultor; a conta vinculada entra via `IdentityProvisioner`
- o frontend continua recebendo `access.email` e `access.initialPassword` no create enquanto o rollout depender desse fluxo administrativo

## Estado atual da fase

- feito em `2026-04-06`:
  - o service passou a consumir `AccessContext`, `StoreCatalogProvider` e `IdentityProvisioner`
  - a borda HTTP ganhou `RegisterRoutesWithOptions(...)` e compatibilidade local com `auth.Middleware`
  - o runtime hospedado preserva o fluxo atual com `AuthIdentityProvisioner`
  - testes de service cobrem provisionamento e rollback quando a identidade falha

## Checks mínimos de mudança

- `go test ./internal/modules/consultants`
- validar o create/update/archive no runtime hospedado quando houver mudança no provisionamento de identidade