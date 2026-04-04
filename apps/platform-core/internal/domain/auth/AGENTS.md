# AGENTS.md - domain/auth

Modulo de autenticacao do `platform-core`.

## Responsabilidades

- login
- logout
- validacao de sessao
- parse/emit de JWT
- `me` do usuario autenticado

## Nao deve fazer

- regra de UI
- regra de modulos de negocio
- agregacao de payload para telas

## Entradas e saidas

- `LoginInput` e `LoginOutput` sao contratos externos do modulo
- `Claims` e contrato interno de auth entre middleware e handlers
- `UserSummary` deve carregar so o necessario para sessao/perfil imediato

## Regras

- token emitido precisa corresponder a uma sessao persistida
- logout revoga sessao no banco
- senha sempre validada no backend
- erros de auth devem ser previsiveis: `unauthorized` para credencial/sessao invalida, `500` so para falha real

## Evolucao

- qualquer campo novo retornado em login/me precisa ser validado quanto a tamanho e necessidade real
- se uma tela precisar de mais dados, preferir endpoint complementar a inflar `login`
