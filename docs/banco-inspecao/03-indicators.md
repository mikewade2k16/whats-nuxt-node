# Catálogo Completo do Schema `indicators`

## Escopo

Este catálogo cobre o estado final do schema `indicators` a partir de:

1. `0022_indicators_foundation.sql`;
2. `0023_indicators_governance.sql`;
3. `0024_seed_indicators_default_template.sql`.

## Diagnóstico rápido do schema

### O que ele faz bem

1. isola o módulo de indicadores em schema próprio;
2. separa template, perfil, metas, avaliação, snapshot e evidência;
3. já nasce com versionamento, governança e estrutura de provider binding.

### O que está frágil

1. `tenant_id`, `evaluator_user_id` e `uploaded_by_user_id` são referências lógicas ao shell, não FKs cruzadas;
2. a qualidade da integração depende fortemente da camada de serviço;
3. bindings de provider são flexíveis, mas exigem governança forte para não virar acoplamento implícito.

## Tabelas de template e taxonomia

### `indicator_templates`

- Classificação: `Atual`
- Papel: template mestre do módulo.
- Campos: `id` uuid PK; `code` varchar(80) unique; `name` varchar(160); `description` text nullable; `status` varchar(20) com conjunto `draft|active|archived`; `taxonomy_version` integer; `is_system` boolean; `default_scope_mode` varchar(30) com conjunto `client_global|per_store`; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: 1:N com `indicator_template_versions`; relação lógica com `indicator_profiles`.
- Exemplo real: `{"code":"indicators_default","name":"Template padrao de indicadores","status":"active","default_scope_mode":"per_store"}`.

### `indicator_template_versions`

- Classificação: `Atual`
- Papel: versão publicada ou draft do template.
- Campos: `id` uuid PK; `template_id` uuid FK; `version_number` integer; `status` varchar(20) com conjunto `draft|published|archived`; `published_at` timestamptz nullable; `notes` text nullable; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_templates`; 1:N com categorias e indicadores.
- Exemplo real: `{"template":"indicators_default","version_number":1,"status":"published"}`.

### `indicator_template_categories`

- Classificação: `Atual`
- Papel: agrupador macro da taxonomia do template.
- Campos: `id` uuid PK; `template_version_id` uuid FK; `code` varchar(80); `name` varchar(160); `description` text nullable; `sort_order` integer; `weight` numeric(7,4); `scope_mode` varchar(30) com conjunto `client_global|per_store`; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_template_versions`; 1:N com `indicator_template_indicators`.
- Exemplo real: `{"code":"ambiente_aconchegante","name":"Ambiente Aconchegante","weight":15,"scope_mode":"per_store"}`.

### `indicator_template_indicators`

- Classificação: `Atual`
- Papel: indicador de alto nível pertencente a uma categoria do template.
- Campos: `id` uuid PK; `template_version_id` uuid FK; `category_id` uuid FK; `code` varchar(80); `name` varchar(160); `description` text nullable; `indicator_kind` varchar(30) com conjunto `native|derived|composite`; `source_kind` varchar(30) com conjunto `manual|provider|hybrid`; `source_module` varchar(80) nullable; `source_metric_key` varchar(120) nullable; `scope_mode` varchar(30); `aggregation_mode` varchar(30) com conjunto `weighted_average|sum|average|max|min|manual`; `value_type` varchar(30) com conjunto `score|percent|currency|count|boolean|composite`; `evidence_policy` varchar(30) com conjunto `none|optional|required`; `weight` numeric(7,4); `is_required` boolean; `supports_store_breakdown` boolean; `settings_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_template_versions` e `indicator_template_categories`; 1:N com `indicator_template_indicator_items`.
- Exemplo real: `{"code":"time_especialistas","indicator_kind":"composite","source_kind":"hybrid","source_module":"people_analytics","source_metric_key":"team_health"}`.

### `indicator_template_indicator_items`

- Classificação: `Atual`
- Papel: item de avaliação ou captura pertencente ao indicador do template.
- Campos: `id` uuid PK; `template_indicator_id` uuid FK; `code` varchar(80); `label` varchar(160); `description` text nullable; `input_type` varchar(30) com conjunto `boolean|score|percent|currency|count|text|image|image_required|select|provider_metric`; `evidence_policy` varchar(30) com conjunto `inherit|none|optional|required`; `source_metric_key` varchar(120) nullable; `select_options_json` jsonb; `weight` numeric(7,4); `is_required` boolean; `config_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_template_indicators`.
- Exemplo real: `{"code":"reposicao_cafe","label":"Reposicao de cafe","input_type":"boolean","weight":25}`.

## Tabelas de perfil e customização por tenant

### `indicator_profiles`

- Classificação: `Atual`
- Papel: perfil operacional do tenant baseado no template.
- Campos: `id` uuid PK; `tenant_id` uuid; `template_id` uuid FK nullable; `template_version_id` uuid FK nullable; `code` varchar(80); `name` varchar(160); `description` text nullable; `status` varchar(20) com conjunto `draft|active|archived`; `scope_mode` varchar(30) com conjunto `client_global|per_store`; `store_breakdown_enabled` boolean; `provider_sync_enabled` boolean; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: relação lógica com o tenant do shell; N:1 opcional com `indicator_templates` e `indicator_template_versions`; 1:N com overrides, targets e avaliações.
- Exemplo: `{"tenant_id":"uuid-do-tenant-shell","code":"perfil-varejo-padrao","name":"Perfil Varejo Padrão","status":"active"}`.
- Observações: `tenant_id` não tem FK para `platform_core.tenants`.

### `indicator_profile_indicator_overrides`

- Classificação: `Atual`
- Papel: customização de indicador dentro do perfil do tenant.
- Campos: `id` uuid PK; `profile_id` uuid FK; `template_indicator_id` uuid FK nullable; `category_code` varchar(80); `category_name` varchar(160); `code` varchar(80); `name` varchar(160); `description` text nullable; `indicator_kind` varchar(30); `source_kind` varchar(30); `source_module` varchar(80) nullable; `source_metric_key` varchar(120) nullable; `scope_mode` varchar(30); `aggregation_mode` varchar(30); `value_type` varchar(30); `evidence_policy` varchar(30); `weight` numeric(7,4); `is_enabled` boolean; `is_required` boolean; `is_custom` boolean; `supports_store_breakdown` boolean; `settings_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_profiles`; N:1 opcional com `indicator_template_indicators`; 1:N com itens e overrides por unidade.
- Exemplo: `{"profile":"perfil-varejo-padrao","code":"indicadores_resultado","is_enabled":true,"is_custom":false}`.

### `indicator_profile_indicator_items`

- Classificação: `Atual`
- Papel: item customizado do indicador no perfil.
- Campos: `id` uuid PK; `profile_indicator_id` uuid FK; `template_item_id` uuid FK nullable; `code` varchar(80); `label` varchar(160); `description` text nullable; `input_type` varchar(30); `evidence_policy` varchar(30); `source_metric_key` varchar(120) nullable; `select_options_json` jsonb; `weight` numeric(7,4); `is_enabled` boolean; `is_required` boolean; `config_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_profile_indicator_overrides`; N:1 opcional com `indicator_template_indicator_items`.
- Exemplo: `{"profile_indicator":"indicadores_resultado","code":"meta_batida","input_type":"percent","is_enabled":true}`.

### `indicator_profile_store_overrides`

- Classificação: `Atual`
- Papel: override do indicador por unidade ou loja.
- Campos: `id` uuid PK; `profile_id` uuid FK; `profile_indicator_id` uuid FK; `unit_external_id` varchar(120); `unit_code` varchar(80) nullable; `unit_name` varchar(160) nullable; `scope_mode` varchar(30) com conjunto `client_global|per_store`; `weight` numeric(7,4) nullable; `is_enabled` boolean nullable; `settings_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_profiles` e `indicator_profile_indicator_overrides`.
- Exemplo: `{"profile":"perfil-varejo-padrao","profile_indicator":"time_especialistas","unit_external_id":"loja-jardins","is_enabled":true}`.

### `indicator_provider_bindings`

- Classificação: `Atual`, com integração flexível
- Papel: binding de indicador com provider externo.
- Campos: `id` uuid PK; `binding_scope` varchar(30); `provider_name` varchar(80); `source_module` varchar(80); `metric_key` varchar(120); `template_indicator_id` uuid FK nullable; `profile_indicator_id` uuid FK nullable; `config_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 opcional com `indicator_template_indicators` ou `indicator_profile_indicator_overrides`, conforme `binding_scope`.
- Exemplo: `{"binding_scope":"profile","provider_name":"sales","source_module":"sales","metric_key":"avg_ticket"}`.
- Observações: é poderosa, mas depende de governança e contrato de provider para não criar acoplamento informal.

## Tabelas de metas

### `indicator_target_sets`

- Classificação: `Atual`
- Papel: conjunto de metas do tenant para um período.
- Campos: `id` uuid PK; `tenant_id` uuid; `profile_id` uuid FK; `name` varchar(160); `period_kind` varchar(30) com conjunto `daily|weekly|monthly|quarterly|yearly|custom`; `starts_at` date nullable; `ends_at` date nullable; `scope_mode` varchar(30) com conjunto `client_global|per_store`; `status` varchar(20) com conjunto `draft|active|archived`; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: relação lógica com `tenant_id`; N:1 com `indicator_profiles`; 1:N com `indicator_target_items`.
- Exemplo: `{"tenant_id":"uuid-do-tenant-shell","name":"Metas Abril 2026","period_kind":"monthly","status":"active"}`.

### `indicator_target_items`

- Classificação: `Atual`
- Papel: meta detalhada por indicador ou unidade.
- Campos: `id` uuid PK; `target_set_id` uuid FK; `profile_indicator_id` uuid FK nullable; `category_code` varchar(80) nullable; `unit_external_id` varchar(120) nullable; `target_value_numeric` numeric(14,4) nullable; `target_value_text` varchar(255) nullable; `target_value_json` jsonb nullable; `comparator` varchar(20) com conjunto `gte|lte|eq|between`; `weight` numeric(7,4); `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_target_sets`; N:1 opcional com `indicator_profile_indicator_overrides`.
- Exemplo: `{"target_set":"Metas Abril 2026","profile_indicator":"meta_batida","unit_external_id":"loja-jardins","target_value_numeric":100.0,"comparator":"gte"}`.

## Tabelas de avaliação e evidência

### `indicator_evaluations`

- Classificação: `Atual`
- Papel: avaliação consolidada de um período e unidade.
- Campos: `id` uuid PK; `tenant_id` uuid; `profile_id` uuid FK; `target_set_id` uuid FK nullable; `evaluator_user_id` uuid nullable; `evaluator_name` varchar(160); `unit_external_id` varchar(120) nullable; `unit_code` varchar(80) nullable; `unit_name` varchar(160) nullable; `scope_mode` varchar(30); `period_start` date; `period_end` date; `status` varchar(20) com conjunto `draft|completed|cancelled`; `overall_score` numeric(8,4) nullable; `total_weight` numeric(8,4); `notes` text nullable; `config_snapshot` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: relação lógica com tenant e avaliador; N:1 com `indicator_profiles`; N:1 opcional com `indicator_target_sets`; 1:N com categorias, indicadores, snapshots e assets.
- Exemplo: `{"tenant_id":"uuid-do-tenant-shell","profile":"perfil-varejo-padrao","unit_external_id":"loja-jardins","period_start":"2026-04-01","period_end":"2026-04-30","status":"completed"}`.

### `indicator_evaluation_categories`

- Classificação: `Atual`
- Papel: subtotal por categoria dentro da avaliação.
- Campos: `id` uuid PK; `evaluation_id` uuid FK; `category_code` varchar(80); `category_name` varchar(160); `score` numeric(8,4) nullable; `weight` numeric(7,4); `summary_json` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_evaluations`.
- Exemplo: `{"evaluation":"abr-2026-loja-jardins","category_code":"ambiente_aconchegante","score":8.75}`.

### `indicator_evaluation_indicators`

- Classificação: `Atual`
- Papel: resultado do indicador na avaliação.
- Campos: `id` uuid PK; `evaluation_id` uuid FK; `evaluation_category_id` uuid FK nullable; `profile_indicator_id` uuid FK nullable; `code` varchar(80); `name` varchar(160); `source_kind` varchar(30); `source_module` varchar(80) nullable; `scope_mode` varchar(30); `aggregation_mode` varchar(30); `value_type` varchar(30); `evidence_policy` varchar(30); `score` numeric(8,4) nullable; `raw_value_numeric` numeric(14,4) nullable; `weight` numeric(7,4); `config_snapshot` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_evaluations`; N:1 opcional com `indicator_evaluation_categories` e `indicator_profile_indicator_overrides`.
- Exemplo: `{"evaluation":"abr-2026-loja-jardins","code":"indicadores_resultado","score":9.20,"raw_value_numeric":102.0}`.

### `indicator_evaluation_items`

- Classificação: `Atual`
- Papel: resposta detalhada ou nota do item avaliado.
- Campos: `id` uuid PK; `evaluation_indicator_id` uuid FK; `profile_item_id` uuid FK nullable; `code` varchar(80); `label` varchar(160); `input_type` varchar(30); `evidence_policy` varchar(30); `value_text` text nullable; `value_numeric` numeric(14,4) nullable; `value_boolean` boolean nullable; `value_json` jsonb nullable; `weight` numeric(7,4); `score` numeric(8,4) nullable; `notes` text nullable; `config_snapshot` jsonb; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: N:1 com `indicator_evaluation_indicators`; N:1 opcional com `indicator_profile_indicator_items`.
- Exemplo: `{"evaluation_indicator":"ambiente_aconchegante","code":"reposicao_cafe","value_boolean":true,"score":10.0}`.

### `indicator_metric_snapshots`

- Classificação: `Atual`
- Papel: snapshot de métrica externa usada na avaliação.
- Campos: `id` uuid PK; `evaluation_id` uuid FK nullable; `profile_indicator_id` uuid FK nullable; `provider_name` varchar(80); `source_module` varchar(80) nullable; `metric_key` varchar(120); `scope_mode` varchar(30) com conjunto `client_global|per_store`; `unit_external_id` varchar(120) nullable; `snapshot_at` timestamptz; `value_numeric` numeric(14,4) nullable; `value_text` varchar(255) nullable; `value_json` jsonb; `metadata` jsonb.
- Relações: N:1 opcionais com `indicator_evaluations` e `indicator_profile_indicator_overrides`.
- Exemplo: `{"provider_name":"sales","metric_key":"avg_ticket","unit_external_id":"loja-jardins","value_numeric":4830.55}`.

### `indicator_assets`

- Classificação: `Atual`
- Papel: evidência anexada à avaliação.
- Campos: `id` uuid PK; `tenant_id` uuid; `evaluation_id` uuid FK nullable; `evaluation_indicator_id` uuid FK nullable; `evaluation_item_id` uuid FK nullable; `asset_kind` varchar(30) com conjunto `image|video|document|link|provider_export`; `storage_provider` varchar(40) nullable; `storage_bucket` varchar(120) nullable; `storage_key` varchar(500); `file_name` varchar(255) nullable; `content_type` varchar(120) nullable; `file_size_bytes` bigint nullable; `uploaded_by_user_id` uuid nullable; `uploaded_at` timestamptz; `metadata` jsonb; `created_at` timestamptz.
- Relações: relação lógica com tenant e usuário; N:1 opcionais com `indicator_evaluations`, `indicator_evaluation_indicators` e `indicator_evaluation_items`.
- Exemplo: `{"tenant_id":"uuid-do-tenant-shell","asset_kind":"image","storage_key":"indicators/2026/04/loja-jardins/foto-vitrine-01.jpg"}`.

## Tabelas de governança

### `indicator_governance_policies`

- Classificação: `Atual`
- Papel: políticas de governança do módulo.
- Campos: `id` uuid PK; `code` varchar(80) unique; `title` varchar(160); `description` text; `state` varchar(20) com conjunto `system|recommended|custom`; `value` varchar(160); `affected_area` varchar(160); `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: tabela catálogo sem FKs.
- Exemplo real: `{"code":"scope-default","title":"Escopo default do onboarding","state":"recommended","value":"client_global"}`.

### `indicator_governance_roadmap_items`

- Classificação: `Atual`
- Papel: roadmap de evolução do módulo.
- Campos: `id` uuid PK; `code` varchar(80) unique; `title` varchar(160); `description` text; `stage` varchar(20) com conjunto `now|next|later`; `owner_name` varchar(120); `dependencies` jsonb array; `sort_order` integer; `is_active` boolean; `metadata` jsonb; `created_at` timestamptz; `updated_at` timestamptz.
- Relações: tabela catálogo sem FKs.
- Exemplo real: `{"code":"roadmap-history","title":"Historico e auditoria final","stage":"later","owner_name":"Backend / auditoria"}`.

## Leituras finais sobre `indicators`

### Pontos fortes

1. modelagem já preparada para evolução de template e governança;
2. clareza entre definição estrutural, customização e execução;
3. suporte a metas, avaliações e evidências sem misturar tudo em uma tabela única.

### Pontos de atenção

1. ausência de FK cruzada exige resolver tenant e usuário com disciplina de serviço;
2. bindings de provider precisam de contratos estáveis para não virar integração frágil;
3. vale monitorar se `unit_external_id` vai convergir para uma entidade de loja global no shell.