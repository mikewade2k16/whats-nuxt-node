SET search_path TO platform_core, public;

CREATE SEQUENCE IF NOT EXISTS tenants_legacy_id_seq;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legacy_id integer;
ALTER TABLE tenants ALTER COLUMN legacy_id SET DEFAULT nextval('tenants_legacy_id_seq');
UPDATE tenants
SET legacy_id = nextval('tenants_legacy_id_seq')
WHERE legacy_id IS NULL;
SELECT setval('tenants_legacy_id_seq', COALESCE((SELECT MAX(legacy_id) FROM tenants), 1), true);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_legacy_id ON tenants(legacy_id);

CREATE SEQUENCE IF NOT EXISTS users_legacy_id_seq;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_id integer;
ALTER TABLE users ALTER COLUMN legacy_id SET DEFAULT nextval('users_legacy_id_seq');
UPDATE users
SET legacy_id = nextval('users_legacy_id_seq')
WHERE legacy_id IS NULL;
SELECT setval('users_legacy_id_seq', COALESCE((SELECT MAX(legacy_id) FROM users), 1), true);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_legacy_id ON users(legacy_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url varchar(500);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_site varchar(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_address varchar(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_key varchar(160);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_payment_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS user_count integer NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS user_nicks text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS project_count integer NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS project_segments text[] NOT NULL DEFAULT '{}'::text[];

UPDATE tenants
SET billing_mode = COALESCE(NULLIF(billing_mode, ''), 'single');

ALTER TABLE users ADD COLUMN IF NOT EXISTS nick varchar(80);

ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS access_level varchar(20) NOT NULL DEFAULT 'marketing';
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS user_type varchar(20) NOT NULL DEFAULT 'client';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenant_users_access_level'
  ) THEN
    ALTER TABLE tenant_users
      ADD CONSTRAINT chk_tenant_users_access_level
      CHECK (access_level IN ('admin', 'manager', 'marketing', 'finance'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenant_users_user_type'
  ) THEN
    ALTER TABLE tenant_users
      ADD CONSTRAINT chk_tenant_users_user_type
      CHECK (user_type IN ('admin', 'client'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenant_store_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_name varchar(120) NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_store_charges_tenant_id
  ON tenant_store_charges(tenant_id);

ALTER TABLE modules ADD COLUMN IF NOT EXISTS base_price_monthly numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS base_price_yearly numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS billing_currency varchar(8) NOT NULL DEFAULT 'BRL';

UPDATE modules
SET base_price_monthly = 200
WHERE code = 'atendimento'
  AND base_price_monthly = 0;

CREATE TABLE IF NOT EXISTS tenant_module_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  pricing_mode varchar(20) NOT NULL DEFAULT 'fixed',
  fixed_price_monthly numeric(12,2),
  fixed_price_yearly numeric(12,2),
  discount_percent numeric(5,2),
  discount_amount numeric(12,2),
  notes varchar(255),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_id),
  CHECK (pricing_mode IN ('fixed', 'percent_discount', 'amount_discount')),
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  CHECK (discount_amount IS NULL OR discount_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_pricing_tenant_module
  ON tenant_module_pricing(tenant_id, module_id);

UPDATE users
SET is_platform_admin = true,
    updated_at = now()
WHERE email::text = 'admin@demo.local';
