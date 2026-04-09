# Rollout Plan (Low Infra -> Scale)

## Phase 0 (now)

- Keep `apps/atendimento-online-api` and `apps/plataforma-api` separated by domain.
- Share same PostgreSQL server, but isolate core in schema `platform_core`.
- Keep websocket state in process memory.
- Keep deployment simple: 1 instance of `plataforma-api`.

## Phase 1 (first growth)

- Add `plataforma-api` service to compose/infra as dedicated container.
- Keep same Postgres cluster, optional dedicated core database.
- Add read replicas only if needed for analytics/audit reads.

## Phase 2 (traffic and realtime growth)

- Add Redis for websocket fanout + distributed presence.
- Scale `plataforma-api` horizontally (2+ replicas).
- Keep stateless API and session validation in DB/Redis.

## Phase 3 (higher isolation)

- Split core to dedicated PostgreSQL instance.
- Add outbox/event relay for integration with other modules.
- Enforce cross-service contracts (HTTP/gRPC/events) for omnichannel and future modules.

## Contracts between modules

Core should be the source of truth for:

- tenant validity and status
- user identity and session
- module activation for tenant
- resolved limits
- role/permission checks

Domain modules (omnichannel, kanban, finance) should not own these rules.

## Operational notes

- Keep migration history immutable (`migrations/*.sql`).
- Prefer additive schema changes.
- Emit audit logs for all security-sensitive operations.
- Add integration tests for limit enforcement before expanding API surface.
