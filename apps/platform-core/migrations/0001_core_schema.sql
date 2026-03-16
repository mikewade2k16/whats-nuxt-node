CREATE SCHEMA IF NOT EXISTS platform_core;
SET search_path TO platform_core, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'tenant_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE tenant_status AS ENUM ('trialing', 'active', 'suspended', 'cancelled');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'user_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'blocked', 'pending_invite');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'tenant_user_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE tenant_user_status AS ENUM ('invited', 'active', 'suspended');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'subscription_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'billing_cycle' AND n.nspname = current_schema()) THEN
    CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'tenant_module_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE tenant_module_status AS ENUM ('active', 'inactive', 'suspended');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'module_source' AND n.nspname = current_schema()) THEN
    CREATE TYPE module_source AS ENUM ('plan', 'addon', 'custom');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'tenant_user_module_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE tenant_user_module_status AS ENUM ('active', 'inactive');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'session_status' AND n.nspname = current_schema()) THEN
    CREATE TYPE session_status AS ENUM ('active', 'revoked', 'expired');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  legal_name varchar(255),
  document varchar(30),
  status tenant_status NOT NULL DEFAULT 'trialing',
  timezone varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  locale varchar(10) NOT NULL DEFAULT 'pt-BR',
  contact_email varchar(255),
  contact_phone varchar(30),
  billing_mode varchar(30),
  billing_day smallint CHECK (billing_day BETWEEN 1 AND 31),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  display_name varchar(255),
  email citext NOT NULL UNIQUE,
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
CREATE INDEX IF NOT EXISTS idx_users_platform_admin ON users(is_platform_admin);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

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
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_owner ON tenant_users(tenant_id, is_owner);

CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_core boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_active ON modules(is_active);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  is_custom boolean NOT NULL DEFAULT false,
  currency varchar(10) NOT NULL DEFAULT 'BRL',
  price_monthly numeric(12,2),
  price_yearly numeric(12,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);

CREATE TABLE IF NOT EXISTS plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, module_id)
);

CREATE TABLE IF NOT EXISTS plan_module_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  limit_key varchar(80) NOT NULL,
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
  external_provider varchar(80),
  external_subscription_id varchar(255),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan ON tenant_subscriptions(plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_active_subscription
  ON tenant_subscriptions(tenant_id)
  WHERE status IN ('trialing', 'active');

CREATE TABLE IF NOT EXISTS tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  status tenant_module_status NOT NULL DEFAULT 'active',
  source module_source NOT NULL DEFAULT 'plan',
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_status ON tenant_modules(tenant_id, status);

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
  source varchar(50) NOT NULL DEFAULT 'manual_override',
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_id, limit_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_limits_lookup
  ON tenant_module_limits(tenant_id, module_id, limit_key);

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

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid REFERENCES modules(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(150) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  description text,
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_user_id uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_tenant_user ON tenant_user_roles(tenant_user_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
  action varchar(150) NOT NULL,
  entity_type varchar(80),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS presence_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
  connection_id varchar(120) NOT NULL,
  channel varchar(150),
  status varchar(20) NOT NULL DEFAULT 'connected',
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_presence_connections_tenant_user_status
  ON presence_connections(tenant_id, user_id, status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants',
    'users',
    'tenant_users',
    'modules',
    'plans',
    'plan_module_limits',
    'tenant_subscriptions',
    'tenant_modules',
    'tenant_module_limits',
    'tenant_user_modules',
    'roles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END
$$;
