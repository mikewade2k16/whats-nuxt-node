SET search_path TO platform_core, public;

-- Ensure finance module exists for access-control and pricing in admin panel.
INSERT INTO modules (
  code,
  name,
  description,
  is_core,
  is_active,
  base_price_monthly,
  base_price_yearly,
  billing_currency
)
VALUES (
  'finance',
  'Finance',
  'Financeiro e faturamento',
  false,
  true,
  0,
  0,
  'BRL'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

-- Backfill default user limit in tenant profile for pre-rule clients.
UPDATE tenants
SET user_count = 10,
    updated_at = now()
WHERE deleted_at IS NULL
  AND COALESCE(user_count, 0) <= 0;

-- Ensure every active tenant has core_panel active.
INSERT INTO tenant_modules (
  tenant_id,
  module_id,
  status,
  source,
  activated_at,
  deactivated_at,
  metadata
)
SELECT
  t.id,
  m.id,
  'active',
  'custom',
  now(),
  NULL,
  '{}'::jsonb
FROM tenants t
JOIN modules m ON m.code = 'core_panel'
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, module_id)
DO UPDATE SET
  status = 'active',
  source = EXCLUDED.source,
  activated_at = now(),
  deactivated_at = NULL,
  updated_at = now();

-- Backfill default users=10 limits for active core_panel/atendimento modules when empty.
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
  'users',
  10,
  false,
  'migration_0007',
  'Default users limit backfill for pre-rule clients',
  NULL,
  '{}'::jsonb
FROM tenant_modules tm
JOIN modules m ON m.id = tm.module_id
JOIN tenants t ON t.id = tm.tenant_id
WHERE t.deleted_at IS NULL
  AND tm.status = 'active'
  AND m.code IN ('core_panel', 'atendimento')
ON CONFLICT (tenant_id, module_id, limit_key)
DO UPDATE SET
  limit_value_int = CASE
    WHEN tenant_module_limits.limit_value_int IS NULL OR tenant_module_limits.limit_value_int <= 0
      THEN EXCLUDED.limit_value_int
    ELSE tenant_module_limits.limit_value_int
  END,
  is_unlimited = CASE
    WHEN tenant_module_limits.limit_value_int IS NULL OR tenant_module_limits.limit_value_int <= 0
      THEN false
    ELSE tenant_module_limits.is_unlimited
  END,
  source = CASE
    WHEN tenant_module_limits.limit_value_int IS NULL OR tenant_module_limits.limit_value_int <= 0
      THEN EXCLUDED.source
    ELSE tenant_module_limits.source
  END,
  notes = CASE
    WHEN tenant_module_limits.limit_value_int IS NULL OR tenant_module_limits.limit_value_int <= 0
      THEN EXCLUDED.notes
    ELSE tenant_module_limits.notes
  END,
  updated_at = now();

-- Normalize owner memberships as admin/admin.
UPDATE tenant_users
SET access_level = 'admin',
    user_type = 'admin',
    updated_at = now()
WHERE is_owner = true
  AND (access_level <> 'admin' OR user_type <> 'admin');

-- Create bootstrap admin login for tenants that still do not have an admin/owner membership.
WITH tenants_without_admin AS (
  SELECT t.id, t.slug, t.name
  FROM tenants t
  WHERE t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tenant_users tu
      WHERE tu.tenant_id = t.id
        AND tu.status IN ('active', 'invited')
        AND (tu.is_owner = true OR tu.access_level = 'admin' OR tu.user_type = 'admin')
    )
)
INSERT INTO users (
  name,
  display_name,
  nick,
  email,
  password_hash,
  status,
  is_platform_admin,
  email_verified_at,
  preferences,
  metadata
)
SELECT
  'Admin ' || t.name,
  'Admin ' || t.name,
  'Admin',
  'admin@' || t.slug || '.local',
  crypt('123456', gen_salt('bf')),
  'active',
  false,
  now(),
  '{}'::jsonb,
  jsonb_build_object('bootstrap', 'migration_0007')
FROM tenants_without_admin t
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    status = 'active',
    deleted_at = NULL,
    updated_at = now();

WITH tenants_without_admin AS (
  SELECT t.id, t.slug
  FROM tenants t
  WHERE t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tenant_users tu
      WHERE tu.tenant_id = t.id
        AND tu.status IN ('active', 'invited')
        AND (tu.is_owner = true OR tu.access_level = 'admin' OR tu.user_type = 'admin')
    )
)
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
  true,
  now(),
  'admin',
  'admin',
  jsonb_build_object('bootstrap', 'migration_0007')
FROM tenants_without_admin t
JOIN users u ON u.email = 'admin@' || t.slug || '.local'
ON CONFLICT (tenant_id, user_id)
DO UPDATE SET
  status = 'active',
  is_owner = true,
  access_level = 'admin',
  user_type = 'admin',
  joined_at = COALESCE(tenant_users.joined_at, now()),
  updated_at = now();

-- Ensure admin/owner memberships have core_panel assignment active.
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
  '{}'::jsonb
FROM tenant_users tu
JOIN tenants t ON t.id = tu.tenant_id
JOIN modules m ON m.code = 'core_panel'
WHERE t.deleted_at IS NULL
  AND tu.status IN ('active', 'invited')
  AND (tu.is_owner = true OR tu.access_level = 'admin' OR tu.user_type = 'admin')
ON CONFLICT (tenant_user_id, module_id)
DO UPDATE SET
  status = 'active',
  revoked_at = NULL,
  granted_at = now(),
  updated_at = now();
