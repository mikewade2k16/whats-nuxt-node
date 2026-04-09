# Plataforma API (Go + PostgreSQL)

Base service for multi-tenant identity, auth, module activation, limits, user-module allocation, sessions, audit logs and basic websocket presence.

## Why this shape

This service is designed to start with low infrastructure cost and still keep clear domain separation:

- Separate codebase and runtime from `apps/atendimento-online-api` (atendimento online domain).
- Same PostgreSQL instance in the beginning, but isolated in dedicated schema `platform_core`.
- No Redis dependency for MVP websocket presence/admin events (in-memory hub).
- Ready to split into dedicated DB and Redis when traffic grows.

## Current MVP scope

Implemented now:

- SQL migrations for full core schema (`migrations/0001_core_schema.sql`).
- Initial seed for modules/plans/permissions/demo tenant (`migrations/0002_seed.sql`).
- JWT login with session persistence in `user_sessions`.
- Session validation middleware for protected endpoints.
- RBAC enforcement by permission code (`permissions` + `roles` + `role_permissions` + `tenant_user_roles`).
- Limit resolution endpoint (tenant override -> plan -> default).
- Tenant CRUD baseline (list/create/get/update).
- Tenant users baseline (list/invite).
- Tenant modules baseline (list/activate/deactivate).
- Roles and permissions CRUD baseline (permissions read + roles list/create/update).
- Tenant user role binding CRUD (list/assign/revoke).
- Tenant limit override endpoint (`PUT`).
- User allocation to module with limit enforcement + idempotency.
- Audit logging for assignment action.
- WebSocket endpoint for presence events and tenant broadcasts.

Not implemented yet (next phases):

- Refresh token rotation.
- Permission catalog write management via API (currently seeded/read-only).
- Tenant user lifecycle endpoints (suspend/reactivate/set-owner).
- Redis-backed websocket presence/broadcast.

## Folder layout

```txt
apps/plataforma-api
|- cmd/
|  |- migrate/    # migration runner
|  `- server/     # HTTP + WebSocket server
|- internal/
|  |- config/
|  |- database/
|  |- domain/
|  |  |- auth/
|  |  `- core/
|  |- httpapi/
|  |  |- handlers/
|  |  `- middleware/
|  `- realtime/
|- migrations/
|  |- 0001_core_schema.sql
|  |- 0002_seed.sql
|  |- 0003_rbac_seed.sql
|  |- 0004_seed_legacy_alias_users.sql
|  |- 0005_admin_manage_and_pricing.sql
|  |- 0006_seed_admin_panel_platform_access.sql
|  `- 0007_backfill_client_defaults_and_admin_bootstrap.sql
`- docs/
   `- rollout.md
```

## Environment variables

Plataforma API uses:

- `CORE_DATABASE_URL` (fallback: `DATABASE_URL`)
- `CORE_DB_SCHEMA` (default: `platform_core`)
- `CORE_HTTP_ADDR` (default: `:4100`)
- `CORE_JWT_SECRET`
- `CORE_JWT_ISSUER` (default: `plataforma-api`)
- `CORE_JWT_TTL_MINUTES` (default: `720`)
- `CORE_DEFAULT_USERS_LIMIT` (default: `10`)
- `CORE_ALLOWED_ORIGINS` (default: `http://localhost:3000`)
- `CORE_AUTO_MIGRATE` (default: `false`)

## Run locally

From `apps/plataforma-api`:

```bash
go run ./cmd/migrate
```

```bash
go run ./cmd/server
```

Health:

- `GET http://localhost:4100/health`
- `GET http://localhost:4100/core/health`

## Seed credentials

After migration + seed (`0002` -> `0016`):

- Platform root: `root@core.local` / `123456`
- Demo owner: `admin@demo-core.local` / `123456`
- Demo agent: `agent@demo-core.local` / `123456`
- Legacy-compatible aliases for painel login:
  - `admin@demo.local` / `123456`
  - `supervisor@demo.local` / `123456`
  - `agente@demo.local` / `123456`
  - `viewer@demo.local` / `123456`
- ACME tenant aliases for isolamento/homologacao:
  - `admin@acme.local` / `123456`
  - `supervisor@acme.local` / `123456`
  - `agente@acme.local` / `123456`
  - `viewer@acme.local` / `123456`

## API endpoints (implemented)

Public:

- `POST /core/auth/login`
- `GET /core/ws` (token query param or Bearer token)

Protected (Bearer JWT):

- `POST /core/auth/logout`
- `GET /core/auth/me`
- `GET /core/permissions`
- `GET /core/tenants`
- `POST /core/tenants` (platform admin)
- `GET /core/tenants/{tenantId}`
- `PATCH /core/tenants/{tenantId}`
- `GET /core/tenants/{tenantId}/users`
- `POST /core/tenants/{tenantId}/users/invite`
- `GET /core/tenants/{tenantId}/users/{tenantUserId}/roles`
- `POST /core/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}/assign`
- `DELETE /core/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}`
- `GET /core/tenants/{tenantId}/modules`
- `POST /core/tenants/{tenantId}/modules/{moduleCode}/activate`
- `POST /core/tenants/{tenantId}/modules/{moduleCode}/deactivate`
- `GET /core/tenants/{tenantId}/roles`
- `POST /core/tenants/{tenantId}/roles`
- `PATCH /core/tenants/{tenantId}/roles/{roleId}`
- `GET /core/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}`
- `PUT /core/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}`
- `POST /core/tenants/{tenantId}/modules/{moduleCode}/users/{tenantUserId}/assign`

## Permissions map

- `tenants.read`: read tenant details.
- `tenants.update`: update tenant details.
- `tenant.users.read`: list tenant users.
- `tenant.users.invite`: invite/create tenant users.
- `tenant.users.modules.assign`: assign user to module.
- `tenant.modules.read`: list tenant modules.
- `tenant.modules.update`: activate/deactivate modules.
- `tenant.limits.read`: read resolved limits.
- `tenant.limits.update`: update tenant overrides.
- `roles.read`: list permissions, roles and tenant-user role bindings.
- `roles.update`: create/update roles and assign/revoke tenant-user roles.

Rules:

- `is_platform_admin = true` bypasses permission checks.
- Tenant owner (`tenant_users.is_owner = true`) bypasses permission checks for that tenant.
- Other users must have permission through role bindings.

## WebSocket presence events

Client -> server:

- `presence.join`
- `presence.heartbeat`
- `presence.leave`

Server -> clients:

- `presence.joined`
- `presence.user_joined`
- `presence.heartbeat_ack`
- `presence.user_left`
- `tenant.user.module.assigned` (broadcast from assignment endpoint)
- `tenant.role.created`
- `tenant.role.updated`
- `tenant.user.role.assigned`
- `tenant.user.role.revoked`

## Quick test flow

1. Login and get token:

```bash
curl -X POST http://localhost:4100/core/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo-core.local","password":"123456"}'
```

2. Resolve users limit for module:

```bash
curl http://localhost:4100/core/tenants/<TENANT_ID>/modules/fila-atendimento/limits/users \
  -H "Authorization: Bearer <TOKEN>"
```

3. Assign tenant user to module:

```bash
curl -X POST http://localhost:4100/core/tenants/<TENANT_ID>/modules/fila-atendimento/users/<TENANT_USER_ID>/assign \
  -H "Authorization: Bearer <TOKEN>"
```

## Test status

Executed:

```bash
go test ./...
```

Result: all packages compiled and tests passed.

