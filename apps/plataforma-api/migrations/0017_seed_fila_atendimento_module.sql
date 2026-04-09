SET search_path TO platform_core, public;

INSERT INTO modules (code, name, description, is_core)
VALUES (
  'fila-atendimento',
  'Fila de Atendimento',
  'Modulo plugavel de fila, operacao, relatorios e analytics de loja',
  false
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_core = EXCLUDED.is_core,
    is_active = true,
    updated_at = now();

INSERT INTO plan_modules (plan_id, module_id, enabled)
SELECT p.id, m.id, true
FROM plans p
JOIN modules m ON m.code = 'fila-atendimento'
WHERE p.code IN ('starter', 'pro')
ON CONFLICT (plan_id, module_id) DO UPDATE
SET enabled = EXCLUDED.enabled;

INSERT INTO plan_module_limits (plan_id, module_id, limit_key, limit_value_int, is_unlimited)
SELECT
  p.id,
  m.id,
  'users',
  CASE p.code
    WHEN 'starter' THEN 5
    WHEN 'pro' THEN 15
  END,
  false
FROM plans p
JOIN modules m ON m.code = 'fila-atendimento'
WHERE p.code IN ('starter', 'pro')
ON CONFLICT (plan_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited,
    updated_at = now();

INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at, metadata)
SELECT
  t.id,
  m.id,
  'active',
  'plan',
  now(),
  NULL,
  jsonb_build_object('bootstrap', 'migration_0017')
FROM tenants t
JOIN modules m ON m.code = 'fila-atendimento'
WHERE t.slug IN ('demo-core', 'acme-core')
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET status = 'active',
    source = EXCLUDED.source,
    activated_at = now(),
    deactivated_at = NULL,
    metadata = tenant_modules.metadata || EXCLUDED.metadata,
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
  'users',
  CASE t.slug
    WHEN 'demo-core' THEN 5
    WHEN 'acme-core' THEN 10
  END,
  false,
  'migration_0017',
  'Default users limit for fila-atendimento bootstrap',
  NULL,
  jsonb_build_object('bootstrap', 'migration_0017')
FROM tenant_modules tm
JOIN tenants t ON t.id = tm.tenant_id
JOIN modules m ON m.id = tm.module_id
WHERE m.code = 'fila-atendimento'
  AND t.slug IN ('demo-core', 'acme-core')
ON CONFLICT (tenant_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited,
    source = EXCLUDED.source,
    notes = EXCLUDED.notes,
    metadata = tenant_module_limits.metadata || EXCLUDED.metadata,
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
  jsonb_build_object('bootstrap', 'migration_0017')
FROM tenant_users tu
JOIN tenants t ON t.id = tu.tenant_id
JOIN users u ON u.id = tu.user_id
JOIN modules m ON m.code = 'fila-atendimento'
WHERE
  (t.slug = 'demo-core' AND u.email IN ('admin@demo-core.local', 'agent@demo-core.local'))
  OR
  (t.slug = 'acme-core' AND u.email IN ('admin@acme.local', 'supervisor@acme.local', 'agente@acme.local'))
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    granted_at = now(),
    metadata = tenant_user_modules.metadata || EXCLUDED.metadata,
    updated_at = now();
