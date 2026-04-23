# Catálogo Completo do Schema `fila_atendimento`

## Escopo

Este catálogo cobre o estado atual do módulo `fila_atendimento` hospedado em `modules/fila-atendimento/backend/internal/platform/database/migrations`, já depois da convergência estrutural com o shell.

As referências decisivas para entender o estado atual são:

1. `0018_core_directory_convergence.sql`;
2. `0019_drop_shadow_directory_tables.sql`;
3. `0020_operational_timestamps_timestamptz.sql`.

## Diagnóstico rápido do schema

### O que ele faz bem

1. separa roster operacional, perfil de loja, estado corrente e histórico append-only;
2. usa o shell como fonte de verdade para usuário, tenant, acesso e loja;
3. mantém o que é legitimamente local ao módulo em tabelas próprias e pequenas;
4. já padronizou instantes operacionais em `timestamptz`.

### O que saiu do schema local

1. `users`;
2. `tenants`;
3. `stores`;
4. `user_platform_roles`;
5. `user_tenant_roles`;
6. `user_store_roles`;
7. `user_invitations`;
8. `user_external_identities`.

### O que continua sendo local ao módulo

1. `consultants` como roster operacional por loja;
2. `store_profiles` como perfil comercial complementar da loja global;
3. `store_operation_settings`, `store_setting_options`, `store_catalog_products` e `store_campaigns`;
4. todo o bloco `operation_*` como estado vivo e histórico da operação física.

## Relação com o core

O schema local agora depende diretamente de:

1. `platform_core.users`;
2. `platform_core.tenants`;
3. `platform_core.tenant_users`;
4. `platform_core.tenant_stores`.

Leitura prática:

1. a identidade canônica está em `platform_core.users`;
2. a loja canônica está em `platform_core.tenant_stores`;
3. o vínculo entre pessoa, tenant, papel de negócio e loja está em `platform_core.tenant_users`;
4. o schema `fila_atendimento` guarda apenas o recorte operacional da loja física.

## Tabelas atuais do schema

O schema possui 13 tabelas no total, sendo 12 de domínio e `schema_migrations`.

### `consultants`

- Classificação: `Atual`
- Papel: roster operacional por loja.
- Campos: `id` uuid PK; `tenant_id` uuid FK para `platform_core.tenants`; `store_id` uuid FK para `platform_core.tenant_stores`; `name`; `role_label`; `initials`; `color`; `monthly_goal`; `commission_rate`; `conversion_goal`; `avg_ticket_goal`; `pa_goal`; `is_active`; `created_at`; `updated_at`; `user_id` uuid FK nullable para `platform_core.users`.
- Relações: N:1 com tenant, loja global e opcionalmente usuário global; 1:N com `operation_*`.
- Exemplo aderente ao desenho atual: `{"name":"Roseli de Andrade Paixão","store":"Garcia","role_label":"Consultora","user_id":"core-user-uuid"}`.
- Observações: esta tabela não é identidade nem autorização; ela é o roster operacional da loja.

### `store_profiles`

- Classificação: `Atual`
- Papel: perfil comercial complementar da loja global no contexto da fila.
- Campos: `store_id` uuid PK FK para `platform_core.tenant_stores`; `default_template_id`; `monthly_goal`; `weekly_goal`; `avg_ticket_goal`; `conversion_goal`; `pa_goal`; `created_at`; `updated_at`.
- Relações: 1:1 com `platform_core.tenant_stores`.
- Exemplo: `{"store":"Garcia","default_template_id":"joalheria-padrao","monthly_goal":180000}`.
- Observações: a loja canônica fica no core; aqui fica apenas o perfil operacional usado por analytics, ranking e metas locais.

### `store_operation_settings`

- Classificação: `Atual`
- Papel: configuração escalar da operação e do modal por loja.
- Campos: `store_id` uuid PK FK; `selected_operation_template_id`; `max_concurrent_services`; `timing_fast_close_minutes`; `timing_long_service_minutes`; `timing_low_sale_amount`; `test_mode_enabled`; `auto_fill_finish_modal`; `alert_min_conversion_rate`; `alert_max_queue_jump_rate`; `alert_min_pa_score`; `alert_min_ticket_average`; `title`; labels, placeholders e flags de obrigatoriedade; `created_at`; `updated_at`.
- Relações: 1:1 com `platform_core.tenant_stores`.

### `store_setting_options`

- Classificação: `Atual`
- Papel: catálogo de opções configuráveis por loja.
- Campos: `store_id` uuid FK; `kind`; `option_id`; `label`; `sort_order`; `created_at`; `updated_at`.
- Relações: N:1 com `platform_core.tenant_stores`.

### `store_catalog_products`

- Classificação: `Atual`
- Papel: catálogo de produtos disponível para a loja.
- Campos: `store_id` uuid FK; `product_id`; `name`; `code`; `category`; `base_price`; `sort_order`; `created_at`; `updated_at`.
- Relações: N:1 com `platform_core.tenant_stores`.

### `store_campaigns`

- Classificação: `Atual`
- Papel: campanhas que impactam bonificação, priorização ou leitura comercial da operação.
- Campos: `store_id` uuid FK; `campaign_id`; `name`; `description`; `campaign_type`; `is_active`; `starts_at`; `ends_at`; `target_outcome`; `min_sale_amount`; `max_service_minutes`; `product_codes_json`; `source_ids_json`; `reason_ids_json`; `queue_jump_only`; `existing_customer_filter`; `bonus_fixed`; `bonus_rate`; `sort_order`; `created_at`; `updated_at`.
- Relações: N:1 com `platform_core.tenant_stores`.

### `operation_queue_entries`

- Classificação: `Atual`
- Papel: fila corrente da loja.
- Campos: `store_id` uuid FK; `consultant_id` uuid FK; `queue_joined_at` `timestamptz`; `sort_order`; `created_at`; `updated_at`.
- Relações: N:1 com `platform_core.tenant_stores` e `consultants`.
- Observações: `queue_joined_at` saiu de `bigint` e agora segue o padrão temporal da plataforma.

### `operation_active_services`

- Classificação: `Atual`
- Papel: atendimento em andamento.
- Campos: `store_id` uuid FK; `consultant_id` uuid FK; `service_id`; `service_started_at` `timestamptz`; `queue_joined_at` `timestamptz`; `queue_wait_ms`; `queue_position_at_start`; `start_mode`; `skipped_people_json`; `created_at`; `updated_at`.
- Relações: N:1 com loja global e `consultants`.
- Observações: durações continuam em milissegundos, mas instantes agora são `timestamptz`.

### `operation_paused_consultants`

- Classificação: `Atual`
- Papel: pausa corrente ou bloqueio operacional do consultor.
- Campos: `store_id` uuid FK; `consultant_id` uuid FK; `reason`; `kind`; `started_at` `timestamptz`; `created_at`; `updated_at`.
- Relações: N:1 com loja global e `consultants`.

### `operation_current_status`

- Classificação: `Atual`
- Papel: status resumido atual do consultor.
- Campos: `store_id` uuid FK; `consultant_id` uuid FK; `status`; `started_at` `timestamptz`; `created_at`; `updated_at`.
- Relações: N:1 com loja global e `consultants`.

### `operation_status_sessions`

- Classificação: `Atual`, append-only
- Papel: trilha histórica de mudanças de status do consultor.
- Campos: `id` uuid PK; `store_id` uuid FK; `consultant_id` uuid FK; `status`; `started_at` `timestamptz`; `ended_at` `timestamptz`; `duration_ms`; `created_at`.
- Relações: N:1 com loja global e `consultants`.

### `operation_service_history`

- Classificação: `Atual`, append-only
- Papel: histórico imutável do atendimento encerrado.
- Campos: `id` uuid PK; `store_id` uuid FK; `service_id`; `person_id` uuid FK; `person_name`; `started_at` `timestamptz`; `finished_at` `timestamptz`; `duration_ms`; `finish_outcome`; `start_mode`; `queue_position_at_start`; `queue_wait_ms`; blocos de produto, cliente, motivo, perda, campanha e notas; `created_at`.
- Relações: N:1 com loja global e `consultants`.
- Observações: é a tabela mais importante para relatórios, ranking e analytics do módulo.

### `schema_migrations`

- Classificação: `Técnico-operacional`
- Papel: trilha das migrations aplicadas no schema do módulo.

## Leitura arquitetural final

### O que o banco mostra com clareza

1. a convergência estrutural do módulo com o shell já terminou;
2. a loja canônica agora está em `platform_core.tenant_stores`;
3. o schema local guarda apenas a camada operacional da fila física;
4. o último desvio temporal relevante foi removido com a migração para `timestamptz`.

### O que continua merecendo atenção

1. o runtime operacional do atendimento-online já convergiu identidade, limite, schema físico, elegibilidade de acesso e segredo operacional para o desenho canônico esperado;
2. `tenant_store_charges` continua existindo no core como overlay financeiro de compatibilidade, embora a loja canônica já esteja fechada em `tenant_stores`;
3. parte do vocabulário de acesso ainda precisa ser traduzida entre módulos antigos e o shell.
