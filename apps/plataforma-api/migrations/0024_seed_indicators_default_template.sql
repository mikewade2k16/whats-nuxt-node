CREATE SCHEMA IF NOT EXISTS indicators;
SET search_path TO indicators, platform_core, public;

INSERT INTO indicator_templates (
  code,
  name,
  description,
  status,
  taxonomy_version,
  is_system,
  default_scope_mode,
  metadata
)
VALUES (
  'indicators_default',
  'Template padrao de indicadores',
  'Template base do modulo com os cinco indicadores operacionais do legado.',
  'active',
  1,
  true,
  'per_store',
  jsonb_build_object('bootstrap', 'migration_0024')
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  taxonomy_version = EXCLUDED.taxonomy_version,
  is_system = EXCLUDED.is_system,
  default_scope_mode = EXCLUDED.default_scope_mode,
  metadata = indicator_templates.metadata || EXCLUDED.metadata,
  updated_at = now();

WITH template_ctx AS (
  SELECT id AS template_id
  FROM indicator_templates
  WHERE code = 'indicators_default'
  LIMIT 1
)
INSERT INTO indicator_template_versions (
  template_id,
  version_number,
  status,
  published_at,
  notes,
  metadata
)
SELECT
  template_id,
  1,
  'published',
  now(),
  'Bootstrap inicial do template padrao do modulo indicators.',
  jsonb_build_object('bootstrap', 'migration_0024')
FROM template_ctx
ON CONFLICT (template_id, version_number) DO UPDATE
SET
  notes = EXCLUDED.notes,
  metadata = indicator_template_versions.metadata || EXCLUDED.metadata,
  updated_at = now();

WITH version_ctx AS (
  SELECT tv.id AS template_version_id
  FROM indicator_templates t
  JOIN indicator_template_versions tv ON tv.template_id = t.id
  WHERE t.code = 'indicators_default'
    AND tv.version_number = 1
  LIMIT 1
)
INSERT INTO indicator_template_categories (
  template_version_id,
  code,
  name,
  description,
  sort_order,
  weight,
  scope_mode,
  metadata
)
SELECT
  v.template_version_id,
  c.code,
  c.name,
  c.description,
  c.sort_order,
  c.weight,
  c.scope_mode,
  c.metadata
FROM version_ctx v
CROSS JOIN (
  VALUES
    ('ambiente_aconchegante', 'Ambiente Aconchegante', 'Auditoria de hospitalidade e ambientacao da unidade.', 10, 15::numeric, 'per_store', jsonb_build_object('legacyIndicator', '1')),
    ('time_especialistas', 'Time de Especialistas', 'Indicadores de time, equilibrio e desenvolvimento da operacao.', 20, 25::numeric, 'per_store', jsonb_build_object('legacyIndicator', '2')),
    ('qualidade_servico', 'Qualidade de Produtos e Servicos', 'Leitura consolidada de NPS e qualidade percebida no atendimento.', 30, 10::numeric, 'per_store', jsonb_build_object('legacyIndicator', '3')),
    ('posicionamento_branding', 'Posicionamento e Branding', 'Checklist de posicionamento de marca, visual merchandising e pos-venda.', 40, 15::numeric, 'per_store', jsonb_build_object('legacyIndicator', '4')),
    ('indicadores_resultado', 'Indicadores de Resultado', 'Meta, ticket medio e percentual de desconto consolidado por unidade.', 50, 35::numeric, 'per_store', jsonb_build_object('legacyIndicator', '5'))
) AS c(code, name, description, sort_order, weight, scope_mode, metadata)
ON CONFLICT (template_version_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  weight = EXCLUDED.weight,
  scope_mode = EXCLUDED.scope_mode,
  metadata = indicator_template_categories.metadata || EXCLUDED.metadata,
  updated_at = now();

WITH version_ctx AS (
  SELECT tv.id AS template_version_id
  FROM indicator_templates t
  JOIN indicator_template_versions tv ON tv.template_id = t.id
  WHERE t.code = 'indicators_default'
    AND tv.version_number = 1
  LIMIT 1
),
category_ctx AS (
  SELECT c.id AS category_id, c.code
  FROM indicator_template_categories c
  JOIN version_ctx v ON v.template_version_id = c.template_version_id
)
INSERT INTO indicator_template_indicators (
  template_version_id,
  category_id,
  code,
  name,
  description,
  indicator_kind,
  source_kind,
  source_module,
  source_metric_key,
  scope_mode,
  aggregation_mode,
  value_type,
  evidence_policy,
  weight,
  is_required,
  supports_store_breakdown,
  settings_json,
  metadata
)
SELECT
  v.template_version_id,
  c.category_id,
  i.code,
  i.name,
  i.description,
  i.indicator_kind,
  i.source_kind,
  i.source_module,
  i.source_metric_key,
  i.scope_mode,
  i.aggregation_mode,
  i.value_type,
  i.evidence_policy,
  i.weight,
  i.is_required,
  i.supports_store_breakdown,
  i.settings_json,
  i.metadata
FROM version_ctx v
JOIN (
  VALUES
    ('ambiente_aconchegante', 'ambiente_aconchegante', 'Ambiente Aconchegante', 'Indicador legado de ambientacao e cuidado da loja.', 'native', 'manual', '', '', 'per_store', 'weighted_average', 'score', 'optional', 15::numeric, true, true, '{}'::jsonb, jsonb_build_object('tags', jsonb_build_array('operacao', 'ambiente'))),
    ('time_especialistas', 'time_especialistas', 'Time de Especialistas', 'Indicador legado de time, STI e percepcao de desenvolvimento.', 'composite', 'hybrid', 'people_analytics', 'team_health', 'per_store', 'weighted_average', 'score', 'optional', 25::numeric, true, true, '{}'::jsonb, jsonb_build_object('tags', jsonb_build_array('people', 'performance'))),
    ('qualidade_servico', 'qualidade_servico', 'Qualidade de Produtos e Servicos', 'Indicador legado de qualidade de servico baseado em NPS.', 'native', 'manual', '', '', 'per_store', 'weighted_average', 'score', 'optional', 10::numeric, true, true, '{}'::jsonb, jsonb_build_object('tags', jsonb_build_array('qualidade', 'nps'))),
    ('posicionamento_branding', 'posicionamento_branding', 'Posicionamento e Branding', 'Indicador legado de branding, visual merchandising e retorno de pos-venda.', 'native', 'manual', '', '', 'per_store', 'weighted_average', 'score', 'optional', 15::numeric, true, true, '{}'::jsonb, jsonb_build_object('tags', jsonb_build_array('branding', 'visual'))),
    ('indicadores_resultado', 'indicadores_resultado', 'Indicadores de Resultado', 'Indicador legado de resultado comercial com pesos de meta, ticket e desconto.', 'composite', 'manual', '', '', 'per_store', 'weighted_average', 'score', 'optional', 35::numeric, true, true, '{}'::jsonb, jsonb_build_object('tags', jsonb_build_array('comercial', 'resultado')))
) AS i(category_code, code, name, description, indicator_kind, source_kind, source_module, source_metric_key, scope_mode, aggregation_mode, value_type, evidence_policy, weight, is_required, supports_store_breakdown, settings_json, metadata)
  ON true
JOIN category_ctx c ON c.code = i.category_code
ON CONFLICT (template_version_id, code) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  indicator_kind = EXCLUDED.indicator_kind,
  source_kind = EXCLUDED.source_kind,
  source_module = EXCLUDED.source_module,
  source_metric_key = EXCLUDED.source_metric_key,
  scope_mode = EXCLUDED.scope_mode,
  aggregation_mode = EXCLUDED.aggregation_mode,
  value_type = EXCLUDED.value_type,
  evidence_policy = EXCLUDED.evidence_policy,
  weight = EXCLUDED.weight,
  is_required = EXCLUDED.is_required,
  supports_store_breakdown = EXCLUDED.supports_store_breakdown,
  settings_json = EXCLUDED.settings_json,
  metadata = indicator_template_indicators.metadata || EXCLUDED.metadata,
  updated_at = now();

WITH version_ctx AS (
  SELECT tv.id AS template_version_id
  FROM indicator_templates t
  JOIN indicator_template_versions tv ON tv.template_id = t.id
  WHERE t.code = 'indicators_default'
    AND tv.version_number = 1
  LIMIT 1
),
indicator_ctx AS (
  SELECT i.id AS template_indicator_id, i.code
  FROM indicator_template_indicators i
  JOIN version_ctx v ON v.template_version_id = i.template_version_id
)
INSERT INTO indicator_template_indicator_items (
  template_indicator_id,
  code,
  label,
  description,
  input_type,
  evidence_policy,
  source_metric_key,
  select_options_json,
  weight,
  is_required,
  config_json,
  metadata
)
SELECT
  i.template_indicator_id,
  item.code,
  item.label,
  item.description,
  item.input_type,
  item.evidence_policy,
  item.source_metric_key,
  item.select_options_json,
  item.weight,
  item.is_required,
  item.config_json,
  item.metadata
FROM indicator_ctx i
JOIN (
  VALUES
    ('ambiente_aconchegante', 'reposicao_cafe', 'Reposicao de cafe', 'Checklist visual do cafe, agua e apoio da unidade.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Marque conforme quando o item estiver adequado.')),
    ('ambiente_aconchegante', 'bolo_bebidas_comidas', 'Bolo, bebidas e comidas', 'Confere disponibilidade e apresentacao dos itens de hospitalidade.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Use evidencia quando houver falha visual.')),
    ('ambiente_aconchegante', 'embalagens', 'Embalagens certas', 'Confere uso correto de embalagens e organizacao do apoio.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Aponte divergencias da padronizacao.')),
    ('ambiente_aconchegante', 'mezanino', 'Mezanino organizado', 'Audita limpeza, organizacao e padrao visual do mezanino.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Registre foto quando houver nao conformidade.')),
    ('time_especialistas', 'media_sti', 'Media do STI', 'Snapshot da media das provas STI da unidade.', 'score', 'optional', 'sti_average', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Escala de 0 a 10.')),
    ('time_especialistas', 'equilibrio_time', 'Equilibrio entre o time', 'Leitura de dispersao do time no periodo.', 'percent', 'optional', 'team_balance', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Informe o percentual de equilibrio observado.')),
    ('time_especialistas', 'desenvolvimento_lideres', 'Desenvolvimento de lideres', 'Percepcao estruturada de desenvolvimento das liderancas.', 'score', 'optional', 'leader_development', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Escala de 0 a 10.')),
    ('time_especialistas', 'pesquisa_360', 'Pesquisa 360', 'Snapshot da leitura 360/NPS interno da unidade.', 'score', 'optional', 'nps_360', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Escala de 0 a 10.')),
    ('qualidade_servico', 'nps_servico', 'NPS ligado a servico', 'Leitura do NPS de servico observado no periodo.', 'score', 'optional', 'service_nps', '[]'::jsonb, 100::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Escala de 0 a 10.')),
    ('posicionamento_branding', 'retorno_pos_venda', 'Retorno do pos-venda', 'Percentual de retorno do pos-venda contra a meta da unidade.', 'percent', 'optional', 'post_sale_return', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Informe o retorno consolidado do periodo.')),
    ('posicionamento_branding', 'vitrines_tvs_padrao', 'Vitrines e TVs no padrao', 'Confere padrao de vitrine, TVs e exposicao de marca.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Registre evidencia quando houver desvio visual.')),
    ('posicionamento_branding', 'mimos_loja', 'Mimos disponiveis', 'Confere disponibilidade dos mimos da marca na unidade.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Marque nao conforme quando faltar material ou item.')),
    ('posicionamento_branding', 'dress_code', 'Dress code', 'Confere aderencia ao dress code e apresentacao da equipe.', 'boolean', 'optional', '', '[]'::jsonb, 25::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Use evidencia visual quando necessario.')),
    ('indicadores_resultado', 'meta_batida', 'Meta batida', 'Percentual de atingimento da meta principal da unidade.', 'percent', 'optional', 'sales_target', '[]'::jsonb, 60::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Informe o percentual consolidado do periodo.')),
    ('indicadores_resultado', 'ticket_medio', 'Ticket medio', 'Valor medio de ticket comparado com a meta vigente.', 'currency', 'optional', 'avg_ticket', '[]'::jsonb, 30::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Valor monetario medio do periodo.')),
    ('indicadores_resultado', 'percentual_desconto_medio', 'Percentual de desconto medio', 'Percentual medio de desconto praticado na unidade.', 'percent', 'optional', 'avg_discount', '[]'::jsonb, 10::numeric, true, '{}'::jsonb, jsonb_build_object('helper', 'Use percentual real consolidado do periodo.'))
) AS item(indicator_code, code, label, description, input_type, evidence_policy, source_metric_key, select_options_json, weight, is_required, config_json, metadata)
  ON i.code = item.indicator_code
ON CONFLICT (template_indicator_id, code) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  input_type = EXCLUDED.input_type,
  evidence_policy = EXCLUDED.evidence_policy,
  source_metric_key = EXCLUDED.source_metric_key,
  select_options_json = EXCLUDED.select_options_json,
  weight = EXCLUDED.weight,
  is_required = EXCLUDED.is_required,
  config_json = EXCLUDED.config_json,
  metadata = indicator_template_indicator_items.metadata || EXCLUDED.metadata,
  updated_at = now();