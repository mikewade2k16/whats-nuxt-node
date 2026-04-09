SET search_path TO platform_core, public;

-- Ensure root user always exists as active platform admin.
UPDATE users
SET is_platform_admin = true,
    status = 'active',
    deleted_at = NULL,
    updated_at = now()
WHERE email::text = 'root@core.local';

-- Ensure dedicated root tenant exists and is active.
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
  'root',
  'Root',
  'active',
  'root@core.local',
  'single',
  0,
  10,
  0,
  '{}'::text[],
  '{}'::text[],
  false,
  '',
  '{}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET name = 'Root',
    status = 'active',
    contact_email = 'root@core.local',
    billing_mode = COALESCE(NULLIF(tenants.billing_mode, ''), 'single'),
    user_count = CASE
      WHEN COALESCE(tenants.user_count, 0) < 10 THEN 10
      ELSE tenants.user_count
    END,
    deleted_at = NULL,
    updated_at = now();

-- Ensure root user belongs to Root tenant as owner/admin.
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
  jsonb_build_object('bootstrap', 'migration_0009')
FROM tenants t
JOIN users u ON u.email = 'root@core.local'
WHERE t.slug = 'root'
ON CONFLICT (tenant_id, user_id)
DO UPDATE SET
  status = 'active',
  is_owner = true,
  access_level = 'admin',
  user_type = 'admin',
  joined_at = COALESCE(tenant_users.joined_at, now()),
  updated_at = now();

-- Keep root user scoped to Root tenant for deterministic UI context.
WITH root_ctx AS (
  SELECT t.id AS tenant_id, u.id AS user_id
  FROM tenants t
  JOIN users u ON u.email = 'root@core.local'
  WHERE t.slug = 'root'
)
UPDATE tenant_users tu
SET status = 'suspended',
    is_owner = false,
    updated_at = now()
FROM root_ctx rc
WHERE tu.user_id = rc.user_id
  AND tu.tenant_id <> rc.tenant_id
  AND tu.status IN ('active', 'invited');

-- Ensure all active modules are available in Root tenant.
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
JOIN modules m ON m.is_active = true
WHERE t.slug = 'root'
ON CONFLICT (tenant_id, module_id)
DO UPDATE SET
  status = 'active',
  source = 'custom',
  activated_at = now(),
  deactivated_at = NULL,
  updated_at = now();

-- Ensure root tenant-user has all active modules granted.
WITH root_ctx AS (
  SELECT
    t.id AS tenant_id,
    u.id AS user_id,
    tu.id AS tenant_user_id
  FROM tenants t
  JOIN users u ON u.email = 'root@core.local'
  JOIN tenant_users tu ON tu.tenant_id = t.id AND tu.user_id = u.id
  WHERE t.slug = 'root'
  LIMIT 1
)
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
  rc.tenant_id,
  rc.tenant_user_id,
  m.id,
  'active',
  rc.user_id,
  now(),
  '{}'::jsonb
FROM root_ctx rc
JOIN modules m ON m.is_active = true
ON CONFLICT (tenant_user_id, module_id)
DO UPDATE SET
  status = 'active',
  revoked_at = NULL,
  granted_by_user_id = EXCLUDED.granted_by_user_id,
  granted_at = now(),
  updated_at = now();
