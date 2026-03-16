# Core Module (SaaS Multi-Tenant) — Backend Spec
> Stack alvo: **PostgreSQL + API + WebSocket**
> Linguagem/Framework: livre (Node/Nest/Fastify/Express, Go, PHP, etc.)
> Este módulo é o **núcleo** da plataforma e deve ser independente dos módulos de domínio (atendimento, kanban, financeiro, etc.)

---

## 1) Objetivo do módulo Core

Este módulo é responsável por:

- Multi-tenant (clientes/tenants)
- Usuários globais da plataforma
- Vínculo usuário ↔ tenant
- Catálogo de módulos (core_panel, atendimento, kanban, etc.)
- Planos
- Assinaturas do tenant
- Módulos ativos por tenant
- Limites por módulo (do plano e override por tenant)
- Alocação de usuários por módulo (ex.: atendimento = 3 usuários)
- Papéis e permissões (RBAC)
- Sessões
- Auditoria
- Presença/atividade básica via WebSocket

---

## 2) Regras de negócio principais

### 2.1 Multi-tenant
- Um **tenant** representa um cliente/empresa.
- Um **usuário** é global (identidade de login).
- O vínculo do usuário com o tenant é feito em `tenant_users`.
- Um usuário pode pertencer a 1+ tenants (futuro), mas inicialmente pode ser usado com 1 tenant sem quebrar o modelo.

### 2.2 Módulos e planos
- Um tenant pode ter módulos ativos:
  - via plano (`source = 'plan'`)
  - via addon (`source = 'addon'`)
  - via customização (`source = 'custom'`)
- O plano define limites padrão por módulo.
- O tenant pode ter **overrides** de limites (ex.: atendimento.users = 5 em vez de 3).

### 2.3 Limite de usuários por módulo
- O limite é controlado por:
  - `plan_module_limits` (limite base do plano)
  - `tenant_module_limits` (override)
- A ocupação de vagas por módulo é registrada em `tenant_user_modules`.

### 2.4 RBAC
- Permissões são granulares (`users.create`, `tenant.modules.update`, etc.)
- Roles agrupam permissões.
- Usuários no tenant recebem roles via `tenant_user_roles`.

### 2.5 Auditoria
- Ações relevantes devem gerar log em `audit_logs`.

### 2.6 WebSocket (presença/atividade)
- Usar WebSocket para presença/atividade leve:
  - usuário entrou/saiu
  - heartbeat
  - “está visualizando tela X”
- Dados persistentes relevantes vão para `audit_logs`.
- Presença efêmera pode ficar em memória/Redis (opcional).

---

## 3) PostgreSQL — Convenções

### 3.1 Convenções de modelagem
- IDs: `uuid` (recomendado)
- Datas: `timestamptz`
- Soft delete: `deleted_at` (quando fizer sentido)
- JSON para configs/metadados: `jsonb`
- Senhas: armazenar somente `password_hash`
- E-mails:
  - normalizar para lower-case na aplicação
  - índice único em `users.email`

### 3.2 Extensões recomendadas
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- email case-insensitive (opcional)
4) Schema (DDL) — Tabelas principais

Observação: abaixo está uma base robusta para o módulo core.
Pode ser dividida em migrations.

4.1 Enums (opcional)

Se preferir evitar enum no banco, trocar por varchar + validação na aplicação.

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('trialing', 'active', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive', 'blocked', 'pending_invite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_module_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE module_source AS ENUM ('plan', 'addon', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_user_module_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('active', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
4.2 tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  legal_name varchar(255),
  document varchar(30), -- cpf/cnpj opcional
  status tenant_status NOT NULL DEFAULT 'trialing',

  timezone varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  locale varchar(10) NOT NULL DEFAULT 'pt-BR',

  contact_email varchar(255),
  contact_phone varchar(30),

  billing_mode varchar(30), -- ex.: single, per_store (se ainda precisar)
  billing_day smallint CHECK (billing_day BETWEEN 1 AND 31),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at);
4.3 users
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name varchar(255) NOT NULL,
  display_name varchar(255),

  email citext NOT NULL UNIQUE, -- se não usar citext, usar varchar + lower() na app
  password_hash varchar(255) NOT NULL,

  phone varchar(30),
  avatar_url varchar(500),

  status user_status NOT NULL DEFAULT 'active',
  is_platform_admin boolean NOT NULL DEFAULT false,

  email_verified_at timestamptz,
  last_login_at timestamptz,

  two_factor_enabled boolean NOT NULL DEFAULT false,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_is_platform_admin ON users(is_platform_admin);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
4.4 tenant_users (vínculo usuário ↔ tenant)
CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status tenant_user_status NOT NULL DEFAULT 'invited',
  is_owner boolean NOT NULL DEFAULT false,

  job_title varchar(120),
  invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  joined_at timestamptz,
  last_seen_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_status ON tenant_users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_is_owner ON tenant_users(tenant_id, is_owner);
4.5 modules (catálogo de módulos)
CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  code varchar(80) NOT NULL UNIQUE,    -- ex.: core_panel, atendimento, kanban
  name varchar(120) NOT NULL,
  description text,

  is_active boolean NOT NULL DEFAULT true,
  is_core boolean NOT NULL DEFAULT false,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_active ON modules(is_active);
4.6 plans
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  code varchar(80) NOT NULL UNIQUE, -- starter, pro, enterprise, atendimento_starter...
  name varchar(120) NOT NULL,

  status varchar(20) NOT NULL DEFAULT 'active', -- active/inactive
  is_custom boolean NOT NULL DEFAULT false,

  currency varchar(10) NOT NULL DEFAULT 'BRL',
  price_monthly numeric(12,2),
  price_yearly numeric(12,2),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
4.7 plan_modules
CREATE TABLE IF NOT EXISTS plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,

  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (plan_id, module_id)
);
4.8 plan_module_limits (limites padrão do plano por módulo)
CREATE TABLE IF NOT EXISTS plan_module_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,

  limit_key varchar(80) NOT NULL, -- ex.: users, boards, pipelines, connections
  limit_value_int integer,
  limit_value_numeric numeric(12,2),
  limit_value_bool boolean,
  limit_value_json jsonb,
  is_unlimited boolean NOT NULL DEFAULT false,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (plan_id, module_id, limit_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_module_limits_lookup
  ON plan_module_limits(plan_id, module_id, limit_key);
4.9 tenant_subscriptions
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,

  status subscription_status NOT NULL DEFAULT 'trialing',
  billing_cycle billing_cycle NOT NULL DEFAULT 'monthly',

  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,

  price_snapshot numeric(12,2),
  currency varchar(10) NOT NULL DEFAULT 'BRL',

  external_provider varchar(80),     -- stripe, asaas, etc (opcional)
  external_subscription_id varchar(255),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id);

Regra recomendada: manter 1 assinatura ativa/trialing por tenant (validar na aplicação, ou criar índice parcial depois).

4.10 tenant_modules (módulos efetivamente ativos por tenant)
CREATE TABLE IF NOT EXISTS tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,

  status tenant_module_status NOT NULL DEFAULT 'active',
  source module_source NOT NULL DEFAULT 'plan', -- plan/addon/custom

  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_status ON tenant_modules(tenant_id, status);
4.11 tenant_module_limits (override por tenant)
CREATE TABLE IF NOT EXISTS tenant_module_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,

  limit_key varchar(80) NOT NULL,

  limit_value_int integer,
  limit_value_numeric numeric(12,2),
  limit_value_bool boolean,
  limit_value_json jsonb,
  is_unlimited boolean NOT NULL DEFAULT false,

  source varchar(50) NOT NULL DEFAULT 'manual_override', -- manual_override, promo, custom_contract
  notes text,

  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, module_id, limit_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_limits_lookup
  ON tenant_module_limits(tenant_id, module_id, limit_key);
4.12 tenant_user_modules (alocação de usuário por módulo)

Essa tabela é essencial para limitar quantos usuários um tenant pode ter em cada módulo.

CREATE TABLE IF NOT EXISTS tenant_user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_user_id uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,

  status tenant_user_module_status NOT NULL DEFAULT 'active',

  granted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_modules_tenant_module_status
  ON tenant_user_modules(tenant_id, module_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_user_modules_tenant_user
  ON tenant_user_modules(tenant_user_id);

Validação importante na aplicação: garantir que tenant_user_id pertence ao mesmo tenant_id da linha.

5) RBAC (Roles & Permissions)
5.1 roles
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, -- null = role global/template
  module_id uuid REFERENCES modules(id) ON DELETE CASCADE, -- null = role geral

  code varchar(100) NOT NULL,
  name varchar(120) NOT NULL,
  description text,

  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, module_id, code)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant_module ON roles(tenant_id, module_id);
5.2 permissions
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  code varchar(150) NOT NULL UNIQUE, -- ex.: users.create, users.update, tenant.modules.update
  name varchar(150) NOT NULL,
  description text,

  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);
5.3 role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (role_id, permission_id)
);
5.4 tenant_user_roles
CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_user_id uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (tenant_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_tenant_user_id ON tenant_user_roles(tenant_user_id);
6) Sessões e Auditoria
6.1 user_sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, -- sessão pode estar contextualizada no tenant

  session_token_hash varchar(255) NOT NULL UNIQUE,
  refresh_token_hash varchar(255),

  ip inet,
  user_agent text,
  device_name varchar(120),

  status session_status NOT NULL DEFAULT 'active',
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
6.2 audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,

  action varchar(150) NOT NULL,       -- ex.: tenant.user.invited, module.limit.updated, card.moved
  entity_type varchar(80),            -- ex.: tenant_user, tenant_module_limit, lead, card
  entity_id uuid,                     -- se entidade usar uuid; se não, usar metadata

  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- ip, request_id, user_agent, route, etc.

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id_created_at ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created_at ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
7) Presença / Atividade WebSocket (opcional persistência)

Presença é melhor em memória/Redis. Se quiser persistir conexões ativas (debug/monitoramento), usar tabela abaixo.

7.1 presence_connections (opcional)
CREATE TABLE IF NOT EXISTS presence_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,

  connection_id varchar(120) NOT NULL, -- id interno do ws/socket
  channel varchar(150),                -- ex.: tenant:{id}:presence / module:{code}
  status varchar(20) NOT NULL DEFAULT 'connected',

  last_ping_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_presence_connections_tenant_user_status
  ON presence_connections(tenant_id, user_id, status);
8) Triggers utilitárias (updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

Aplicar em tabelas com updated_at:

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','users','tenant_users','modules','plans',
    'plan_module_limits','tenant_subscriptions','tenant_modules',
    'tenant_module_limits','tenant_user_modules','roles'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;
9) Dados seed iniciais (mínimos)
9.1 Módulos

core_panel

atendimento

kanban

9.2 Permissions (exemplos)

tenants.read

tenants.update

tenant.users.read

tenant.users.invite

tenant.users.update

tenant.users.modules.assign

tenant.modules.read

tenant.modules.update

tenant.limits.read

tenant.limits.update

audit.read

roles.read

roles.update

9.3 Roles base

platform_root (global / is_platform_admin = true)

tenant_owner

tenant_admin

module_manager

module_agent (ex.: atendimento)

9.4 Planos (exemplo)

starter

pro

Exemplo de limites:

starter:

core_panel.users = 3

atendimento.users = 1

kanban.users = 2

pro:

core_panel.users = 15

atendimento.users = 3

kanban.users = 5

10) Regras de resolução de limites
10.1 Ordem de prioridade

Para obter limite final (tenant + module + limit_key):

tenant_module_limits (override)

plan_module_limits (plano ativo do tenant)

default da aplicação (hardcoded/config)

sem limite / erro (dependendo da regra)

10.2 Semântica de “ilimitado”

Se is_unlimited = true, ignorar limit_value_*.

Se is_unlimited = false e limit_value_int for NULL, tratar como “não definido”.

11) Query exemplo — resolver limite final de um tenant para um módulo

Exemplo para limit_key = 'users'

WITH active_subscription AS (
  SELECT ts.*
  FROM tenant_subscriptions ts
  WHERE ts.tenant_id = $1
    AND ts.status IN ('trialing', 'active')
  ORDER BY ts.created_at DESC
  LIMIT 1
),
tenant_override AS (
  SELECT tml.*
  FROM tenant_module_limits tml
  JOIN modules m ON m.id = tml.module_id
  WHERE tml.tenant_id = $1
    AND m.code = $2
    AND tml.limit_key = $3
  LIMIT 1
),
plan_limit AS (
  SELECT pml.*
  FROM plan_module_limits pml
  JOIN modules m ON m.id = pml.module_id
  JOIN active_subscription s ON s.plan_id = pml.plan_id
  WHERE m.code = $2
    AND pml.limit_key = $3
  LIMIT 1
)
SELECT
  COALESCE(tover.is_unlimited, pl.is_unlimited, false) AS is_unlimited,
  COALESCE(tover.limit_value_int, pl.limit_value_int)   AS limit_value_int,
  CASE
    WHEN tover.id IS NOT NULL THEN 'tenant_override'
    WHEN pl.id IS NOT NULL THEN 'plan_limit'
    ELSE 'default'
  END AS source
FROM tenant_override tover
FULL OUTER JOIN plan_limit pl ON true;

Parâmetros:

$1 = tenant_id

$2 = module_code (ex.: atendimento)

$3 = limit_key (ex.: users)

12) Query exemplo — contar usuários ativos alocados em um módulo
SELECT COUNT(*)::int AS active_users_in_module
FROM tenant_user_modules tum
JOIN tenant_users tu ON tu.id = tum.tenant_user_id
JOIN modules m ON m.id = tum.module_id
WHERE tum.tenant_id = $1
  AND m.code = $2
  AND tum.status = 'active'
  AND tu.status = 'active';
13) Regra de validação — pode alocar usuário no módulo?
Algoritmo (aplicação)

Verificar se:

tenant existe e está ativo

módulo está ativo para o tenant (tenant_modules.status = active)

usuário pertence ao tenant (tenant_users)

vínculo do usuário no tenant está ativo

Resolver limite final (users) para aquele módulo

Se is_unlimited = true → permitir

Contar usuários ativos alocados no módulo

Se já existir vínculo ativo do usuário no módulo → idempotente (sucesso/no-op)

Se count >= limit → bloquear

Inserir em tenant_user_modules

Registrar em audit_logs

Emitir evento websocket (opcional)

14) API (REST) — endpoints mínimos do Core

Prefixo sugerido: /core

14.1 Auth / Sessões

POST /core/auth/login

POST /core/auth/logout

POST /core/auth/refresh

GET /core/auth/me

14.2 Tenants

GET /core/tenants (root admin)

POST /core/tenants

GET /core/tenants/:tenantId

PATCH /core/tenants/:tenantId

POST /core/tenants/:tenantId/suspend

POST /core/tenants/:tenantId/activate

14.3 Usuários globais (root/admin)

GET /core/users

POST /core/users

GET /core/users/:userId

PATCH /core/users/:userId

POST /core/users/:userId/block

POST /core/users/:userId/unblock

14.4 Usuários do tenant

GET /core/tenants/:tenantId/users

POST /core/tenants/:tenantId/users/invite

PATCH /core/tenants/:tenantId/users/:tenantUserId

POST /core/tenants/:tenantId/users/:tenantUserId/activate

POST /core/tenants/:tenantId/users/:tenantUserId/suspend

POST /core/tenants/:tenantId/users/:tenantUserId/set-owner

14.5 Módulos do tenant

GET /core/tenants/:tenantId/modules

POST /core/tenants/:tenantId/modules/:moduleCode/activate

POST /core/tenants/:tenantId/modules/:moduleCode/deactivate

14.6 Limites

GET /core/tenants/:tenantId/limits (resolved)

GET /core/tenants/:tenantId/modules/:moduleCode/limits

PUT /core/tenants/:tenantId/modules/:moduleCode/limits/:limitKey (override)

DELETE /core/tenants/:tenantId/modules/:moduleCode/limits/:limitKey (remove override)

14.7 Alocação de usuários por módulo

GET /core/tenants/:tenantId/modules/:moduleCode/users

POST /core/tenants/:tenantId/modules/:moduleCode/users/:tenantUserId/assign

POST /core/tenants/:tenantId/modules/:moduleCode/users/:tenantUserId/revoke

14.8 Roles / Permissões

GET /core/permissions

GET /core/tenants/:tenantId/roles

POST /core/tenants/:tenantId/roles

PATCH /core/tenants/:tenantId/roles/:roleId

POST /core/tenants/:tenantId/users/:tenantUserId/roles/:roleId/assign

DELETE /core/tenants/:tenantId/users/:tenantUserId/roles/:roleId

14.9 Auditoria

GET /core/tenants/:tenantId/audit-logs

filtros:

user_id

action

entity_type

entity_id

date_from

date_to

15) WebSocket — eventos mínimos do Core

Objetivo inicial: presença + atividade simples + atualização de limites/usuários/módulos para telas admin em tempo real

15.1 Canais sugeridos

tenant:{tenantId}:presence

tenant:{tenantId}:admin

tenant:{tenantId}:module:{moduleCode}

15.2 Eventos cliente -> servidor

presence.join

presence.heartbeat

presence.leave

activity.screen_view (ex.: core.tenants.users)

activity.action_start (opcional)

activity.action_end (opcional)

Payload exemplo
{
  "type": "presence.join",
  "tenantId": "uuid",
  "moduleCode": "core_panel",
  "sessionId": "uuid",
  "screen": "tenant.users"
}
15.3 Eventos servidor -> clientes

presence.user_joined

presence.user_left

presence.user_updated

tenant.user.invited

tenant.user.updated

tenant.module.updated

tenant.limit.updated

Payload exemplo
{
  "type": "tenant.limit.updated",
  "tenantId": "uuid",
  "moduleCode": "atendimento",
  "limitKey": "users",
  "resolved": {
    "isUnlimited": false,
    "value": 5,
    "source": "tenant_override"
  },
  "byUserId": "uuid",
  "at": "2025-01-01T12:00:00Z"
}
16) Segurança / Autorização (mínimo)

JWT ou sessão com token hash em user_sessions

Sempre validar:

user.status = active

sessão ativa e não expirada

tenant_users.status = active para contexto do tenant

tenant ativo

módulo ativo para tenant (quando rota for de módulo)

Root admin (is_platform_admin = true) pode gerenciar todos os tenants

Usuários de tenant só podem operar dentro do próprio tenant

17) Auditoria — o que registrar (mínimo)

Registrar em audit_logs pelo menos:

login/logout

criação/edição/suspensão de tenant

convite/ativação/suspensão de usuário do tenant

ativação/desativação de módulo

alteração de limites (plan/override)

atribuição/revogação de acesso de usuário a módulo

alterações de roles/permissões

18) Casos de uso essenciais (MVP Core)

Criar tenant

Criar usuário owner

Vincular owner ao tenant (tenant_users.is_owner = true)

Criar assinatura e plano

Ativar módulos do tenant

Consultar limites resolvidos

Convidar usuários

Atribuir usuários aos módulos respeitando limite

Admin root sobrescrever limite de módulo

Registrar auditoria de tudo acima

WebSocket de presença/admin opcional

19) Ordem sugerida de implementação (backend)
Fase 1 — Base de dados + auth

migrations das tabelas:

tenants, users, tenant_users

modules, plans, subscriptions, tenant_modules

plan_module_limits, tenant_module_limits

tenant_user_modules

user_sessions, audit_logs

login/session

auth middleware

seed de módulos/planos/permissões

Fase 2 — APIs core admin

tenants CRUD

tenant users (invite/list/update)

tenant modules activate/deactivate

limits (resolver + override)

assign/revoke user module access (com validação de limite)

Fase 3 — RBAC

roles/permissions

middleware de autorização por permission code

Fase 4 — WebSocket

presença + heartbeat

broadcasts para telas admin

integração com audit/event bus (opcional)

20) Observações de arquitetura

Este módulo Core deve ser independente dos módulos de domínio.

Módulos como atendimento e kanban devem consultar o Core para:

validar tenant e usuário

validar acesso ao módulo

validar limite de usuários do módulo

consultar roles/permissões

Idealmente expor um client SDK interno ou chamadas HTTP internas.

21) Checklist de aceite (MVP Core)

 Cria tenant e owner

 Cria planos, módulos e limites

 Ativa módulos por tenant

 Resolve limite final (plan + override)

 Impede exceder limite de usuários por módulo

 Permite modo ilimitado

 Audit logs registrados

 Sessões funcionando

 WebSocket de presença básico funcionando (opcional MVP+)

22) Exemplo rápido de seed de módulos (SQL)
INSERT INTO modules (code, name, is_core)
VALUES
  ('core_panel', 'Core Panel', true),
  ('atendimento', 'Atendimento', false),
  ('kanban', 'Kanban', false)
ON CONFLICT (code) DO NOTHING;
23) Exemplo rápido de seed de plano + limites (SQL)
-- Exemplo assume que os módulos já existem

INSERT INTO plans (code, name, status, currency, price_monthly)
VALUES ('pro', 'Pro', 'active', 'BRL', 199.90)
ON CONFLICT (code) DO NOTHING;

-- Vincular módulos ao plano
INSERT INTO plan_modules (plan_id, module_id, enabled)
SELECT p.id, m.id, true
FROM plans p
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE p.code = 'pro'
ON CONFLICT (plan_id, module_id) DO NOTHING;

-- Limites do plano pro
INSERT INTO plan_module_limits (plan_id, module_id, limit_key, limit_value_int, is_unlimited)
SELECT p.id, m.id, 'users',
  CASE m.code
    WHEN 'core_panel' THEN 15
    WHEN 'atendimento' THEN 3
    WHEN 'kanban' THEN 5
  END,
  false
FROM plans p
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE p.code = 'pro'
ON CONFLICT (plan_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited;
24) Futuro (não obrigatório agora)

Convites por email (tenant_user_invitations)

Password reset tokens

2FA

Feature flags por tenant/módulo

Billing provider integration

Redis para presença e broadcast

Outbox/event bus para integração entre serviços