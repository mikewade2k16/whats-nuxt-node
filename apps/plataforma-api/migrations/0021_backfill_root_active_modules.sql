SET search_path TO platform_core, public;

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
  jsonb_build_object('bootstrap', 'migration_0021')
FROM tenants t
JOIN modules m ON m.is_active = true
WHERE t.slug = 'root'
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET status = 'active',
    source = EXCLUDED.source,
    activated_at = COALESCE(tenant_modules.activated_at, now()),
    deactivated_at = NULL,
    metadata = tenant_modules.metadata || EXCLUDED.metadata,
    updated_at = now();

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
  jsonb_build_object('bootstrap', 'migration_0021')
FROM root_ctx rc
JOIN modules m ON m.is_active = true
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    granted_by_user_id = EXCLUDED.granted_by_user_id,
    granted_at = now(),
    metadata = tenant_user_modules.metadata || EXCLUDED.metadata,
    updated_at = now();