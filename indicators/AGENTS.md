# AGENTS.md - Modulo `indicators`

## Objetivo
Este arquivo e a base de referencia para recriar o modulo de indicadores em um painel novo, com:

- front em Nuxt 4
- backend em Go
- banco em PostgreSQL
- modulo isolado, multi-tenant, consumindo usuarios e clientes de outros modulos

A regra principal e: replicar 100% do comportamento atual, aceitando apenas upgrades e correcoes. Nada funcional pode faltar.

## Escopo analisado
Arquivos principais lidos nesta analise:

- `app/views/admin/pages/indicators/index.php`
- `app/views/admin/pages/indicators/content.php`
- `app/views/admin/pages/indicators/dashboard.php`
- `app/views/admin/pages/indicators/indicator-1.php`
- `app/views/admin/pages/indicators/indicator-2.php`
- `app/views/admin/pages/indicators/indicator-3.php`
- `app/views/admin/pages/indicators/indicator-4.php`
- `app/views/admin/pages/indicators/indicator-5.php`
- `app/views/admin/pages/indicators/modal-avaliations.php`
- `app/views/admin/pages/functions/base.php`
- `app/views/admin/pages/functions/indicatorOne.php`
- `app/views/admin/pages/functions/indicatorTwo.php`
- `app/views/admin/pages/functions/indicatorThree.php`
- `app/views/admin/pages/functions/indicatorFour.php`
- `app/views/admin/pages/functions/indicatorFive.php`
- `app/views/admin/pages/functions/graphicScripts.php`
- `app/controllers/DashboardIndicatoresController.php`
- `back/admin/indicadores.php`
- `back/admin/delete-avaliacao.php`
- `api/dashboard-indicators/index.php`
- `api/indicators/index.php`
- `api/indicators/avaliations/index.php`
- `back/send-form-organizational.php`
- `app/views/admin/pages/functions/sti.php`

## Nivel de confianca da analise
Confirmado no codigo:

- fluxos de tela
- componentes de UI
- formulas de calculo
- contratos dos endpoints PHP
- relacoes entre tabelas
- dependencias externas do modulo

Inferido por leitura de queries e inserts:

- parte do schema exato das tabelas
- alguns defaults de pesos no banco
- alguns campos `created_at`/`updated_at` e tipos precisos

Observacao importante:

- o MySQL local nao estava acessivel no momento da analise, entao nao foi possivel rodar `SHOW CREATE TABLE`
- antes de congelar a migracao, validar o schema real em producao ou em um dump da base

## O que o modulo faz hoje
O modulo atual e uma pagina administrativa em `/admin/indicadores` com acesso restrito.

### Controle de acesso
Origem:

- `app/views/admin/pages/indicators/index.php`
- `app/views/admin/template.php`
- `app/views/admin/acessLevel.php`

Regras atuais:

- niveis permitidos: `admin`
- excecao por nome: `Joyce`
- depende de sessao autenticada

### Funcionalidades visiveis
1. Filtrar os indicadores por intervalo de datas.
2. Listar avaliacoes cadastradas em tabela com exportacao.
3. Abrir modal e cadastrar nova avaliacao.
4. Selecionar quais indicadores serao avaliados dentro da avaliacao.
5. Gravar uma avaliacao "cabecalho" e os dados de cada indicador em tabelas filhas.
6. Exibir dashboard geral por loja.
7. Exibir os 5 indicadores com grafico, cards por loja e modais de detalhe.
8. Excluir uma avaliacao e apagar seus filhos.

### Dependencias de UI atuais
O modulo usa:

- Bootstrap para grid, cards, collapse e modal
- jQuery
- DataTables
- SweetAlert2
- daterangepicker + moment.js
- ApexCharts
- Chocolat para lightbox

No Nuxt 4, o ideal e nao carregar esse legado diretamente. Recriar os comportamentos com componentes nativos/composables.

## Arquitetura atual do modulo
### Rota e composicao
`index.php` aponta para `content.php`, que:

- inclui as funcoes dos 5 indicadores
- le o range de datas
- calcula os dados agregados
- monta a tabela de avaliacoes
- chama `dashboard.php`
- inclui os 5 sub-blocos visuais
- inclui `graphicScripts.php`
- inclui `modal-avaliations.php`

### Backoffice de escrita
Fluxo de criacao:

- form no modal envia via AJAX para `../back/admin/indicadores.php`
- backend cria registro em `avaliacoes`
- backend cria registros filhos apenas para os indicadores selecionados
- uploads vao para `upload-indicadores/`

Fluxo de exclusao:

- botao na tabela chama `../back/admin/delete-avaliacao.php`
- backend deleta manualmente os filhos e depois o cabecalho

### APIs existentes
Ja existe um inicio de API:

- `GET /api/dashboard-indicators?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/indicators?id=1..5&start=YYYY-MM-DD&end=YYYY-MM-DD&store=LojaOpcional`
- `GET /api/indicators/avaliations?start_date=...&end_date=...&loja=...`

Essas APIs sao boas referencias para o contrato alvo, mas ainda estao misturadas com logica duplicada do PHP.

## Fluxo da tela atual
### 1. Entrada na pagina
Ao abrir `/admin/indicadores`:

- se nao existir `start_date`/`end_date`, o sistema usa o mes atual
- a pagina exibe um texto "Exibindo dados de X ate Y"

### 2. Filtro por periodo
O campo `#rangePicker`:

- usa `daterangepicker`
- permite ranges prontos: hoje, ontem, essa semana, ultimos 30 dias, esse mes, etc.
- no `apply`, ja redireciona com `?start_date=...&end_date=...`
- o botao "Aplicar" tambem redireciona

### 3. Tabela "Indicadores Cadastrados"
A pagina possui um collapse com tabela de avaliacoes:

- colunas: avaliador, loja, indicadores, periodo inicio, periodo fim, acoes
- usa DataTables
- exporta Excel e PDF
- permite exclusao

### 4. Modal "Avaliar"
O modal:

- pega o nome do avaliador da sessao
- exige loja
- exige periodo
- permite selecionar quais indicadores serao avaliados
- mostra/esconde blocos de input por indicador selecionado
- grava `indicadores_avaliados` como string CSV em hidden input

### 5. Dashboard e indicadores
Se existir ao menos uma avaliacao sobreposta ao periodo:

- mostra dashboard geral
- mostra os 5 indicadores
- cada indicador possui:
  - um grafico
  - cards por loja
  - modal de detalhes

Se nao existir avaliacao sobreposta ao periodo:

- mostra a mensagem "Nenhuma avaliacao encontrada para este periodo."

## Modelo funcional atual
### Entidade central: `avaliacoes`
Cada avaliacao representa uma execucao de auditoria para:

- uma loja
- um avaliador
- um intervalo `start_date` e `end_date`
- uma lista de indicadores avaliados

As tabelas filhas guardam os dados especificos de cada indicador.

### Regras de filtro temporal
O modulo considera uma avaliacao valida para um periodo quando:

```text
NOT (end_date < filtro.start_date OR start_date > filtro.end_date)
```

Ou seja: qualquer sobreposicao de intervalo conta.

## Tabelas atuais identificadas
### 1. `avaliacoes`
Campos confirmados ou fortemente inferidos:

- `id`
- `avaliador`
- `loja`
- `mes` (legado)
- `ano` (legado)
- `start_date`
- `end_date`
- `indicadores_avaliados` (CSV, ex: `1,2,4`)
- `updated_at`

Observacoes:

- `mes` e `ano` eram usados antes; hoje o modulo ja e orientado a range
- o modal atual nao envia mais `mes` e `ano`, mas o backend ainda tenta gravar esses campos

### 2. `ambiente_aconchegante`
Campos usados:

- `avaliacao_id`
- `reposicao_cafe`
- `reposicao_cafe_imagem`
- `bolo_bebidas_comidas`
- `bolo_bebidas_comidas_imagem`
- `embalagens`
- `embalagens_imagem`
- `mezanino`
- `mezanino_imagem`

Campos legados inferidos:

- `peso_classe`
- `peso_reposicao_cafe`
- `peso_bolo_bebidas_comidas`
- `peso_embalagens`
- `peso_mezanino`

### 3. `time_especialistas`
Campos usados:

- `avaliacao_id`
- `taxa_equilibrio_maior`
- `taxa_equilibrio_menor`
- `nota_media_sti`
- `desenvolvimento_lideres`
- `pesquisa_360`
- `peso_taxa_equilibrio_time`
- `peso_desenvolvimento_lideres`
- `peso_pesquisa_360`

Campo legado identificado em versao antiga:

- `taxa_equilibrio_time`

### 4. `qualidade_produtos_servicos`
Campos usados:

- `avaliacao_id`
- `nps_servico`
- `peso_nps_servico`

Campos legados inferidos:

- `peso_classe`

### 5. `posicionamento_branding`
Campos usados:

- `avaliacao_id`
- `retorno_pos_venda`
- `vitrines_tvs_padrao`
- `vitrines_tvs_padrao_imagem`
- `mimos_loja`
- `mimos_loja_imagem`
- `dress_code`
- `dress_code_imagem`

Campo legado inferido:

- `peso_classe`

### 6. `indicadores_resultado`
Campos usados:

- `avaliacao_id`
- `meta_batida`
- `ticket_medio`
- `percentual_desconto_medio`
- `peso_meta_batida`
- `peso_ticket_medio`
- `peso_percentual_desconto_medio`

Campo legado inferido:

- `peso_classe`

### 7. `metas_indicadores`
Campos usados em consultas:

- `id`
- `loja`
- `start_date`
- `end_date`
- `retorno_pos_venda`
- `meta`
- `ticket_medio`
- `percentual_desconto`

Campo legado identificado:

- `nps_total`

### 8. `sti`
Tabela externa, nao pertence ao modulo de indicadores, mas alimenta o indicador 2.

Campos observados no codigo:

- `loja`
- `nota`
- `mes`
- `ano`
- `start_date`
- `end_date`
- `modulo`
- `nome`
- `nome_consultor`

### 9. `collab_satisfaction`
Tabela externa, nao pertence ao modulo de indicadores, mas alimenta o indicador 2.

Campos observados:

- `id`
- `store`
- `name`
- `satisfaction` (JSON com `nota` e `descricao`)
- `team_climate` (JSON)
- `leader` (JSON)
- `dept_communication` (JSON)
- `procedures` (JSON)
- `management` (JSON)
- `future_expectations` (texto)
- `store_communication` (JSON)
- `customer_experience` (JSON)
- `customer_complaints` (JSON)
- `tools` (JSON)
- `growth_opportunities` (JSON)
- `recognition` (JSON)
- `benefits` (JSON)
- `challenges` (JSON)
- `training` (JSON)
- `company_values` (JSON)
- `expectations_year` (texto)
- `feedback_policy` (JSON)
- `created_at`

## Indicadores atuais
## Indicador 1 - Ambiente Aconchegante
Origem:

- tabela filha: `ambiente_aconchegante`
- funcao: `obterDadosIndicador1`
- view: `indicator-1.php`

Peso da classe:

- `15`

Itens avaliados:

- reposicao de cafe
- bolo / bebidas / comidas
- embalagens certas
- mezanino organizado

Formula atual:

```text
Cada item cumprido vale 25 pontos.
nota_bruta_avaliacao = soma dos 4 itens (0 a 100)
nota_final_avaliacao = nota_bruta_avaliacao * 15 / 100
media_loja = media das notas brutas
media_final_loja = media das notas ponderadas
```

Comportamento visual:

- grafico usa `media` por loja
- card da loja mostra:
  - media bruta
  - itens faltantes unicos no periodo
  - botao "Ver Imagens" se houver imagem em pelo menos uma falha
- modal mostra:
  - avaliador
  - data
  - imagens por item falho
  - nota bruta e nota final de cada avaliacao
  - media final agregada da loja

Regra de evidencia:

- se item estiver desmarcado, pode haver imagem comprobataria
- imagens ficam em `upload-indicadores/`

## Indicador 2 - Time de Especialistas
Origem:

- tabela filha: `time_especialistas`
- dependencias externas: `sti` e `collab_satisfaction`
- funcao: `obterDadosIndicador2`
- view: `indicator-2.php`

Peso da classe:

- `25`

Itens avaliados:

- media do STI
- equilibrio entre o time
- desenvolvimento de lideres
- pesquisa 360 (NPS)

Formula atual por avaliacao:

```text
dif_percentual = ((maior - menor) / maior) * 100, se maior > 0

taxa_bruta:
  se dif <= 20 -> 100
  se dif >= 50 -> 0
  senao -> 100 - ((dif - 20) / 30 * 100)

taxa_nota = taxa_bruta * peso_taxa / 100
desenv_nota = (desenvolvimento_lideres / 10) * peso_desenvolvimento
satisf_nota = (media_satisfaction_externa / 10) * peso_pesquisa_360

peso_sti = 100 - (peso_taxa + peso_desenvolvimento + peso_pesquisa_360)
sti_nota = (media_sti_externa / 10) * peso_sti

nota_bruta = taxa_nota + desenv_nota + satisf_nota + sti_nota
nota_final = nota_bruta * 25 / 100
```

Origem dos dados externos:

- `mediaSTILoja`: media de `sti.nota` no periodo; se nao existir, usa o mes/ano mais recente da loja
- `mediaSatisfacaoLoja`: media de `JSON_EXTRACT(collab_satisfaction.satisfaction, '$.nota')`

Comportamento visual:

- grafico usa `nota_final_bruta_media`
- card da loja mostra:
  - STI medio convertido para percentual
  - equilibrio do time em percentual
  - desenvolvimento de lideres em percentual
  - satisfacao 360 em percentual
  - nota final media bruta
- modal mostra por avaliacao:
  - STI bruto e nota
  - diferenca percentual e nota do equilibrio
  - desenvolvimento bruto e nota
  - satisfacao bruta e nota
  - nota bruta e nota final

Observacao funcional importante:

- o form grava `nota_media_sti` e `pesquisa_360`, mas o calculo atual nao usa esses snapshots gravados
- o calculo reconsulta as tabelas externas no momento da leitura

Isso precisa ser melhorado no novo modulo para nao distorcer historico.

## Indicador 3 - Qualidade dos Produtos e Servicos
Origem:

- tabela filha: `qualidade_produtos_servicos`
- funcao: `obterDadosIndicador3`
- view: `indicator-3.php`

Peso da classe:

- `10`

Item avaliado:

- NPS ligado a servico

Formula atual:

```text
nps_maximo = 5
porcentagem = (nps_servico / 5) * 100
nota_final_avaliacao = porcentagem * 10 / 100
media_final_loja = media das notas finais
```

Comportamento visual esperado:

- grafico usa media por loja
- card da loja mostra:
  - media do NPS
  - porcentagem media
  - botao de detalhes
- modal mostra:
  - avaliador
  - data
  - NPS bruto
  - porcentagem individual
  - nota final

Problema identificado:

- a funcao agrega `npsBruto` como percentual medio 0..100
- a view trata `npsBruto` como se fosse nota 0..5
- isso pode gerar exibicao incorreta no front atual

No novo modulo:

- manter a intencao funcional
- corrigir a nomenclatura e a exibicao
- separar claramente `nps_raw` de `nps_percent`

## Indicador 4 - Posicionamento e Branding
Origem:

- tabela filha: `posicionamento_branding`
- metas externas: `metas_indicadores.retorno_pos_venda`
- funcao: `obterDadosIndicador4`
- view: `indicator-4.php`

Peso da classe:

- `15`

Itens avaliados:

- retorno do pos-venda
- vitrines e TVs no padrao
- mimos disponiveis
- dress code

Formula atual por avaliacao:

```text
meta_retorno = ultima meta da loja vigente no periodo; fallback 10
pct_retorno = min((retorno_real / meta_retorno) * 100, 100)
nota_retorno = pct_retorno * 0.25

nota_vitrines = 25 se ok, senao 0
nota_mimos = 25 se ok, senao 0
nota_dress = 25 se ok, senao 0

nota_bruta = nota_retorno + nota_vitrines + nota_mimos + nota_dress
nota_final = nota_bruta * 15 / 100
```

Comportamento visual:

- grafico usa `nota_final_bruta_media`
- card da loja mostra:
  - retorno de pos-venda e se bateu meta
  - lista unica de itens nao cumpridos
  - botao de detalhes se houver algo falho
  - media final bruta
- modal mostra:
  - avaliador e data
  - imagens apenas dos itens falhos
  - nota bruta e nota final por avaliacao
  - agregados da loja

Regra de evidencia:

- os 3 itens booleanos podem ter imagem quando falham

## Indicador 5 - Indicadores de Resultado
Origem:

- tabela filha: `indicadores_resultado`
- metas externas: `metas_indicadores`
- funcao: `obterDadosIndicador5`
- view: `indicator-5.php`

Peso da classe:

- `35`

Itens avaliados:

- meta batida
- ticket medio
- percentual de desconto medio

Formula atual por avaliacao:

```text
meta_alvo = meta vigente da loja; fallback 1
ticket_alvo = ticket vigente da loja; fallback 1
desc_alvo = desconto maximo vigente; fallback 100

des_meta_raw = (meta_batida / meta_alvo) * 100
des_ticket_raw = (ticket_medio / ticket_alvo) * 100
des_desc =
  100, se desconto_real <= desc_alvo
  senao max(0, 100 - ((desconto_real - desc_alvo) / desc_alvo) * 100)

des_meta = min(des_meta_raw, 100)
des_ticket = min(des_ticket_raw, 100)

nota_meta = des_meta * peso_meta / 100
nota_ticket = des_ticket * peso_ticket / 100
nota_desc = des_desc * peso_desc / 100

nota_bruta = nota_meta + nota_ticket + nota_desc
nota_final = nota_bruta * 35 / 100
```

Pesos legados fortemente sugeridos pelo codigo antigo:

- meta batida: `60`
- ticket medio: `30`
- desconto: `10`

Comportamento visual:

- grafico usa `nota_final_bruta_media`
- card da loja mostra:
  - valor real x meta de meta batida
  - valor real x meta de ticket
  - desconto real x maximo permitido
  - nota final media
  - botao de detalhes
- modal mostra por avaliacao:
  - valores reais
  - metas
  - desempenhos
  - notas por item
  - nota bruta e final

## Dashboard atual
Origem:

- `dashboard.php`
- `DashboardIndicatoresController.php`
- `graphicScripts.php`

O dashboard atual faz:

- calcula uma matriz loja x indicador
- soma as `media_final` dos 5 indicadores
- calcula uma `media_ponderada` geral por loja
- gera ranking das lojas
- renderiza um grafico de barras "Nota Geral das Lojas em todos indicadores"

Formula:

```text
nota_total_loja = soma das medias ponderadas dos indicadores presentes
peso_utilizado_loja = soma dos pesos das classes presentes
media_ponderada_loja = (nota_total_loja / peso_utilizado_loja) * 100
```

Limitacoes atuais:

- o controller usa `media` para calcular medias de indicadores no resumo, mas so o indicador 1 entrega essa chave com esse nome
- isso compromete ranking de melhor/pior indicador
- os cards de "melhor indicador" e "pior indicador" estao comentados na view

## Componentes que precisam existir no Nuxt 4
### Pagina principal
- `IndicatorsPage`
- toolbar com range de datas
- botao de collapse/lista de avaliacoes
- botao para abrir modal de avaliacao

### Tabela de avaliacoes
- grid server-side ou client-side
- filtros por periodo e loja
- exportacao CSV/XLSX/PDF
- exclusao com confirmacao

### Dashboard
- card grande com ranking de lojas
- suporte a loading e empty state

### Blocos dos 5 indicadores
Cada indicador precisa ter:

- componente de grafico
- grid de cards por unidade/loja
- modal de detalhes
- renderizacao fiel dos dados e regras de negocio

### Modal de avaliacao
Precisa ter:

- cabecalho com avaliador, loja/unidade e periodo
- seletor de indicadores
- renderizacao dinamica das secoes
- uploads de evidencia
- validacoes por indicador
- submit assicrono

### Gestao de imagens
Precisa ter:

- upload
- preview
- visualizacao em modal/lightbox
- storage seguro

## Dependencias externas do modulo novo
O novo modulo deve consumir de outros modulos:

- usuario autenticado
- cliente/tenant
- unidades/lojas do cliente
- possivelmente STI
- possivelmente pesquisa 360 / clima / satisfacao

### Regra de isolamento recomendada
O modulo de indicadores nao deve depender de FK cross-database.

Use:

- `tenant_id` como referencia ao cliente externo
- `external_user_id` para o usuario externo
- `external_unit_id` para a loja/unidade externa

Opcionalmente manter tabelas espelho locais:

- `tenant_units_cache`
- `users_cache`

Mas a fonte de verdade continua sendo o modulo externo.

## Decisao importante para o novo desenho
### Nao recalcular historico usando dados externos "ao vivo"
Hoje o indicador 2 depende de:

- media STI lida da tabela externa no momento da consulta
- media de satisfacao 360 lida da tabela externa no momento da consulta

Isso e perigoso porque o historico muda quando a base externa muda.

No novo modulo, a regra recomendada e:

1. buscar os valores externos no momento da criacao da avaliacao
2. preencher o formulario com esses valores
3. salvar um snapshot local do que foi usado
4. calcular o dashboard usando o snapshot salvo

Isso preserva o historico e ainda permite upgrade.

## Modelo de dados recomendado em PostgreSQL
## Principios
- modulo independente
- multi-tenant
- sem lojas fixas hardcoded
- sem pesos hardcoded no codigo
- com versionamento de regras
- com historico imutavel de avaliacao

## Tabelas sugeridas
### 1. `indicator_tenants`
Se o modulo for 100% isolado, manter pelo menos:

- `id`
- `external_client_id`
- `name_snapshot`
- `status`
- `created_at`
- `updated_at`

### 2. `indicator_units`
Uma loja/unidade por cliente:

- `id`
- `tenant_id`
- `external_unit_id`
- `code`
- `name`
- `status`
- `created_at`
- `updated_at`

### 3. `indicator_profiles`
Catalogo dos 5 indicadores:

- `id`
- `code` (`indicator_1` ... `indicator_5`)
- `name`
- `class_weight`
- `status`

### 4. `indicator_profile_items`
Itens internos de cada indicador:

- `id`
- `indicator_profile_id`
- `code`
- `name`
- `weight`
- `input_type`
- `sort_order`

Exemplos:

- indicador 1 -> 4 itens booleanos de 25
- indicador 5 -> meta/ticket/desconto com pesos 60/30/10

### 5. `indicator_target_sets`
Conjunto de metas por tenant/unidade e vigencia:

- `id`
- `tenant_id`
- `unit_id`
- `start_date`
- `end_date`
- `return_post_sale_target`
- `nps_total_target` (legado, opcional)
- `revenue_target`
- `avg_ticket_target`
- `max_discount_target`
- `created_by_user_id`
- `created_at`
- `updated_at`

### 6. `indicator_evaluations`
Cabecalho da avaliacao:

- `id`
- `tenant_id`
- `unit_id`
- `external_user_id`
- `evaluator_name_snapshot`
- `period_start`
- `period_end`
- `selected_indicators` (JSONB ou tabela filha)
- `source_channel`
- `status`
- `created_at`
- `updated_at`
- `deleted_at`

Recomendacao:

- preferir tabela filha `indicator_evaluation_indicators`
- evitar CSV

### 7. `indicator_evaluation_indicators`
Relaciona quais indicadores foram avaliados:

- `id`
- `evaluation_id`
- `indicator_profile_id`
- `class_weight_snapshot`

### 8. `indicator_assets`
Arquivos e evidencias:

- `id`
- `tenant_id`
- `evaluation_id`
- `indicator_code`
- `item_code`
- `storage_provider`
- `storage_path`
- `file_name`
- `mime_type`
- `size_bytes`
- `created_at`

### 9. `indicator_1_environment`
- `evaluation_id`
- `coffee_restock_ok`
- `coffee_restock_asset_id`
- `food_display_ok`
- `food_display_asset_id`
- `packaging_ok`
- `packaging_asset_id`
- `mezzanine_ok`
- `mezzanine_asset_id`
- `raw_score`
- `weighted_score`

### 10. `indicator_2_specialist_team`
- `evaluation_id`
- `highest_value`
- `lowest_value`
- `team_balance_diff_percent`
- `team_balance_raw_score`
- `team_balance_weight`
- `leadership_development_raw`
- `leadership_development_weight`
- `sti_external_snapshot`
- `sti_snapshot_source`
- `sti_snapshot_at`
- `satisfaction_external_snapshot`
- `satisfaction_snapshot_source`
- `satisfaction_snapshot_at`
- `satisfaction_weight`
- `sti_weight_snapshot`
- `raw_score`
- `weighted_score`

### 11. `indicator_3_quality_service`
- `evaluation_id`
- `service_nps_raw`
- `service_nps_percent`
- `service_nps_weight`
- `raw_score`
- `weighted_score`

### 12. `indicator_4_branding`
- `evaluation_id`
- `post_sale_return_real`
- `post_sale_return_target_snapshot`
- `post_sale_return_percent`
- `window_standard_ok`
- `window_standard_asset_id`
- `store_gifts_ok`
- `store_gifts_asset_id`
- `dress_code_ok`
- `dress_code_asset_id`
- `raw_score`
- `weighted_score`

### 13. `indicator_5_results`
- `evaluation_id`
- `revenue_real`
- `revenue_target_snapshot`
- `revenue_performance_raw`
- `revenue_performance_capped`
- `avg_ticket_real`
- `avg_ticket_target_snapshot`
- `avg_ticket_performance_raw`
- `avg_ticket_performance_capped`
- `discount_real`
- `discount_target_snapshot`
- `discount_performance`
- `weight_revenue`
- `weight_avg_ticket`
- `weight_discount`
- `raw_score`
- `weighted_score`

### 14. `indicator_dashboard_cache`
Opcional, para acelerar consultas:

- `tenant_id`
- `unit_id` nullable
- `period_start`
- `period_end`
- `cache_key`
- `payload_json`
- `generated_at`
- `source_hash`

## Regras de persistencia no modulo novo
### O que deve ser salvo como snapshot
Salvar sempre na avaliacao:

- pesos usados
- metas usadas
- medias externas usadas
- nome do avaliador naquele momento
- nome da unidade naquele momento, se quiser resiliencia historica

### O que pode continuar vindo de fora em tempo real
Pode vir de fora apenas para:

- autenticar
- listar clientes/unidades
- preencher automaticamente os campos do form

Mas nao para recalcular historico.

## API Go sugerida
### Read APIs
- `GET /v1/indicator-dashboard?tenant_id=&unit_id=&start_date=&end_date=`
- `GET /v1/indicator-evaluations?tenant_id=&unit_id=&start_date=&end_date=&page=`
- `GET /v1/indicator-evaluations/{id}`
- `GET /v1/indicator-profiles`
- `GET /v1/indicator-targets?tenant_id=&unit_id=&date=`
- `GET /v1/indicator-prefill/team-metrics?tenant_id=&unit_id=&start_date=&end_date=`

### Write APIs
- `POST /v1/indicator-evaluations`
- `DELETE /v1/indicator-evaluations/{id}`
- `POST /v1/indicator-assets/presign`
- `POST /v1/indicator-targets`
- `PUT /v1/indicator-targets/{id}`

### Contrato minimo do `POST /indicator-evaluations`
Deve aceitar:

- tenant
- unidade
- usuario avaliador
- periodo
- indicadores selecionados
- payload de cada indicador selecionado
- referencias de assets
- snapshots externos usados no indicador 2

## Servicos Go recomendados
- `EvaluationService`
- `DashboardService`
- `TargetService`
- `ExternalMetricsService`
- `AssetService`
- `AccessPolicyService`

## Composables/store recomendados no Nuxt
- `useIndicatorsFilters`
- `useIndicatorsDashboard`
- `useIndicatorsEvaluations`
- `useIndicatorEvaluationForm`
- `useIndicatorTargets`
- `useIndicatorExternalPrefill`

## Regras de compatibilidade obrigatorias
### 1. O novo modulo precisa manter
- filtro por intervalo com regra de sobreposicao
- cadastro parcial de indicadores na mesma avaliacao
- tabela de avaliacoes
- exclusao de avaliacao completa
- dashboard por unidade
- 5 indicadores com formulas equivalentes
- evidencias por imagem nos indicadores 1 e 4
- metas por unidade
- detalhamento por avaliacao e por unidade

### 2. Upgrades permitidos e recomendados
- stores/unidades dinamicas por cliente
- pesos configuraveis e versionados
- snapshots historicos de dados externos
- API REST limpa e tipada
- testes automatizados das formulas
- storage de arquivos fora do filesystem local
- RBAC real por tenant/perfil
- cache do dashboard
- auditoria e trilha de alteracoes

## Problemas e armadilhas do legado
### Problemas confirmados
1. `content.php` conta avaliacoes por periodo, mas a tabela listada busca todas as avaliacoes sem filtro temporal.
2. O botao de exclusao nao recarrega a tabela depois do sucesso.
3. `DashboardIndicatoresController` imprime `console.log` no meio da geracao.
4. O resumo de melhor/pior indicador no dashboard esta inconsistente porque o controller espera a chave `media` em indicadores que nao a fornecem.
5. O indicador 3 mistura `npsBruto` percentual com exibicao de nota absoluta.
6. O form ainda conversa com `mes` e `ano`, mas a UI atual funciona por range.
7. O nome do arquivo de upload depende de `mes`; como o campo nao vem, ja existem arquivos com `mes__`.
8. O JS do modal tenta preencher STI e Pesquisa 360 via variaveis PHP que nao estao sendo montadas nesta pagina atual.
9. O backend de indicador 2 grava `nota_media_sti` e `pesquisa_360`, mas o calculo atual ignora esses valores e busca tudo de novo externamente.
10. A lista de lojas esta hardcoded em varios lugares: `Riomar`, `Jardins`, `Garcia`, `Treze`.
11. Os modais de detalhe dos indicadores 1, 2, 3, 4 e 5 sao colocados em `ob_start()` e guardados em `$modaisIndicadores`, mas esse array nao e renderizado em nenhum lugar conhecido do fluxo atual.
12. A exclusao remove registros do banco, mas nao remove os arquivos fisicos em `upload-indicadores/`.
13. A configuracao de exportacao da DataTable usa indices de coluna alem do total real de colunas da tabela.

### Consequencia para a migracao
Nao devemos copiar os bugs. Devemos copiar o comportamento de negocio intencional.

## Checklist de migracao
### Fase 1 - Descoberta e congelamento funcional
- validar schema real das tabelas em MySQL
- exportar amostras reais por indicador
- confirmar pesos default que hoje estao no banco
- confirmar metas vigentes por loja
- confirmar se o historico deve continuar por sobreposicao de range

### Fase 2 - Contratos do novo modulo
- definir payload unico de criacao de avaliacao
- definir formato de resposta do dashboard
- definir formato de detalhe por indicador
- definir tenant scoping em todas as rotas

### Fase 3 - Banco Postgres
- criar migrations
- criar tabelas de cabecalho, filhos, metas e assets
- criar indices por `tenant_id`, `unit_id`, `period_start`, `period_end`
- criar estrategia de soft delete e auditoria

### Fase 4 - Backend Go
- implementar repositorios
- implementar servicos de calculo
- implementar snapshots externos
- implementar endpoints REST
- implementar autorizacao por tenant
- implementar testes de formulas

### Fase 5 - Front Nuxt 4
- tela principal
- dashboard
- tabela de avaliacoes
- modal de avaliacao
- modais de detalhe
- upload e preview de imagens
- exportacoes

### Fase 6 - Migracao e validacao
- comparar notas do PHP vs Go para os mesmos periodos
- comparar dashboard por loja
- comparar detalhes por avaliacao
- validar upload e leitura de assets
- validar exclusao e cascata

## Casos de teste obrigatorios
1. Avaliacao com apenas indicador 1.
2. Avaliacao com todos os 5 indicadores.
3. Periodo com sobreposicao parcial.
4. Loja sem nenhuma avaliacao.
5. Indicador 1 com falha e imagem.
6. Indicador 4 com falha e imagem.
7. Indicador 2 sem STI no range, forçando fallback.
8. Indicador 5 sem meta vigente, usando fallback.
9. Exclusao de avaliacao com filhos e assets.
10. Dashboard multi-loja no mesmo periodo.

## Decisao recomendada de produto
Para cada cliente do painel novo:

- o cliente tera suas proprias unidades
- cada unidade tera suas proprias metas
- cada avaliacao ficara vinculada a uma unidade
- o dashboard podera ser visto:
  - por unidade
  - consolidado do cliente

Isso substitui o modelo legado de 4 lojas fixas por um modelo multi-tenant de verdade.

## Fonte de verdade para a reimplementacao
Quando houver conflito entre comportamento visual e codigo:

1. priorizar a formula atual do backend
2. revisar se a view atual esta exibindo algo incorreto
3. manter a intencao do negocio, nao o bug visual

## Resumo executivo
O modulo atual e uma auditoria operacional/comercial por loja, com 5 indicadores ponderados, evidencias por imagem, metas por loja e dashboard consolidado por periodo.

Para recriar corretamente em Nuxt 4 + Go + Postgres:

- manter os 5 indicadores e suas formulas
- transformar lojas hardcoded em unidades por cliente
- separar dependencias externas em integracoes com snapshot
- persistir historico imutavel
- expor API multi-tenant limpa
- cobrir tudo com testes de formula e testes de regressao

Se este arquivo for usado como guia de implementacao, a regra e simples:

- tudo o que esta aqui em "compatibilidade obrigatoria" deve existir
- tudo o que esta em "upgrades permitidos" deve entrar sem quebrar a paridade
