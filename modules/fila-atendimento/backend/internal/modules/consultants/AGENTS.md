# AGENTS.md - consultants

## Identidade do módulo

- papel: roster operacional de consultores por loja
- status: alinhado ao runtime hospedado que consome identidade global do shell

## Responsabilidades

- listar consultores ativos da loja
- criar, atualizar e arquivar consultores no roster operacional
- refletir vínculo com conta global por `consultants.user_id`
- nunca provisionar senha, convite ou conta local do usuário

## Contratos consumidos

- `AccessContext`
- `StoreCatalogProvider`

Compatibilidade atual do runtime hospedado:

- `NewAuthAccessContextResolver()` converte `auth.Principal` para `AccessContext`
- a conta real do consultor é lida no core; o módulo só exibe o vínculo já existente

## Interfaces expostas

- `GET /v1/consultants?storeId=...`
- `POST /v1/consultants`
- `PATCH /v1/consultants/{id}`
- `POST /v1/consultants/{id}/archive`

## Regras de arquitetura

- a regra de acesso do roster não deve depender estruturalmente de `auth.Principal`
- o roster continua dono apenas do ciclo de vida operacional do consultor
- identidade global, senha e loja vinculada ficam sob controle do shell administrativo

## Checks mínimos de mudança

- `go test ./internal/modules/consultants`
- validar create, update e archive no runtime hospedado quando houver mudança no vínculo `consultants.user_id`
