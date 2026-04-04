SET search_path TO platform_core, public;

-- Adiciona suporte ao nivel 'viewer' no access_level de tenant_users.
-- O frontend define UserLevel como 'admin'|'manager'|'marketing'|'finance'|'viewer',
-- mas o constraint original nao incluia 'viewer', causando fallback silencioso para 'marketing'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenant_users_access_level'
  ) THEN
    ALTER TABLE tenant_users DROP CONSTRAINT chk_tenant_users_access_level;
  END IF;

  ALTER TABLE tenant_users
    ADD CONSTRAINT chk_tenant_users_access_level
    CHECK (access_level IN ('admin', 'manager', 'marketing', 'finance', 'viewer'));
END
$$;
