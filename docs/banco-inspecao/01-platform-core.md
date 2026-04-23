# Catálogo Completo do Schema `platform_core`

## Escopo

Este catálogo cobre o estado final das tabelas do shell canônico após considerar:

1. criação base em `0001_core_schema.sql`;
2. adições de compatibilidade e cobrança em `0005_admin_manage_and_pricing.sql`;
3. extração do módulo financeiro para schema próprio em `0030_extract_finance_schema.sql`;
4. sessão e reset em `0018_auth_session_settings.sql` e `0019_auth_password_reset.sql`;
5. ajustes de diretório e papéis em `0026_admin_user_store_directory.sql`, `0027_add_consultant_access_level.sql`, `0028_normalize_tenant_user_access_levels.sql` e `0029_global_tenant_stores.sql`.

## Diagnóstico rápido do schema

### O que ele faz bem

1. centraliza tenant, identidade, sessão, RBAC e grants por módulo;
2. já separa plano comercial, ativação de módulo, loja global e liberação por usuário;
3. tem base suficiente para ser o owner real de autorização da plataforma.

### O que está frágil

1. ainda preserva `tenant_store_charges` como overlay financeiro de compatibilidade, embora o diretório canônico já esteja travado em `tenant_stores`;
2. a fronteira com o schema `finance` ainda depende do tenant canônico do shell e de compatibilidade por `legacy_id` nas planilhas antigas;
3. `legacy_id` em `tenants` e `users` mostra ponte de compatibilidade ainda ativa.

## Tabelas de identidade, tenant e acesso

### `tenants`

- Classificação: `Atual`
- Papel: cliente da plataforma e raiz de quase todo o isolamento multi-tenant do shell.
- Campos: `id` uuid PK; `slug` varchar(80) unique; `name` varchar(255); `legal_name` varchar(255) nullable; `document` varchar(30) nullable; `status` enum `trialing|active|suspended|cancelled`; `timezone` varchar(60); `locale` varchar(10); `contact_email` varchar(255) nullable; `contact_phone` varchar(30) nullable; `billing_mode` varchar(30) nullable; `billing_day` smallint nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz; `deleted_at` timestamptz nullable; `legacy_id` integer unique; `logo_url` varchar(500) nullable; `contact_site` varchar(255) nullable; `contact_address` varchar(255) nullable; `webhook_enabled` boolean; `webhook_key` varchar(160) nullable; `monthly_payment_amount` numeric(12,2); `user_count` integer; `user_nicks` text[]; `project_count` integer; `project_segments` text[]; `require_user_store_link` boolean; `require_user_registration` boolean.
- Relações: 1:N com `tenant_users`, `tenant_subscriptions`, `tenant_modules`, `tenant_module_limits`, `tenant_store_charges`, `tenant_stores`, `presence_connections`, `audit_logs`.
- Exemplo: `{"slug":"acme-core","name":"ACME","status":"active","contact_email":"admin@acme.local","legacy_id":4,"require_user_store_link":true}`.
- Observações: `legacy_id` é ponte de compatibilidade; `tenant_stores` virou a loja global do shell e `tenant_store_charges` agora depende obrigatoriamente dela por `store_id`, mantendo apenas colunas-espelho de compatibilidade.

### `users`

- Classificação: `Atual`
- Papel: identidade global da plataforma.
- Campos: `id` uuid PK; `name` varchar(255); `display_name` varchar(255) nullable; `email` citext unique; `password_hash` varchar(255); `phone` varchar(30) nullable; `avatar_url` varchar(500) nullable; `status` enum `active|inactive|blocked|pending_invite`; `is_platform_admin` boolean; `email_verified_at` timestamptz nullable; `last_login_at` timestamptz nullable; `two_factor_enabled` boolean; `preferences` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz; `deleted_at` timestamptz nullable; `legacy_id` integer unique; `nick` varchar(80) nullable.
- Relações: 1:N com `tenant_users`, `tenant_module_limits.created_by_user_id`, `tenant_module_pricing.created_by_user_id`, `tenant_user_modules.granted_by_user_id`, `tenant_user_roles.assigned_by_user_id`, `user_sessions`, `auth_password_resets`, `audit_logs`, `presence_connections`.
- Exemplo: `{"email":"root@core.local","name":"Platform Root","status":"active","is_platform_admin":true}`.
- Observações: é a identidade canônica; qualquer usuário local em outros módulos deve convergir para referências desta tabela.

### `tenant_users`

- Classificação: `Atual`, com herança de compatibilidade
- Papel: vínculo do usuário global com um cliente específico.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `user_id` uuid FK; `status` enum `invited|active|suspended`; `is_owner` boolean; `job_title` varchar(120) nullable; `invited_by_user_id` uuid FK nullable; `joined_at` timestamptz nullable; `last_seen_at` timestamptz nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz; `access_level` varchar(20) com conjunto final `admin|manager|marketing|finance|viewer|consultant`; `user_type` varchar(20) com conjunto `admin|client`; `business_role` varchar(30) com conjunto `consultant|store_manager|marketing|finance|general_manager|owner|viewer|system_admin`; `store_id` uuid FK nullable para `tenant_stores(id)`; `registration_number` varchar(60) nullable.
- Relações: N:1 com `tenants` e `users`; 1:N com `tenant_user_modules` e `tenant_user_roles`.
- Exemplo: `{"tenant":"acme-core","user":"admin@acme.local","status":"active","is_owner":true,"access_level":"admin","business_role":"owner"}`.
- Observações: esta é uma das tabelas mais sensíveis do shell; ela carrega o mapeamento entre legado e vocabulário novo de papel/acesso.

### `roles`

- Classificação: `Atual`
- Papel: papéis RBAC globais ou específicos de tenant/módulo.
- Campos: `id` uuid PK; `tenant_id` uuid FK nullable; `module_id` uuid FK nullable; `code` varchar(100); `name` varchar(120); `description` text nullable; `is_system` boolean; `is_active` boolean; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: 1:N com `role_permissions` e `tenant_user_roles`.
- Exemplo: `{"code":"tenant_admin","name":"Tenant Admin","is_system":true,"tenant_id":null,"module_id":null}`.
- Observações: `tenant_id` e `module_id` nulos representam templates globais de papel.

### `permissions`

- Classificação: `Atual`
- Papel: permissão atômica usada pelo RBAC.
- Campos: `id` uuid PK; `code` varchar(150) unique; `name` varchar(150); `description` text nullable; `module_id` uuid FK nullable; `is_active` boolean; `metadata` jsonb; `created_at` timestamptz.
- Relações: N:N com `roles` via `role_permissions`.
- Exemplo: `{"code":"tenant.users.invite","name":"Invite tenant users","module_id":"core_panel"}`.
- Observações: suporta permissão global ou vinculada a módulo.

### `role_permissions`

- Classificação: `Atual`
- Papel: composição N:N entre papel e permissão.
- Campos: `id` uuid PK; `role_id` uuid FK; `permission_id` uuid FK; `created_at` timestamptz.
- Relações: N:1 com `roles`; N:1 com `permissions`.
- Exemplo: `{"role":"tenant_admin","permission":"tenant.users.update"}`.

### `tenant_user_roles`

- Classificação: `Atual`
- Papel: papel RBAC efetivamente atribuído ao usuário dentro do tenant.
- Campos: `id` uuid PK; `tenant_user_id` uuid FK; `role_id` uuid FK; `assigned_by_user_id` uuid FK nullable; `assigned_at` timestamptz; `metadata` jsonb.
- Relações: N:1 com `tenant_users`, `roles` e opcionalmente `users`.
- Exemplo: `{"tenant_user":"admin@acme.local@acme-core","role":"tenant_admin","metadata":{"bootstrap":"migration_0016"}}`.

### `tenant_user_modules`

- Classificação: `Atual`
- Papel: grant de módulo por usuário dentro do tenant.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `tenant_user_id` uuid FK; `module_id` uuid FK; `status` enum `active|inactive`; `granted_by_user_id` uuid FK nullable; `granted_at` timestamptz; `revoked_at` timestamptz nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants`, `tenant_users`, `modules` e opcionalmente `users`.
- Exemplo: `{"tenant":"acme-core","user":"agente@acme.local","module":"atendimento","status":"active"}`.

## Tabelas de módulos, planos e cobrança

### `modules`

- Classificação: `Atual`
- Papel: catálogo mestre de módulos da plataforma.
- Campos: `id` uuid PK; `code` varchar(80) unique; `name` varchar(120); `description` text nullable; `is_active` boolean; `is_core` boolean; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz; `base_price_monthly` numeric(12,2); `base_price_yearly` numeric(12,2); `billing_currency` varchar(8).
- Relações: 1:N com `plan_modules`, `plan_module_limits`, `tenant_modules`, `tenant_module_limits`, `tenant_module_pricing`, `roles`, `permissions`, `audit_logs`, `presence_connections`.
- Exemplo: `{"code":"atendimento","name":"Atendimento","base_price_monthly":200.00,"billing_currency":"BRL"}`.

### `plans`

- Classificação: `Atual`
- Papel: catálogo comercial de planos.
- Campos: `id` uuid PK; `code` varchar(80) unique; `name` varchar(120); `status` varchar(20); `is_custom` boolean; `currency` varchar(10); `price_monthly` numeric(12,2) nullable; `price_yearly` numeric(12,2) nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: 1:N com `plan_modules`, `plan_module_limits`, `tenant_subscriptions`.
- Exemplo: `{"code":"pro","name":"Pro","status":"active","price_monthly":199.90,"price_yearly":1990.00}`.

### `plan_modules`

- Classificação: `Atual`
- Papel: quais módulos entram em cada plano.
- Campos: `id` uuid PK; `plan_id` uuid FK; `module_id` uuid FK; `enabled` boolean; `metadata` jsonb; `created_at` timestamptz.
- Relações: N:1 com `plans` e `modules`.
- Exemplo: `{"plan":"pro","module":"kanban","enabled":true}`.

### `plan_module_limits`

- Classificação: `Atual`
- Papel: limites padrão por módulo dentro do plano.
- Campos: `id` uuid PK; `plan_id` uuid FK; `module_id` uuid FK; `limit_key` varchar(80); `limit_value_int` integer nullable; `limit_value_numeric` numeric(12,2) nullable; `limit_value_bool` boolean nullable; `limit_value_json` jsonb nullable; `is_unlimited` boolean; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `plans` e `modules`.
- Exemplo: `{"plan":"starter","module":"atendimento","limit_key":"users","limit_value_int":1}`.

### `tenant_subscriptions`

- Classificação: `Atual`
- Papel: assinatura ativa ou histórica do tenant.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `plan_id` uuid FK; `status` enum `trialing|active|past_due|cancelled`; `billing_cycle` enum `monthly|yearly`; `starts_at` timestamptz; `ends_at` timestamptz nullable; `trial_ends_at` timestamptz nullable; `price_snapshot` numeric(12,2) nullable; `currency` varchar(10); `external_provider` varchar(80) nullable; `external_subscription_id` varchar(255) nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants` e `plans`.
- Exemplo: `{"tenant":"demo-core","plan":"pro","status":"active","billing_cycle":"monthly","price_snapshot":199.90}`.

### `tenant_modules`

- Classificação: `Atual`
- Papel: módulo realmente ativado para o tenant.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `module_id` uuid FK; `status` enum `active|inactive|suspended`; `source` enum `plan|addon|custom`; `activated_at` timestamptz; `deactivated_at` timestamptz nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants` e `modules`.
- Exemplo: `{"tenant":"acme-core","module":"core_panel","status":"active","source":"plan"}`.

### `tenant_module_limits`

- Classificação: `Atual`
- Papel: override de limite por tenant e módulo.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `module_id` uuid FK; `limit_key` varchar(80); `limit_value_int` integer nullable; `limit_value_numeric` numeric(12,2) nullable; `limit_value_bool` boolean nullable; `limit_value_json` jsonb nullable; `is_unlimited` boolean; `source` varchar(50); `notes` text nullable; `created_by_user_id` uuid FK nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants`, `modules` e opcionalmente `users`.
- Exemplo: `{"tenant":"acme-core","module":"atendimento","limit_key":"instances","limit_value_int":1,"source":"migration_0016"}`.

### `tenant_module_pricing`

- Classificação: `Atual`
- Papel: precificação customizada por tenant e módulo.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `module_id` uuid FK; `pricing_mode` varchar(20) com conjunto `fixed|percent_discount|amount_discount`; `fixed_price_monthly` numeric(12,2) nullable; `fixed_price_yearly` numeric(12,2) nullable; `discount_percent` numeric(5,2) nullable; `discount_amount` numeric(12,2) nullable; `notes` varchar(255) nullable; `metadata` jsonb; `created_by_user_id` uuid FK nullable; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants`, `modules` e opcionalmente `users`.
- Exemplo: `{"tenant":"acme-core","module":"atendimento","pricing_mode":"fixed","fixed_price_monthly":149.90}`.
- Observações: tabela útil para gestão comercial, mas ainda pouco conectada à noção real de loja/unidade do ecossistema.

### `tenant_store_charges`

- Classificação: `Legado em transição`
- Papel: overlay financeiro por loja do tenant.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `store_id` uuid FK obrigatória para `tenant_stores(id)`; `store_name` varchar(120) espelho; `amount` numeric(12,2); `sort_order` integer espelho; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants`; N:1 com `tenant_stores` por `store_id` e FK composta `(tenant_id, store_id)`.
- Exemplo: `{"tenant":"acme-core","storeId":"33000000-0000-4000-8000-000000000014","store_name":"Shopping Jardins","amount":0.00}`.
- Observações: `store_name` e `sort_order` viraram colunas-espelho sincronizadas por trigger a partir de `tenant_stores`; a fonte de verdade do diretório já não está mais aqui.

### `tenant_stores`

- Classificação: `Atual`
- Papel: diretório global de lojas do shell.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `code` varchar(40); `name` varchar(120); `city` varchar(120); `is_active` boolean; `sort_order` integer; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `tenants`; 1:N com `tenant_users`; 1:N lógica com módulos convergidos como `fila_atendimento`.
- Exemplo: `{"tenant":"perola-core","code":"garcia","name":"Garcia","city":"Blumenau","is_active":true}`.
- Observações: esta passou a ser a loja canônica da plataforma. O `fila_atendimento` já referencia esta tabela diretamente em `consultants`, `store_profiles` e todo o bloco `operation_*`; `tenant_store_charges` também ficou subordinada a ela por `store_id` obrigatório.

## Tabelas técnicas de sessão, auditoria e presença

### `user_sessions`

- Classificação: `Técnico-operacional`
- Papel: sessão ativa, revogada ou expirada do shell.
- Campos: `id` uuid PK; `user_id` uuid FK; `tenant_id` uuid FK nullable; `session_token_hash` varchar(255) unique; `refresh_token_hash` varchar(255) nullable; `ip` inet nullable; `user_agent` text nullable; `device_name` varchar(120) nullable; `status` enum `active|revoked|expired`; `last_seen_at` timestamptz; `expires_at` timestamptz; `revoked_at` timestamptz nullable; `metadata` jsonb; `created_at` timestamptz.
- Relações: N:1 com `users` e opcionalmente `tenants`.
- Exemplo: `{"user":"root@core.local","status":"active","device_name":"Chrome Windows","tenant_id":null}`.

### `auth_session_settings`

- Classificação: `Técnico-operacional`
- Papel: TTL de sessão por escopo.
- Campos: `scope_key` varchar(32) PK; `ttl_minutes` integer; `updated_by_user_id` uuid FK nullable; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 opcional com `users`.
- Exemplo: `{"scope_key":"shell-admin","ttl_minutes":480}`.

### `auth_password_resets`

- Classificação: `Técnico-operacional`
- Papel: trilha de recuperação de senha.
- Campos: `id` uuid PK; `user_id` uuid FK; `email` citext; `code_hash` varchar(255); `attempts` integer; `status` varchar(20) com conjunto `pending|used|expired|revoked`; `requested_ip` varchar(64) nullable; `requested_user_agent` varchar(500) nullable; `expires_at` timestamptz; `used_at` timestamptz nullable; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `users`.
- Exemplo: `{"email":"admin@acme.local","status":"pending","attempts":0}`.

### `audit_logs`

- Classificação: `Técnico-operacional`
- Papel: auditoria de antes/depois do shell.
- Campos: `id` uuid PK; `tenant_id` uuid FK nullable; `user_id` uuid FK nullable; `module_id` uuid FK nullable; `action` varchar(150); `entity_type` varchar(80) nullable; `entity_id` uuid nullable; `before_data` jsonb nullable; `after_data` jsonb nullable; `metadata` jsonb; `created_at` timestamptz.
- Relações: N:1 opcionais com `tenants`, `users` e `modules`.
- Exemplo: `{"action":"tenant.modules.update","entity_type":"tenant_module","metadata":{"source":"admin-panel"}}`.

### `presence_connections`

- Classificação: `Técnico-operacional`
- Papel: rastrear conexão e presença em canais de realtime.
- Campos: `id` uuid PK; `tenant_id` uuid FK; `user_id` uuid FK; `module_id` uuid FK nullable; `connection_id` varchar(120); `channel` varchar(150) nullable; `status` varchar(20); `last_ping_at` timestamptz; `connected_at` timestamptz; `disconnected_at` timestamptz nullable; `metadata` jsonb.
- Relações: N:1 com `tenants`, `users` e opcionalmente `modules`.
- Exemplo: `{"tenant":"acme-core","user":"admin@acme.local","channel":"admin-dashboard","status":"connected"}`.

## Fronteira com o módulo financeiro

O bloco `finance_*` deixou o `platform_core` e passou a morar em schema próprio `finance` pela migration `0030_extract_finance_schema.sql`.

- o shell continua dono de `tenants`, identidade, grants e limites;
- o módulo `finance` consome `platform_core.tenants` como referência compartilhada;
- o catálogo visual atualizado do financeiro está em [finance.html](finance.html).

## Leituras finais sobre `platform_core`

### Estruturas mais importantes para o futuro

1. `users`, `tenant_users`, `tenant_modules` e `tenant_user_modules` são a base de unificação da plataforma;
2. qualquer módulo hospedado deveria depender desse núcleo para grants e identidade;
3. `plans`, `tenant_module_limits` e `tenant_module_pricing` já sustentam governança comercial adequada.

### Estruturas que merecem revisão prioritária

1. `tenant_store_charges` ainda existe como overlay financeiro de compatibilidade; o próximo passo é retirar leituras e inputs operacionais residuais dessa tabela;
2. a fronteira entre `platform_core` e `finance` ainda depende do tenant canônico e do legado de planilhas por `legacy_id`;
3. `legacy_id` em entidades principais que ainda sustentam compatibilidade histórica.
