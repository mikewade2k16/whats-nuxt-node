-- Ajusta defaults do modulo de atendimento para a fase multi-tenant.
-- Regras:
--   - atendimento.users = 3 por padrao
--   - atendimento.instances = 1 por padrao
--   - admins/owners do tenant recebem acesso inicial ao modulo atendimento

UPDATE tenant_module_limits tml
SET limit_value_int = 3,
    is_unlimited = false,
    source = 'migration_0010',
    notes = 'Default atendimento users limit aligned to multi-tenant phase',
    updated_at = now()
FROM modules m
WHERE m.id = tml.module_id
  AND m.code = 'atendimento'
  AND tml.limit_key = 'users'
  AND tml.source IN ('bootstrap', 'migration_0007')
  AND (tml.limit_value_int IS NULL OR tml.limit_value_int <= 0 OR tml.limit_value_int = 10);

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
  'instances',
  1,
  false,
  'migration_0010',
  'Default atendimento instances limit aligned to multi-tenant phase',
  NULL,
  '{}'::jsonb
FROM tenant_modules tm
JOIN modules m ON m.id = tm.module_id
JOIN tenants t ON t.id = tm.tenant_id
WHERE t.deleted_at IS NULL
  AND tm.status = 'active'
  AND m.code = 'atendimento'
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
  jsonb_build_object('bootstrap', 'migration_0010')
FROM tenant_users tu
JOIN tenants t ON t.id = tu.tenant_id
JOIN tenant_modules tm
  ON tm.tenant_id = tu.tenant_id
 AND tm.status = 'active'
JOIN modules m
  ON m.id = tm.module_id
 AND m.code = 'atendimento'
WHERE t.deleted_at IS NULL
  AND tu.status IN ('active', 'invited')
  AND (
    tu.is_owner = true
    OR tu.access_level = 'admin'
    OR tu.user_type = 'admin'
  )
ON CONFLICT (tenant_user_id, module_id)
DO UPDATE SET
  status = 'active',
  revoked_at = NULL,
  granted_at = now(),
  updated_at = now();
