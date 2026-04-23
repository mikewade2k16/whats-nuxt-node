SET search_path TO platform_core, public;

CREATE SCHEMA IF NOT EXISTS finance;

ALTER TABLE IF EXISTS platform_core.finance_line_adjustments SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_lines SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_sheets SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_recurring_entries SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_fixed_account_members SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_fixed_accounts SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_categories SET SCHEMA finance;
ALTER TABLE IF EXISTS platform_core.finance_configs SET SCHEMA finance;

ALTER SEQUENCE IF EXISTS platform_core.finance_sheets_legacy_id_seq SET SCHEMA finance;

ALTER TABLE IF EXISTS finance.finance_sheets
  ALTER COLUMN legacy_id SET DEFAULT nextval('finance.finance_sheets_legacy_id_seq'::regclass);