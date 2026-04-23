# Back

Status atual: este diretório é a implementação oficial do backend hospedado do módulo `fila-atendimento`.

## Situação arquitetural atual

- o runtime hospedado sobe dentro de `apps/plataforma-api`
- autenticação e autorização do usuário vêm do shell por `POST /v1/auth/shell/exchange`
- tenant, usuário, nível e loja global são resolvidos em `platform_core`
- o schema local `fila_atendimento` ficou restrito ao domínio operacional
- o backend hospedado não expõe mais login local, convite, troca de senha nem CRUD administrativo de usuários

## Ownership atual do schema local

Tabelas de domínio vivas em `fila_atendimento`:

- `consultants`
- `store_profiles`
- `store_operation_settings`
- `store_setting_options`
- `store_catalog_products`
- `store_campaigns`
- `operation_queue_entries`
- `operation_active_services`
- `operation_paused_consultants`
- `operation_current_status`
- `operation_status_sessions`
- `operation_service_history`

Estruturas removidas do schema local pela convergência com o core:

- `users`
- `tenants`
- `stores`
- `user_platform_roles`
- `user_tenant_roles`
- `user_store_roles`
- `user_external_identities`
- `user_invitations`

## Loja global

A loja canônica da plataforma agora vive em:

- `platform_core.tenant_stores`

O módulo mantém apenas o complemento operacional em:

- `fila_atendimento.store_profiles`

## Endpoints hospedados

- `GET /healthz`
- `GET /v1/auth/roles`
- `POST /v1/auth/shell/exchange`
- `GET /v1/auth/me`
- `GET /v1/me/context`
- `GET /v1/tenants`
- `GET /v1/stores`
- `POST /v1/stores`
- `PATCH /v1/stores/{id}`
- `GET /v1/consultants`
- `POST /v1/consultants`
- `PATCH /v1/consultants/{id}`
- `POST /v1/consultants/{id}/archive`
- `GET /v1/settings`
- `PUT /v1/settings`
- `PATCH /v1/settings/operation`
- `PATCH /v1/settings/modal`
- `POST /v1/settings/options/{group}`
- `PATCH /v1/settings/options/{group}/{itemId}`
- `DELETE /v1/settings/options/{group}/{itemId}`
- `PUT /v1/settings/options/{group}`
- `POST /v1/settings/products`
- `PATCH /v1/settings/products/{id}`
- `DELETE /v1/settings/products/{id}`
- `PUT /v1/settings/products`
- `GET /v1/operations/snapshot`
- `POST /v1/operations/queue`
- `POST /v1/operations/pause`
- `POST /v1/operations/resume`
- `POST /v1/operations/start`
- `POST /v1/operations/finish`
- `GET /v1/realtime/operations`
- `GET /v1/reports/overview`
- `GET /v1/reports/results`
- `GET /v1/reports/recent-services`
- `GET /v1/analytics/ranking`
- `GET /v1/analytics/data`
- `GET /v1/analytics/intelligence`
- `GET /v1/dev/ping`

## Sessão integrada pelo shell

Fluxo:

1. `apps/painel-web` autentica no shell principal.
2. o host emite um token efêmero de bridge.
3. o backend do módulo valida esse token em `POST /v1/auth/shell/exchange`.
4. o módulo resolve o usuário no core, respeitando `businessRole`, `accessLevel`, `tenant_id` e `store_id`.
5. o módulo devolve sua própria sessão para o frontend.

Regras:

- o bridge é o único caminho de entrada do runtime hospedado
- o módulo continua com API e token próprios
- o módulo não cria senha, convite nem vínculo de identidade local
- o roster de consultores continua local, mas o vínculo com conta real usa `consultants.user_id -> platform_core.users(id)`

## Política atual para consultores

- cadastro e senha pertencem ao shell administrativo
- o módulo mantém apenas o roster operacional em `consultants`
- a listagem da fila sincroniza consultores elegíveis a partir de `platform_core.tenant_users`
- a visibilidade por loja segue `platform_core.tenant_users.store_id`

## Variáveis de ambiente ainda relevantes

- `APP_NAME`
- `APP_ENV`
- `APP_ADDR`
- `DATABASE_URL`
- `DATABASE_MIN_CONNS`
- `DATABASE_MAX_CONNS`
- `WEB_APP_URL`
- `CORS_ALLOWED_ORIGINS`
- `AUTH_TOKEN_SECRET`
- `AUTH_TOKEN_TTL`
- `AUTH_SHELL_BRIDGE_SECRET`
- `AUTH_BCRYPT_COST`

## Checks mínimos

- `go test ./...`
- `docker compose -f docker-compose.yml config`
