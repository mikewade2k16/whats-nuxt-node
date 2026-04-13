# AGENTS.md - consultants

## Identidade do módulo

- papel: roster administrativo de consultores por loja
- status: alinhado à fronteira exportada no service e na borda HTTP do runtime hospedado atual

## Responsabilidades

- listar consultores ativos da loja
- criar consultor apenas no roster operacional da loja
- atualizar consultor sem mutar a identidade global do shell
- arquivar consultor sem gerenciar o acesso global

## Contratos consumidos

- `AccessContext`
- `StoreCatalogProvider`
- `IdentityProvisioner` opcional apenas enquanto houver legado local a ser mantido

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
- o roster continua dono apenas do ciclo de vida operacional do consultor
- identidade global, senha e vínculo de acesso ficam sob controle do shell administrativo

## Estado atual da fase

- feito em `2026-04-06`:
  - o service passou a consumir `AccessContext`, `StoreCatalogProvider` e `IdentityProvisioner`
  - a borda HTTP ganhou `RegisterRoutesWithOptions(...)` e compatibilidade local com `auth.Middleware`
  - o runtime hospedado preserva compatibilidade de leitura com identidades legadas já vinculadas
  - testes de service cobrem o roster desacoplado do provisionamento de identidade

## Checks mínimos de mudança

- `go test ./internal/modules/consultants`
- validar o create/update/archive no runtime hospedado quando houver mudança no provisionamento de identidade
