# AGENTS.md - plataforma-api

Guia do servico Go responsavel por auth, tenants, admin e modulos de negocio.

## Stack

- Go
- chi
- pgx / pgxpool
- PostgreSQL schema `platform_core`

## Estrutura desejada

```text
cmd/server/main.go
internal/domain/auth/
internal/domain/core/
internal/domain/finance/
internal/httpapi/handlers/
internal/httpapi/middleware/
internal/database/
migrations/
```

## Regras do servico

- Cada modulo de dominio tem package proprio e `Service` proprio.
- `domain/core` concentra apenas o que ainda e realmente compartilhado de tenant/admin/RBAC.
- Modulo novo nao deve ser adicionado em `domain/core` por inercia.
- Todo modulo em `internal/domain/*` deve manter `AGENTS.md` proprio seguindo `docs/padrao-agents-modulo.md`.
- Handler por modulo, com struct propria.
- Router apenas faz wiring de handlers e middlewares.
- `main.go` instancia services e injeta dependencias.

## Padrao de service

- Dependencias minimas: preferencialmente `*pgxpool.Pool` e configuracao explicita.
- Metodos recebem `context.Context`.
- Inputs e outputs definidos em `types.go`.
- Erros do modulo definidos em `errors.go`.

## Padrao de handler

1. extrair claims
2. validar input/query/path
3. chamar service
4. mapear erro de dominio para HTTP
5. escrever JSON

Nao colocar regra de negocio, SQL ou normalizacao pesada no handler.

## Payload e queries

- Lista leve, detalhe pesado.
- Summary e preview por SQL quando possivel.
- Paginar por padrao.
- Evitar carregar JSON aninhado em lote se a tela so usa resumo.

## Migrations

- Numeradas e imutaveis.
- `CREATE ... IF NOT EXISTS` quando fizer sentido.
- Toda mudanca de schema acompanha migration.
- Correcao de dado legado vai em migration propria, nunca reescrevendo a antiga.

## Antes de merge/deploy

- rodar `go test ./...`
- revisar impacto em router e handlers
- revisar DTOs expostos no JSON
- revisar se a mudanca aumentou payload de lista sem necessidade
