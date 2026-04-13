SET search_path TO platform_core, public;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS require_user_store_link boolean NOT NULL DEFAULT true;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS require_user_registration boolean NOT NULL DEFAULT true;

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS business_role varchar(30) NOT NULL DEFAULT 'marketing';

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES tenant_store_charges(id) ON DELETE SET NULL;

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS registration_number varchar(60);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenant_users_business_role'
  ) THEN
    ALTER TABLE tenant_users DROP CONSTRAINT chk_tenant_users_business_role;
  END IF;

  ALTER TABLE tenant_users
    ADD CONSTRAINT chk_tenant_users_business_role
    CHECK (business_role IN (
      'consultant',
      'store_manager',
      'marketing',
      'finance',
      'general_manager',
      'owner',
      'viewer',
      'system_admin'
    ));
END
$$;

CREATE INDEX IF NOT EXISTS idx_tenant_users_store_id
  ON tenant_users(tenant_id, store_id);

UPDATE tenant_users tu
SET business_role = CASE
  WHEN u.is_platform_admin THEN 'system_admin'
  WHEN tu.is_owner THEN 'owner'
  WHEN COALESCE(tu.access_level, '') = 'admin' AND COALESCE(tu.user_type, '') = 'admin' THEN 'owner'
  WHEN COALESCE(tu.access_level, '') = 'manager' THEN 'general_manager'
  WHEN COALESCE(tu.access_level, '') = 'finance' THEN 'finance'
  WHEN COALESCE(tu.access_level, '') = 'viewer' THEN 'viewer'
  ELSE 'marketing'
END
FROM users u
WHERE u.id = tu.user_id;
