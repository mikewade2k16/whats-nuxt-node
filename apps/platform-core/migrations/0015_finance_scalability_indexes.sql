SET search_path TO platform_core, public;

CREATE INDEX IF NOT EXISTS idx_finance_categories_config_position
  ON finance_categories (config_id, position, id);

CREATE INDEX IF NOT EXISTS idx_finance_fixed_accounts_config_position
  ON finance_fixed_accounts (config_id, position, id);

CREATE INDEX IF NOT EXISTS idx_finance_fixed_account_members_account_position
  ON finance_fixed_account_members (fixed_account_id, position, id);

CREATE INDEX IF NOT EXISTS idx_finance_lines_sheet_kind_position
  ON finance_lines (sheet_id, kind, position, id);
