SET search_path TO platform_core, public;

DO $$
DECLARE
  charge_record record;
  resolved_store_id uuid;
  resolved_code varchar(40);
BEGIN
  FOR charge_record IN
    SELECT
      sc.id,
      sc.tenant_id,
      sc.store_id,
      sc.store_name,
      sc.sort_order,
      sc.metadata,
      sc.created_at,
      sc.updated_at
    FROM tenant_store_charges sc
    LEFT JOIN tenant_stores valid_store
      ON valid_store.id = sc.store_id
     AND valid_store.tenant_id = sc.tenant_id
    WHERE sc.store_id IS NULL
       OR valid_store.id IS NULL
  LOOP
    resolved_store_id := NULL;

    SELECT ts.id
    INTO resolved_store_id
    FROM tenant_stores ts
    WHERE ts.tenant_id = charge_record.tenant_id
      AND ts.name = charge_record.store_name
    ORDER BY ts.sort_order ASC, ts.created_at ASC
    LIMIT 1;

    IF resolved_store_id IS NULL THEN
      resolved_store_id := COALESCE(charge_record.store_id, charge_record.id);

      IF EXISTS (
        SELECT 1
        FROM tenant_stores ts
        WHERE ts.id = resolved_store_id
          AND ts.tenant_id <> charge_record.tenant_id
      ) THEN
        IF EXISTS (
          SELECT 1
          FROM tenant_stores ts
          WHERE ts.id = charge_record.id
            AND ts.tenant_id = charge_record.tenant_id
        ) THEN
          resolved_store_id := charge_record.id;
        ELSE
          resolved_store_id := gen_random_uuid();
        END IF;
      END IF;

      resolved_code := LEFT(
        COALESCE(
          NULLIF(
            UPPER(REGEXP_REPLACE(TRIM(COALESCE(charge_record.store_name, '')), '[^[:alnum:]]+', '-', 'g')),
            ''
          ),
          'STORE-' || COALESCE(charge_record.sort_order, 0)::text
        ),
        40
      );

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
      VALUES (
        resolved_store_id,
        charge_record.tenant_id,
        resolved_code,
        COALESCE(NULLIF(charge_record.store_name, ''), 'Loja'),
        COALESCE(charge_record.metadata ->> 'city', ''),
        true,
        COALESCE(charge_record.sort_order, 0),
        COALESCE(charge_record.metadata, '{}'::jsonb),
        charge_record.created_at,
        charge_record.updated_at
      )
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          name = EXCLUDED.name,
          city = EXCLUDED.city,
          is_active = true,
          sort_order = EXCLUDED.sort_order,
          metadata = EXCLUDED.metadata,
          updated_at = now();
    END IF;

    UPDATE tenant_store_charges
    SET store_id = resolved_store_id
    WHERE id = charge_record.id;
  END LOOP;
END
$$;

UPDATE tenant_store_charges sc
SET tenant_id = ts.tenant_id,
    store_name = ts.name,
    sort_order = ts.sort_order,
    updated_at = now()
FROM tenant_stores ts
WHERE ts.id = sc.store_id
  AND (
    sc.tenant_id IS DISTINCT FROM ts.tenant_id
    OR sc.store_name IS DISTINCT FROM ts.name
    OR sc.sort_order IS DISTINCT FROM ts.sort_order
  );

ALTER TABLE tenant_store_charges
  ALTER COLUMN store_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_stores_tenant_id_id
  ON tenant_stores(tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_store_charges_tenant_store_fkey'
  ) THEN
    ALTER TABLE tenant_store_charges
      ADD CONSTRAINT tenant_store_charges_tenant_store_fkey
      FOREIGN KEY (tenant_id, store_id) REFERENCES tenant_stores(tenant_id, id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION sync_tenant_store_charge_shadow_fields()
RETURNS trigger AS $$
DECLARE
  store_record record;
BEGIN
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'tenant_store_charges.store_id is required';
  END IF;

  SELECT tenant_id, name, sort_order
  INTO store_record
  FROM tenant_stores
  WHERE id = NEW.store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_store_charges.store_id % does not reference platform_core.tenant_stores', NEW.store_id;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM store_record.tenant_id THEN
    RAISE EXCEPTION 'tenant_store_charges tenant/store mismatch for store_id %', NEW.store_id;
  END IF;

  NEW.store_name = store_record.name;
  NEW.sort_order = store_record.sort_order;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_tenant_store_charge_directory_updates()
RETURNS trigger AS $$
BEGIN
  UPDATE tenant_store_charges
  SET tenant_id = NEW.tenant_id,
      store_name = NEW.name,
      sort_order = NEW.sort_order,
      updated_at = now()
  WHERE store_id = NEW.id
    AND (
      tenant_id IS DISTINCT FROM NEW.tenant_id
      OR store_name IS DISTINCT FROM NEW.name
      OR sort_order IS DISTINCT FROM NEW.sort_order
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_store_charges_shadow_sync ON tenant_store_charges;
CREATE TRIGGER trg_tenant_store_charges_shadow_sync
BEFORE INSERT OR UPDATE OF tenant_id, store_id, store_name, sort_order
ON tenant_store_charges
FOR EACH ROW
EXECUTE FUNCTION sync_tenant_store_charge_shadow_fields();

DROP TRIGGER IF EXISTS trg_tenant_stores_charge_shadow_sync ON tenant_stores;
CREATE TRIGGER trg_tenant_stores_charge_shadow_sync
AFTER UPDATE OF tenant_id, name, sort_order
ON tenant_stores
FOR EACH ROW
EXECUTE FUNCTION sync_tenant_store_charge_directory_updates();

COMMENT ON TABLE tenant_store_charges IS 'Overlay financeiro por loja. tenant_stores permanece como diretorio canonico do shell.';
COMMENT ON COLUMN tenant_store_charges.store_id IS 'Referencia obrigatoria para platform_core.tenant_stores(id).';
COMMENT ON COLUMN tenant_store_charges.store_name IS 'Espelho de compatibilidade de tenant_stores.name; nao usar como fonte de verdade.';
COMMENT ON COLUMN tenant_store_charges.sort_order IS 'Espelho de compatibilidade de tenant_stores.sort_order; nao usar como fonte de verdade.';