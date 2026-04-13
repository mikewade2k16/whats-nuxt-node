CREATE SCHEMA IF NOT EXISTS indicators;
SET search_path TO indicators, platform_core, public;

CREATE TABLE IF NOT EXISTS indicator_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'draft',
  taxonomy_version integer NOT NULL DEFAULT 1,
  is_system boolean NOT NULL DEFAULT false,
  default_scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'active', 'archived')),
  CHECK (taxonomy_version > 0),
  CHECK (default_scope_mode IN ('client_global', 'per_store'))
);

CREATE TABLE IF NOT EXISTS indicator_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES indicator_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number),
  CHECK (version_number > 0),
  CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_template_versions_published
  ON indicator_template_versions(template_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS indicator_template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES indicator_template_versions(id) ON DELETE CASCADE,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  weight numeric(7,4) NOT NULL DEFAULT 1,
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_version_id, code),
  CHECK (weight >= 0),
  CHECK (scope_mode IN ('client_global', 'per_store'))
);

CREATE INDEX IF NOT EXISTS idx_indicator_template_categories_version_sort
  ON indicator_template_categories(template_version_id, sort_order, code);

CREATE TABLE IF NOT EXISTS indicator_template_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES indicator_template_versions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES indicator_template_categories(id) ON DELETE CASCADE,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  indicator_kind varchar(30) NOT NULL DEFAULT 'native',
  source_kind varchar(30) NOT NULL DEFAULT 'manual',
  source_module varchar(80),
  source_metric_key varchar(120),
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  aggregation_mode varchar(30) NOT NULL DEFAULT 'weighted_average',
  value_type varchar(30) NOT NULL DEFAULT 'score',
  evidence_policy varchar(30) NOT NULL DEFAULT 'optional',
  weight numeric(7,4) NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT true,
  supports_store_breakdown boolean NOT NULL DEFAULT false,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_version_id, code),
  CHECK (indicator_kind IN ('native', 'derived', 'composite')),
  CHECK (source_kind IN ('manual', 'provider', 'hybrid')),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (aggregation_mode IN ('weighted_average', 'sum', 'average', 'max', 'min', 'manual')),
  CHECK (value_type IN ('score', 'percent', 'currency', 'count', 'boolean', 'composite')),
  CHECK (evidence_policy IN ('none', 'optional', 'required')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_template_indicators_version_category
  ON indicator_template_indicators(template_version_id, category_id, code);

CREATE INDEX IF NOT EXISTS idx_indicator_template_indicators_source_module
  ON indicator_template_indicators(source_module, source_metric_key);

CREATE TABLE IF NOT EXISTS indicator_template_indicator_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_indicator_id uuid NOT NULL REFERENCES indicator_template_indicators(id) ON DELETE CASCADE,
  code varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  description text,
  input_type varchar(30) NOT NULL DEFAULT 'score',
  evidence_policy varchar(30) NOT NULL DEFAULT 'inherit',
  source_metric_key varchar(120),
  select_options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight numeric(7,4) NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_indicator_id, code),
  CHECK (input_type IN ('boolean', 'score', 'percent', 'currency', 'count', 'text', 'image', 'image_required', 'select', 'provider_metric')),
  CHECK (evidence_policy IN ('inherit', 'none', 'optional', 'required')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_template_indicator_items_indicator
  ON indicator_template_indicator_items(template_indicator_id, code);

CREATE TABLE IF NOT EXISTS indicator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid REFERENCES indicator_templates(id) ON DELETE SET NULL,
  template_version_id uuid REFERENCES indicator_template_versions(id) ON DELETE SET NULL,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'draft',
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  store_breakdown_enabled boolean NOT NULL DEFAULT false,
  provider_sync_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('draft', 'active', 'archived')),
  CHECK (scope_mode IN ('client_global', 'per_store'))
);

CREATE INDEX IF NOT EXISTS idx_indicator_profiles_tenant_status
  ON indicator_profiles(tenant_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_profiles_tenant_active
  ON indicator_profiles(tenant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS indicator_profile_indicator_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES indicator_profiles(id) ON DELETE CASCADE,
  template_indicator_id uuid REFERENCES indicator_template_indicators(id) ON DELETE SET NULL,
  category_code varchar(80) NOT NULL,
  category_name varchar(160) NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  indicator_kind varchar(30) NOT NULL DEFAULT 'native',
  source_kind varchar(30) NOT NULL DEFAULT 'manual',
  source_module varchar(80),
  source_metric_key varchar(120),
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  aggregation_mode varchar(30) NOT NULL DEFAULT 'weighted_average',
  value_type varchar(30) NOT NULL DEFAULT 'score',
  evidence_policy varchar(30) NOT NULL DEFAULT 'optional',
  weight numeric(7,4) NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true,
  is_custom boolean NOT NULL DEFAULT false,
  supports_store_breakdown boolean NOT NULL DEFAULT false,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, code),
  CHECK (indicator_kind IN ('native', 'derived', 'composite')),
  CHECK (source_kind IN ('manual', 'provider', 'hybrid')),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (aggregation_mode IN ('weighted_average', 'sum', 'average', 'max', 'min', 'manual')),
  CHECK (value_type IN ('score', 'percent', 'currency', 'count', 'boolean', 'composite')),
  CHECK (evidence_policy IN ('none', 'optional', 'required')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_profile_overrides_profile_category
  ON indicator_profile_indicator_overrides(profile_id, category_code, is_enabled, code);

CREATE INDEX IF NOT EXISTS idx_indicator_profile_overrides_source_module
  ON indicator_profile_indicator_overrides(source_module, source_metric_key);

CREATE TABLE IF NOT EXISTS indicator_profile_indicator_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_indicator_id uuid NOT NULL REFERENCES indicator_profile_indicator_overrides(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES indicator_template_indicator_items(id) ON DELETE SET NULL,
  code varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  description text,
  input_type varchar(30) NOT NULL DEFAULT 'score',
  evidence_policy varchar(30) NOT NULL DEFAULT 'inherit',
  source_metric_key varchar(120),
  select_options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight numeric(7,4) NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_indicator_id, code),
  CHECK (input_type IN ('boolean', 'score', 'percent', 'currency', 'count', 'text', 'image', 'image_required', 'select', 'provider_metric')),
  CHECK (evidence_policy IN ('inherit', 'none', 'optional', 'required')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_profile_indicator_items_indicator
  ON indicator_profile_indicator_items(profile_indicator_id, code);

CREATE TABLE IF NOT EXISTS indicator_profile_store_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES indicator_profiles(id) ON DELETE CASCADE,
  profile_indicator_id uuid NOT NULL REFERENCES indicator_profile_indicator_overrides(id) ON DELETE CASCADE,
  unit_external_id varchar(120) NOT NULL,
  unit_code varchar(80),
  unit_name varchar(160),
  scope_mode varchar(30) NOT NULL DEFAULT 'per_store',
  weight numeric(7,4),
  is_enabled boolean,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_indicator_id, unit_external_id),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (weight IS NULL OR weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_profile_store_overrides_profile_unit
  ON indicator_profile_store_overrides(profile_id, unit_external_id);

CREATE TABLE IF NOT EXISTS indicator_provider_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_scope varchar(30) NOT NULL,
  provider_name varchar(80) NOT NULL,
  source_module varchar(80) NOT NULL,
  metric_key varchar(120) NOT NULL,
  template_indicator_id uuid REFERENCES indicator_template_indicators(id) ON DELETE CASCADE,
  profile_indicator_id uuid REFERENCES indicator_profile_indicator_overrides(id) ON DELETE CASCADE,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (binding_scope = 'template' AND template_indicator_id IS NOT NULL AND profile_indicator_id IS NULL)
    OR
    (binding_scope = 'profile' AND profile_indicator_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_provider_bindings_template
  ON indicator_provider_bindings(provider_name, metric_key, template_indicator_id)
  WHERE template_indicator_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_provider_bindings_profile
  ON indicator_provider_bindings(provider_name, metric_key, profile_indicator_id)
  WHERE profile_indicator_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS indicator_target_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES indicator_profiles(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  period_kind varchar(30) NOT NULL DEFAULT 'monthly',
  starts_at date,
  ends_at date,
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  status varchar(20) NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_kind IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (status IN ('draft', 'active', 'archived')),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_indicator_target_sets_tenant_status
  ON indicator_target_sets(tenant_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS indicator_target_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_set_id uuid NOT NULL REFERENCES indicator_target_sets(id) ON DELETE CASCADE,
  profile_indicator_id uuid REFERENCES indicator_profile_indicator_overrides(id) ON DELETE SET NULL,
  category_code varchar(80),
  unit_external_id varchar(120),
  target_value_numeric numeric(14,4),
  target_value_text varchar(255),
  target_value_json jsonb,
  comparator varchar(20) NOT NULL DEFAULT 'gte',
  weight numeric(7,4) NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (comparator IN ('gte', 'lte', 'eq', 'between')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_target_items_target_indicator
  ON indicator_target_items(target_set_id, profile_indicator_id, unit_external_id);

CREATE TABLE IF NOT EXISTS indicator_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES indicator_profiles(id) ON DELETE RESTRICT,
  target_set_id uuid REFERENCES indicator_target_sets(id) ON DELETE SET NULL,
  evaluator_user_id uuid,
  evaluator_name varchar(160) NOT NULL,
  unit_external_id varchar(120),
  unit_code varchar(80),
  unit_name varchar(160),
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'completed',
  overall_score numeric(8,4),
  total_weight numeric(8,4) NOT NULL DEFAULT 0,
  notes text,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (status IN ('draft', 'completed', 'cancelled')),
  CHECK (total_weight >= 0),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_indicator_evaluations_tenant_period
  ON indicator_evaluations(tenant_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_indicator_evaluations_profile_unit
  ON indicator_evaluations(profile_id, unit_external_id, created_at DESC);

CREATE TABLE IF NOT EXISTS indicator_evaluation_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES indicator_evaluations(id) ON DELETE CASCADE,
  category_code varchar(80) NOT NULL,
  category_name varchar(160) NOT NULL,
  score numeric(8,4),
  weight numeric(7,4) NOT NULL DEFAULT 1,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, category_code),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_evaluation_categories_evaluation
  ON indicator_evaluation_categories(evaluation_id, category_code);

CREATE TABLE IF NOT EXISTS indicator_evaluation_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES indicator_evaluations(id) ON DELETE CASCADE,
  evaluation_category_id uuid REFERENCES indicator_evaluation_categories(id) ON DELETE SET NULL,
  profile_indicator_id uuid REFERENCES indicator_profile_indicator_overrides(id) ON DELETE SET NULL,
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  source_kind varchar(30) NOT NULL,
  source_module varchar(80),
  scope_mode varchar(30) NOT NULL,
  aggregation_mode varchar(30) NOT NULL,
  value_type varchar(30) NOT NULL,
  evidence_policy varchar(30) NOT NULL,
  score numeric(8,4),
  raw_value_numeric numeric(14,4),
  weight numeric(7,4) NOT NULL DEFAULT 1,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, code),
  CHECK (source_kind IN ('manual', 'provider', 'hybrid')),
  CHECK (scope_mode IN ('client_global', 'per_store')),
  CHECK (aggregation_mode IN ('weighted_average', 'sum', 'average', 'max', 'min', 'manual')),
  CHECK (value_type IN ('score', 'percent', 'currency', 'count', 'boolean', 'composite')),
  CHECK (evidence_policy IN ('none', 'optional', 'required')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_evaluation_indicators_evaluation
  ON indicator_evaluation_indicators(evaluation_id, code);

CREATE TABLE IF NOT EXISTS indicator_evaluation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_indicator_id uuid NOT NULL REFERENCES indicator_evaluation_indicators(id) ON DELETE CASCADE,
  profile_item_id uuid REFERENCES indicator_profile_indicator_items(id) ON DELETE SET NULL,
  code varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  input_type varchar(30) NOT NULL,
  evidence_policy varchar(30) NOT NULL,
  value_text text,
  value_numeric numeric(14,4),
  value_boolean boolean,
  value_json jsonb,
  weight numeric(7,4) NOT NULL DEFAULT 1,
  score numeric(8,4),
  notes text,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_indicator_id, code),
  CHECK (input_type IN ('boolean', 'score', 'percent', 'currency', 'count', 'text', 'image', 'image_required', 'select', 'provider_metric')),
  CHECK (evidence_policy IN ('none', 'optional', 'required', 'inherit')),
  CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_evaluation_items_indicator
  ON indicator_evaluation_items(evaluation_indicator_id, code);

CREATE TABLE IF NOT EXISTS indicator_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES indicator_evaluations(id) ON DELETE CASCADE,
  profile_indicator_id uuid REFERENCES indicator_profile_indicator_overrides(id) ON DELETE SET NULL,
  provider_name varchar(80) NOT NULL,
  source_module varchar(80),
  metric_key varchar(120) NOT NULL,
  scope_mode varchar(30) NOT NULL DEFAULT 'client_global',
  unit_external_id varchar(120),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  value_numeric numeric(14,4),
  value_text varchar(255),
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (scope_mode IN ('client_global', 'per_store'))
);

CREATE INDEX IF NOT EXISTS idx_indicator_metric_snapshots_provider
  ON indicator_metric_snapshots(provider_name, metric_key, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_indicator_metric_snapshots_evaluation
  ON indicator_metric_snapshots(evaluation_id, profile_indicator_id, unit_external_id);

CREATE TABLE IF NOT EXISTS indicator_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  evaluation_id uuid REFERENCES indicator_evaluations(id) ON DELETE CASCADE,
  evaluation_indicator_id uuid REFERENCES indicator_evaluation_indicators(id) ON DELETE SET NULL,
  evaluation_item_id uuid REFERENCES indicator_evaluation_items(id) ON DELETE SET NULL,
  asset_kind varchar(30) NOT NULL DEFAULT 'image',
  storage_provider varchar(40),
  storage_bucket varchar(120),
  storage_key varchar(500) NOT NULL,
  file_name varchar(255),
  content_type varchar(120),
  file_size_bytes bigint,
  uploaded_by_user_id uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (asset_kind IN ('image', 'video', 'document', 'link', 'provider_export')),
  CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_indicator_assets_evaluation
  ON indicator_assets(evaluation_id, evaluation_indicator_id, evaluation_item_id);

CREATE INDEX IF NOT EXISTS idx_indicator_assets_tenant_uploaded_at
  ON indicator_assets(tenant_id, uploaded_at DESC);