SET search_path TO platform_core, public;

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
    CHECK (access_level IN ('admin', 'manager', 'marketing', 'finance', 'viewer', 'consultant'));
END
$$;

UPDATE tenant_users
SET access_level = 'consultant'
WHERE business_role = 'consultant'
  AND access_level = 'viewer';
