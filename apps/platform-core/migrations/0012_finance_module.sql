SET search_path TO platform_core, public;

-- Configuracao global de financas por tenant: categorias, contas fixas, entradas recorrentes

CREATE TABLE IF NOT EXISTS finance_configs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id   UUID    NOT NULL REFERENCES finance_configs(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT '',
  kind        TEXT    NOT NULL DEFAULT 'ambas' CHECK (kind IN ('entrada', 'saida', 'ambas')),
  description TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_fixed_accounts (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id      UUID           NOT NULL REFERENCES finance_configs(id) ON DELETE CASCADE,
  name           TEXT           NOT NULL DEFAULT '',
  kind           TEXT           NOT NULL DEFAULT 'saida' CHECK (kind IN ('entrada', 'saida', 'ambas')),
  category_id    UUID           REFERENCES finance_categories(id) ON DELETE SET NULL,
  default_amount NUMERIC(14,2)  NOT NULL DEFAULT 0,
  notes          TEXT           NOT NULL DEFAULT '',
  position       INTEGER        NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_fixed_account_members (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_account_id UUID          NOT NULL REFERENCES finance_fixed_accounts(id) ON DELETE CASCADE,
  name             TEXT          NOT NULL DEFAULT '',
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  position         INTEGER       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_recurring_entries (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id         UUID          NOT NULL REFERENCES finance_configs(id) ON DELETE CASCADE,
  source_tenant_id  UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT          NOT NULL DEFAULT '',
  UNIQUE (config_id, source_tenant_id)
);

-- Planilhas financeiras mensais

CREATE SEQUENCE IF NOT EXISTS finance_sheets_legacy_id_seq START 1 INCREMENT 1;

CREATE TABLE IF NOT EXISTS finance_sheets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id  INTEGER     NOT NULL DEFAULT nextval('finance_sheets_legacy_id_seq') UNIQUE,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT '',
  period     TEXT        NOT NULL DEFAULT '',
  status     TEXT        NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'conferencia', 'fechada')),
  notes      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_sheets_tenant_period ON finance_sheets (tenant_id, period);

-- Linhas de entrada e saida de cada planilha

CREATE TABLE IF NOT EXISTS finance_lines (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id         UUID          NOT NULL REFERENCES finance_sheets(id) ON DELETE CASCADE,
  kind             TEXT          NOT NULL CHECK (kind IN ('entrada', 'saida')),
  description      TEXT          NOT NULL DEFAULT '',
  category         TEXT          NOT NULL DEFAULT '',
  effective        BOOLEAN       NOT NULL DEFAULT false,
  effective_date   TEXT          NOT NULL DEFAULT '',
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  fixed_account_id UUID,          -- soft reference to finance_fixed_accounts (no FK to avoid deadlocks with concurrent sheet+config updates)
  details          TEXT          NOT NULL DEFAULT '',
  position         INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_finance_lines_sheet_id ON finance_lines (sheet_id);

-- Ajustes de cada linha (podem ser positivos ou negativos)

CREATE TABLE IF NOT EXISTS finance_line_adjustments (
  id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id  UUID          NOT NULL REFERENCES finance_lines(id) ON DELETE CASCADE,
  amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  note     TEXT          NOT NULL DEFAULT '',
  date     TEXT          NOT NULL DEFAULT '',
  position INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_finance_line_adjustments_line_id ON finance_line_adjustments (line_id);
