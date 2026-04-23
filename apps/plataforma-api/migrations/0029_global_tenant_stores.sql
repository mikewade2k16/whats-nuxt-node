SET search_path TO platform_core, public;

CREATE TABLE IF NOT EXISTS tenant_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  city varchar(120) NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_stores_tenant_id
  ON tenant_stores(tenant_id, sort_order, created_at);

INSERT INTO tenant_stores (
  id,
  tenant_id,
  code,
  name,
  city,
  is_active,
  sort_order,
  metadata,
  created_at,
  updated_at
)
SELECT
  sc.id,
  sc.tenant_id,
  LEFT(
    COALESCE(
      NULLIF(
        UPPER(REGEXP_REPLACE(TRIM(sc.store_name), '[^[:alnum:]]+', '-', 'g')),
        ''
      ),
      'STORE-' || COALESCE(sc.sort_order, 0)::text
    ),
    40
  ),
  sc.store_name,
  COALESCE(sc.metadata ->> 'city', ''),
  true,
  COALESCE(sc.sort_order, 0),
  COALESCE(sc.metadata, '{}'::jsonb),
  sc.created_at,
  sc.updated_at
FROM tenant_store_charges sc
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

ALTER TABLE tenant_store_charges
  ADD COLUMN IF NOT EXISTS store_id uuid;

UPDATE tenant_store_charges
SET store_id = id
WHERE store_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_store_charges_store_id_fkey'
  ) THEN
    ALTER TABLE tenant_store_charges
      ADD CONSTRAINT tenant_store_charges_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES tenant_stores(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_store_charges_store_id
  ON tenant_store_charges(store_id)
  WHERE store_id IS NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'tenant_users'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'tenant_users'::regclass
          AND attname = 'store_id'
          AND NOT attisdropped
      )
    ];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tenant_users DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES tenant_stores(id) ON DELETE SET NULL;
