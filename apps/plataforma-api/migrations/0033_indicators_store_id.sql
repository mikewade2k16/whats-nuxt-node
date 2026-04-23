SET search_path TO indicators, platform_core, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_profile_store_overrides'
      AND column_name = 'unit_external_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_profile_store_overrides'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE indicators.indicator_profile_store_overrides
      RENAME COLUMN unit_external_id TO store_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_profile_store_overrides'
      AND column_name = 'store_id'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE indicators.indicator_profile_store_overrides
      ALTER COLUMN store_id TYPE uuid USING NULLIF(BTRIM(store_id::text), '')::uuid;
  END IF;
END $$;

ALTER TABLE indicators.indicator_profile_store_overrides
  DROP COLUMN IF EXISTS unit_code,
  DROP COLUMN IF EXISTS unit_name;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_profile_store_overrides'
      AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'indicators.indicator_profile_store_overrides'::regclass
      AND conname = 'indicator_profile_store_overrides_store_id_fkey'
  ) THEN
    ALTER TABLE indicators.indicator_profile_store_overrides
      ADD CONSTRAINT indicator_profile_store_overrides_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES platform_core.tenant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN indicators.indicator_profile_store_overrides.store_id IS 'Canonical store id from platform_core.tenant_stores.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_target_items'
      AND column_name = 'unit_external_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_target_items'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE indicators.indicator_target_items
      RENAME COLUMN unit_external_id TO store_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_target_items'
      AND column_name = 'store_id'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE indicators.indicator_target_items
      ALTER COLUMN store_id TYPE uuid USING NULLIF(BTRIM(store_id::text), '')::uuid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_target_items'
      AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'indicators.indicator_target_items'::regclass
      AND conname = 'indicator_target_items_store_id_fkey'
  ) THEN
    ALTER TABLE indicators.indicator_target_items
      ADD CONSTRAINT indicator_target_items_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES platform_core.tenant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN indicators.indicator_target_items.store_id IS 'Canonical store id from platform_core.tenant_stores.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'unit_external_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE indicators.indicator_evaluations
      RENAME COLUMN unit_external_id TO store_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'store_id'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE indicators.indicator_evaluations
      ALTER COLUMN store_id TYPE uuid USING NULLIF(BTRIM(store_id::text), '')::uuid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'store_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'unit_code'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'unit_name'
  ) THEN
    UPDATE indicators.indicator_evaluations e
    SET
      unit_code = COALESCE(NULLIF(e.unit_code, ''), ts.code),
      unit_name = COALESCE(NULLIF(e.unit_name, ''), ts.name)
    FROM platform_core.tenant_stores ts
    WHERE e.store_id = ts.id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_evaluations'
      AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'indicators.indicator_evaluations'::regclass
      AND conname = 'indicator_evaluations_store_id_fkey'
  ) THEN
    ALTER TABLE indicators.indicator_evaluations
      ADD CONSTRAINT indicator_evaluations_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES platform_core.tenant_stores(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN indicators.indicator_evaluations.store_id IS 'Canonical store id from platform_core.tenant_stores.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_metric_snapshots'
      AND column_name = 'unit_external_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_metric_snapshots'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE indicators.indicator_metric_snapshots
      RENAME COLUMN unit_external_id TO store_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_metric_snapshots'
      AND column_name = 'store_id'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE indicators.indicator_metric_snapshots
      ALTER COLUMN store_id TYPE uuid USING NULLIF(BTRIM(store_id::text), '')::uuid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'indicators'
      AND table_name = 'indicator_metric_snapshots'
      AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'indicators.indicator_metric_snapshots'::regclass
      AND conname = 'indicator_metric_snapshots_store_id_fkey'
  ) THEN
    ALTER TABLE indicators.indicator_metric_snapshots
      ADD CONSTRAINT indicator_metric_snapshots_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES platform_core.tenant_stores(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN indicators.indicator_metric_snapshots.store_id IS 'Canonical store id from platform_core.tenant_stores.';
