# AGENTS.md - domain/auth

## Identidade do módulo

- papel: autenticação e sessão do `plataforma-api`
- status: ativo

## Responsabilidades

- login
- logout
- validação de sessão
- emissão e parse de JWT
- configuração global de duração da sessão
- listagem de sessões ativas administrativas globais ou por escopo de tenant
- revogação imediata de sessão individual ou de todas as sessões de um usuário, respeitando o escopo do ator autenticado
- resolução do usuário autenticado para HTTP e WebSocket
- payload mínimo de `me`
- ownership exclusiva do ciclo de autenticação do painel e do shell

## Regra de ownership

- qualquer login do painel administrativo deve passar por `domain/auth`
- qualquer revogação, expiração ou inventário de sessão deve passar por `domain/auth`
- nenhum módulo de negócio, BFF ou serviço legado pode emitir autenticação paralela para o painel
- `domain/auth` publica identidade/sessão; `domain/core` decide tenant, RBAC, módulos e limites a partir dessa identidade

## Contratos que consome

- `ActorCredentialInput`: credenciais e contexto de origem do login, hoje materializados em `LoginInput`
- `TenantContext`: tenant solicitado ou associado à sessão
- `SessionStore`: persistência e revogação de sessão em `user_sessions`
- `PasswordVerifier`: validação de senha no backend
- `Clock`: cálculo de expiração e atividade de sessão

## Contratos que exporta

- `Claims`
- `LoginInput`
- `LoginOutput`
- `MeOutput`
- `UserSummary`
- validação de sessão usada por middleware e handshake de `/core/ws`

## Persistência sob responsabilidade do módulo

- schema: `platform_core`
- tabelas principais: `users`, `tenant_users`, `user_sessions`
- migrations-base: `0001_core_schema.sql`
- seeds/backfills relevantes: `0002_seed.sql`, `0004_seed_legacy_alias_users.sql`, `0007_backfill_client_defaults_and_admin_bootstrap.sql`, `0009_root_admin_tenant_bootstrap.sql`, `0016_seed_acme_core_tenant.sql`

## Endpoints, filas e interfaces expostas

- `POST /core/auth/login`
- `POST /core/auth/logout`
- `GET /core/auth/me`
- `GET|PUT /core/admin/auth-config`
- `GET /core/admin/auth-sessions`
- `POST /core/admin/auth-sessions/revoke-user`
- `DELETE /core/admin/auth-sessions/{sessionId}`
- `GET /core/ws` com autenticação de sessão

## Semantica minima de erro no login

- `POST /core/auth/login` nao deve mascarar usuario `inactive`, `blocked` ou `pending_invite` como credenciais invalidas.
- quando o usuario existir mas estiver inativo, a resposta deve orientar contato com administrador para liberacao do acesso.
- quando o usuario nao tiver tenant/cliente ativo para entrar no shell, a resposta deve explicar que falta vinculacao valida em vez de culpar email/senha.

## Eventos e sinais de integração

- publicados: nenhum evento de domínio formal no momento
- consumidos: nenhum evento de domínio formal no momento
- sinais indiretos: handshake autenticado de WebSocket e revogação de sessão persistida

## O que o módulo não pode conhecer

- regras de UI
- regra específica de `finance`
- regra específica de `atendimento`
- agregação de payload para telas administrativas
- tabela operacional do schema `public`

## Checks mínimos de mudança

- `go test ./...`
- validar `POST /core/auth/login`
- validar `POST /core/auth/logout`
- validar `GET /core/auth/me`
