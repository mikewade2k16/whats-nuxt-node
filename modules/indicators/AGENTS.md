# AGENTS.md - modules/indicators

## Identidade do modulo

- papel: modulo plugavel de indicadores operacionais, comerciais e de qualidade, com configuracao por template, perfil por cliente, override opcional por loja, dashboard agregado e snapshots historicos
- status: hospedado na stack principal, com backend real no `plataforma-api`, front real no `painel-web` e smoke validado no runtime local
- entrada atual no host: `/admin/indicadores`
- superficies alvo no host:
  - `/admin/indicadores` como workspace operacional do cliente
  - `/admin/indicadores/configuracoes` como configuracao do perfil ativo do cliente
  - `/admin/manage/indicadores` como governanca root de templates, defaults e catalogo global

## Responsabilidades

- manter uma biblioteca global de templates reutilizaveis de indicadores, versionada e auditavel
- manter perfis ativos por cliente, com possibilidade de renomear indicadores, alterar pesos, trocar campos, exigir imagem e ativar ou desativar indicadores
- suportar indicadores nativos do modulo e indicadores derivados de outros modulos por contratos explicitos de provider
- organizar indicadores por tipo e categoria, com taxonomia inicial prevista para:
  - `operacao-loja`
  - `provas-loja`
  - `fila-atendimento`
  - `atendimento-online`
  - `comercial`
  - `custom`
- consolidar nota por item, por indicador, por categoria, por loja e por cliente
- suportar clientes single-store e multi-store, com escopo global por cliente como default e breakdown por loja quando habilitado
- publicar ranking de lojas, visao geral do cliente, comparativos entre categorias e drilldown para localizar gargalo geral ou local
- manter metas, pesos, evidencias e snapshots historicos imutaveis das avaliacoes
- preservar compatibilidade funcional com a referencia legada da pasta raiz `indicators/`

## Contratos que consome

- obrigatorios:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
  - `UnitsDirectory`
  - `StoreScopeProvider`
  - `PersistenceProvider`
  - `AssetStorage`
  - `ModuleRegistry`
  - `Clock`
- opcionais:
  - `FilaAtendimentoMetricsProvider`
  - `AtendimentoOnlineMetricsProvider`
  - `SalesMetricsProvider`
  - `ExternalMetricsProvider`
  - `UsersDirectory`
  - `AuditSink`
  - `DomainEventBus`
  - `RealtimePublisher`

## Contratos que exporta

- pagina wrapper hospedada no painel admin
- pagina de configuracao do perfil ativo do cliente
- pagina root de governanca de templates e defaults gerais
- rota BFF administrativa de exportacao real em `GET /api/admin/indicators/export`
- DTOs publicos de:
  - dashboard consolidado do cliente
  - overview por loja
  - ranking de lojas
  - listagem e detalhe de avaliacoes
  - listagem e detalhe de templates
  - perfil ativo do cliente e overrides por loja
  - metas, evidencias e status de providers
- contrato unificado de indicador com campos logicos como:
  - `category`
  - `source_kind`
  - `source_module`
  - `scope_mode`
  - `aggregation_mode`
  - `value_type`
  - `weight`
  - `evidence_policy`
- rotas HTTP para dashboard, templates, perfis, avaliacoes, metas, snapshots e assets
- snapshots publicados como contrato de leitura do modulo

## Protocolo de integracao

- entrada: `HTTP + JSON` na borda canonica do shell
- saida: DTOs leves de lista, detalhe, dashboard e configuracao
- regra: o modulo usa auth do shell; nenhuma sessao paralela deve ser criada
- regra: indicadores de outros modulos entram por provider/adapter ou snapshot publicado, nunca por leitura direta de tabela externa
- regra: `billing_mode` do cliente pode sugerir um default de escopo no onboarding, mas nao governa o dominio de indicadores
- regra: cada avaliacao salva snapshot completo da configuracao aplicada no momento da coleta
- hierarquia de agregacao alvo:
  - `item -> indicador -> categoria -> nota da loja -> nota geral do cliente`
- excecao de agregacao:
  - quando `scope_mode = client_global`, a camada de loja pode ser omitida naquele indicador, mas o dashboard do cliente continua podendo exibir ranking apenas para os indicadores que suportam store breakdown
- regra de composicao:
  - indicadores nativos e indicadores derivados de outros modulos devem convergir para o mesmo contrato de score antes de entrar no dashboard consolidado

## Persistencia sob responsabilidade do modulo

- schema alvo: `indicators`
- tabelas alvo:
  - `indicator_templates`
  - `indicator_template_versions`
  - `indicator_template_categories`
  - `indicator_template_indicators`
  - `indicator_template_indicator_items`
  - `indicator_provider_bindings`
  - `indicator_profiles`
  - `indicator_profile_indicator_overrides`
  - `indicator_profile_indicator_items`
  - `indicator_profile_store_overrides`
  - `indicator_target_sets`
  - `indicator_target_items`
  - `indicator_evaluations`
  - `indicator_evaluation_categories`
  - `indicator_evaluation_indicators`
  - `indicator_evaluation_items`
  - `indicator_metric_snapshots`
  - `indicator_assets`
- migracoes ja implementadas:
  - `0020_seed_indicators_module.sql`
  - `0021_backfill_root_active_modules.sql`
  - `0022_indicators_foundation.sql`
  - `0023_indicators_governance.sql`
  - `0024_seed_indicators_default_template.sql`
  - `0025_restore_root_tenant_active.sql`
- storage: assets de evidencia do modulo e anexos de auditoria
- referencia legada: a fonte funcional atual continua documentada em `indicators/AGENTS.md`; as tabelas legadas dos 5 indicadores servem como referencia de migracao e nao como alvo final do desenho

## Endpoints, filas e interfaces expostas

- atual:
  - `GET /admin/indicadores` no host do painel
- host alvo:
  - `GET /admin/indicadores/configuracoes`
  - `GET /admin/manage/indicadores`
- core alvo:
  - `GET /core/modules/indicators/v1/dashboard`
  - `GET /core/modules/indicators/v1/dashboard/stores`
  - `GET /core/modules/indicators/v1/governance`
  - `PATCH /core/modules/indicators/v1/governance/policies/{policyId}`
  - `GET /core/modules/indicators/v1/templates`
  - `GET /core/modules/indicators/v1/templates/{id}`
  - `POST /core/modules/indicators/v1/templates`
  - `PATCH /core/modules/indicators/v1/templates/{id}`
  - `GET /core/modules/indicators/v1/profiles/active`
  - `PUT /core/modules/indicators/v1/profiles/active`
  - `GET /core/modules/indicators/v1/profiles/active/stores/{storeId}`
  - `PUT /core/modules/indicators/v1/profiles/active/stores/{storeId}`
  - `GET /core/modules/indicators/v1/evaluations`
  - `GET /core/modules/indicators/v1/evaluations/{id}`
  - `POST /core/modules/indicators/v1/evaluations`
  - `DELETE /core/modules/indicators/v1/evaluations/{id}`
  - `GET /core/modules/indicators/v1/targets`
  - `PUT /core/modules/indicators/v1/targets`
  - `POST /core/modules/indicators/v1/assets/presign`
  - `POST /core/modules/indicators/v1/providers/snapshot`

## Estado operacional atual

- `apps/painel-web/app/composables/useIndicatorsData.ts` usa `/core/modules/indicators/v1` como base real do modulo no proxy do painel
- o painel ja consome backend real para workspace, configuracao ativa, governanca e exportacao
- a exportacao administrativa real roda em `apps/painel-web/server/api/admin/indicators/export.get.ts` e usa `xlsx` e `pdf-lib` no runtime do painel para gerar CSV, XLSX e PDF
- o template sistêmico `indicators_default` ja nasce semeado pela migration `0024`, evitando falha de bootstrap do perfil ativo
- o tenant `root` (`legacy_id = 7`) foi restaurado pela migration `0025`; o caminho root com `clientId=7` voltou a responder `200` em `profiles/active` e `dashboard`
- o runtime local do `painel-web` passou a usar `apps/painel-web/scripts/container-entrypoint.sh`, que reconcilia `node_modules` por hash de `package.json` e `package-lock.json` para evitar dependencia stale em server routes novas

## Eventos e sinais de integracao

- publicados:
  - nenhum evento de dominio formal no momento
  - alvo futuro:
    - `indicators.profile.updated`
    - `indicators.evaluation.created`
    - `indicators.dashboard.snapshot.updated`
- consumidos:
  - nenhum evento de dominio formal no momento
  - alvo futuro:
    - `fila-atendimento.metrics.snapshot.ready`
    - `atendimento-online.metrics.snapshot.ready`
    - `external-metrics.snapshot.ready`

## O que o modulo nao pode conhecer

- sessao paralela ao shell
- detalhes internos de tabela de outros modulos
- layout concreto do painel como dependencia de dominio
- regra interna de `finance`, `atendimento`, `fila-atendimento` ou `atendimento-online`
- regra de cobranca como controlador do dominio de indicadores
- recalculo historico ao vivo com dados externos mutaveis depois do snapshot salvo
- autenticacao interna de providers externos ou detalhes de transporte que nao facam parte do contrato logico

## Checks minimos de mudanca

- `npm --prefix apps/painel-web run build`
- `go test ./...` quando o backend hospedado do modulo existir
- comparar formulas, pesos e snapshots com a referencia em `indicators/AGENTS.md`
- quando houver mudanca de migration ou dependencia do painel ligada ao modulo, recriar `plataforma-api` e `painel-web` e validar o fluxo root com `clientId=7`
- validar pelo menos os cenarios:
  - cliente single-store com perfil global
  - cliente multi-store com perfil global
  - cliente multi-store com override por loja
  - indicador derivado de `fila-atendimento` ou `atendimento-online` convertido para o contrato unificado do modulo