SET search_path TO platform_core, public;

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
  FROM platform_core.tenant_stores
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
  UPDATE platform_core.tenant_store_charges
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