SET search_path TO platform_core, public;

-- Tenant operacional adicional para auditoria de isolamento e homologacao multi-tenant.
-- Canonico no core: acme-core
-- Alias legados do painel/omnichannel: admin@acme.local, supervisor@acme.local, agente@acme.local, viewer@acme.local

INSERT INTO tenants (
  slug,
  name,
  status,
  contact_email,
  billing_mode,
  monthly_payment_amount,
  user_count,
  project_count,
  user_nicks,
  project_segments,
  webhook_enabled,
  webhook_key,
  metadata
)
VALUES (
  'acme-core',
  'ACME',
  'active',
  'admin@acme.local',
  'single',
  0,
  10,
  0,
  '{}'::text[],
  '{}'::text[],
  false,
  '',
  jsonb_build_object('bootstrap', 'migration_0016')
)
ON CONFLICT (slug) DO UPDATE
SET name = 'ACME',
    status = 'active',
    contact_email = 'admin@acme.local',
    billing_mode = COALESCE(NULLIF(tenants.billing_mode, ''), 'single'),
    user_count = CASE
      WHEN COALESCE(tenants.user_count, 0) < 10 THEN 10
      ELSE tenants.user_count
    END,
    deleted_at = NULL,
    updated_at = now();

INSERT INTO users (
  name,
  display_name,
  email,
  password_hash,
  status,
  is_platform_admin,
  email_verified_at,
  metadata
)
VALUES
  ('Admin ACME', 'Admin ACME', 'admin@acme.local', crypt('123456', gen_salt('bf')), 'active', false, now(), jsonb_build_object('bootstrap', 'migration_0016')),
  ('Supervisor ACME', 'Supervisor ACME', 'supervisor@acme.local', crypt('123456', gen_salt('bf')), 'active', false, now(), jsonb_build_object('bootstrap', 'migration_0016')),
  ('Agente ACME', 'Agente ACME', 'agente@acme.local', crypt('123456', gen_salt('bf')), 'active', false, now(), jsonb_build_object('bootstrap', 'migration_0016')),
  ('Viewer ACME', 'Viewer ACME', 'viewer@acme.local', crypt('123456', gen_salt('bf')), 'active', false, now(), jsonb_build_object('bootstrap', 'migration_0016'))
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    status = EXCLUDED.status,
    is_platform_admin = EXCLUDED.is_platform_admin,
    email_verified_at = now(),
    deleted_at = NULL,
    updated_at = now();

INSERT INTO tenant_users (
  tenant_id,
  user_id,
  status,
  is_owner,
  joined_at,
  access_level,
  user_type,
  metadata
)
SELECT
  t.id,
  u.id,
  'active',
  CASE WHEN u.email = 'admin@acme.local' THEN true ELSE false END,
  now(),
  CASE
    WHEN u.email = 'admin@acme.local' THEN 'admin'
    WHEN u.email = 'supervisor@acme.local' THEN 'manager'
    WHEN u.email = 'viewer@acme.local' THEN 'viewer'
    ELSE 'marketing'
  END,
  CASE
    WHEN u.email = 'admin@acme.local' THEN 'admin'
    ELSE 'client'
  END,
  jsonb_build_object('bootstrap', 'migration_0016')
FROM tenants t
JOIN users u ON u.email IN ('admin@acme.local', 'supervisor@acme.local', 'agente@acme.local', 'viewer@acme.local')
WHERE t.slug = 'acme-core'
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = 'active',
    is_owner = EXCLUDED.is_owner,
    joined_at = COALESCE(tenant_users.joined_at, EXCLUDED.joined_at),
    access_level = EXCLUDED.access_level,
    user_type = EXCLUDED.user_type,
    metadata = tenant_users.metadata || EXCLUDED.metadata,
    updated_at = now();

DELETE FROM tenant_subscriptions ts
USING tenants t
WHERE ts.tenant_id = t.id
  AND t.slug = 'acme-core'
  AND ts.status IN ('trialing', 'active');

INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, starts_at, currency, price_snapshot)
SELECT t.id, p.id, 'active', 'monthly', now(), p.currency, p.price_monthly
FROM tenants t
JOIN plans p ON p.code = 'pro'
WHERE t.slug = 'acme-core';

INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at, metadata)
SELECT t.id, m.id, 'active', 'plan', now(), NULL, jsonb_build_object('bootstrap', 'migration_0016')
FROM tenants t
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE t.slug = 'acme-core'
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET status = 'active',
    source = EXCLUDED.source,
    activated_at = now(),
    deactivated_at = NULL,
    updated_at = now();

INSERT INTO tenant_module_limits (
  tenant_id,
  module_id,
  limit_key,
  limit_value_int,
  is_unlimited,
  source,
  notes,
  created_by_user_id,
  metadata
)
SELECT
  tm.tenant_id,
  tm.module_id,
  limit_config.limit_key,
  limit_config.limit_value_int,
  false,
  'migration_0016',
  limit_config.notes,
  NULL,
  '{}'::jsonb
FROM tenant_modules tm
JOIN modules m ON m.id = tm.module_id
JOIN (
  VALUES
    ('core_panel', 'users', 10, 'Default users limit for ACME bootstrap'),
    ('atendimento', 'users', 3, 'Default atendimento users limit for ACME bootstrap'),
    ('atendimento', 'instances', 1, 'Default atendimento instances limit for ACME bootstrap')
) AS limit_config(module_code, limit_key, limit_value_int, notes)
  ON limit_config.module_code = m.code
JOIN tenants t ON t.id = tm.tenant_id
WHERE t.slug = 'acme-core'
ON CONFLICT (tenant_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited,
    source = EXCLUDED.source,
    notes = EXCLUDED.notes,
    updated_at = now();

INSERT INTO tenant_user_modules (
  tenant_id,
  tenant_user_id,
  module_id,
  status,
  granted_by_user_id,
  granted_at,
  metadata
)
SELECT
  tu.tenant_id,
  tu.id,
  m.id,
  'active',
  NULL,
  now(),
  jsonb_build_object('bootstrap', 'migration_0016')
FROM tenant_users tu
JOIN tenants t ON t.id = tu.tenant_id
JOIN users u ON u.id = tu.user_id
JOIN modules m ON m.code IN ('core_panel', 'atendimento')
WHERE t.slug = 'acme-core'
  AND (
    m.code = 'core_panel'
    OR u.email IN ('admin@acme.local', 'supervisor@acme.local', 'agente@acme.local')
  )
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    granted_at = now(),
    updated_at = now();

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), jsonb_build_object('bootstrap', 'migration_0016')
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'tenant_admin' AND r.tenant_id IS NULL
WHERE t.slug = 'acme-core'
  AND u.email = 'admin@acme.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), jsonb_build_object('bootstrap', 'migration_0016')
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'module_manager' AND r.tenant_id IS NULL
WHERE t.slug = 'acme-core'
  AND u.email = 'supervisor@acme.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), jsonb_build_object('bootstrap', 'migration_0016')
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'module_agent' AND r.tenant_id IS NULL
WHERE t.slug = 'acme-core'
  AND u.email = 'agente@acme.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;
