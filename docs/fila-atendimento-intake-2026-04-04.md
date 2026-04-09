# incubadora/fila-atendimento intake - 2026-04-04

Objetivo:

- executar a tarefa `14` do backlog
- separar o que em `incubadora/fila-atendimento/` ja e modulo reaproveitavel
- separar o que e host local de um projeto standalone
- definir o que entra, o que adapta ao shell e o que fica fora neste momento

## Resumo executivo

`incubadora/fila-atendimento/` nao e um rascunho.
Ele ja entrou no repo como uma base funcional, com backend Go, frontend Nuxt, contratos de embed e QA declarativo.

Conclusao desta auditoria:

- o nucleo mais reaproveitavel do projeto ja existe e pode formar o modulo `fila-atendimento`
- o melhor bloco de backend hoje e `operations + reports + analytics + settings`
- `consultants` deve entrar no modulo, mas dividido entre `roster operacional` e `provisionamento de identidade`
- `realtime` e reutilizavel, mas ainda depende do auth e do contexto do projeto standalone
- `auth`, `tenants`, `stores`, `users`, `GET /v1/me/context` e o `docker-compose.yml` proprio devem ser tratados como host local, nao como modulo
- no frontend, `operacao`, `relatorios`, `ranking`, `dados`, `inteligencia` e parte de `configuracoes` podem virar frontend do modulo
- `campanhas` ainda nao esta pronta para entrar como modulo de verdade; hoje e runtime local sem backend proprio
- a maior divida estrutural do frontend esta na camada `app-runtime` e no `dashboard runtime`, que ainda funcionam como ponte de compatibilidade

## Verificacoes executadas

- `go test ./...` em `incubadora/fila-atendimento/back`: passou
- `npm run build` em `incubadora/fila-atendimento/web`: passou
- `docker compose -f incubadora/fila-atendimento/docker-compose.yml config`: passou

Observacao:

- a primeira tentativa do build do Nuxt estourou o timeout curto do comando, mas o build concluiu normalmente quando rodado com janela maior

## Leitura arquitetural atual

### O que o projeto e hoje

`incubadora/fila-atendimento/` chegou como um app quase completo:

- `back/`
  - API Go modular
- `web/`
  - frontend Nuxt 4
- `qa-bot/`
  - runner Python + Playwright com cenarios YAML
- `docs/`
  - backlog e contratos de portabilidade
- `docker-compose.yml`
  - runtime proprio com `postgres + api + web`

### O que ele deve virar aqui

Dentro deste monorepo, o destino certo nao e continuar como produto paralelo.

O destino certo e:

- servir como incubadora do modulo `fila-atendimento`

## Classificacao do backend

### Entra como nucleo do modulo `fila-atendimento`

#### `back/internal/modules/operations`

Estado:

- melhor modulo do projeto em termos de plugabilidade
- ja trabalha com `AccessContext`, `StoreScopeProvider`, `Repository` e `EventPublisher`

Decisao:

- entra no modulo `fila-atendimento`
- deve virar referencia para o resto do backend do modulo

Motivo:

- ja nao depende da regra do host inteiro
- a borda HTTP ja adapta `auth.Principal` para contrato menor

#### `back/internal/modules/reports`

Estado:

- funcional
- payloads ja estao razoavelmente orientados por caso de uso
- ja possui `overview`, `results`, `recent-services` e `multistore-overview`

Decisao:

- entra no modulo `fila-atendimento`

Condicao:

- precisa sair de `auth.Principal` direto e alinhar ao mesmo contrato de `operations`

#### `back/internal/modules/analytics`

Estado:

- funcional
- entrega agregados server-side para `ranking`, `dados` e `inteligencia`

Decisao:

- entra no modulo `fila-atendimento`

Condicao:

- precisa sair de `auth.Principal` direto e alinhar a `AccessContext + StoreScopeProvider`

#### `back/internal/modules/settings`

Estado:

- funcional
- ownership claro do pacote operacional por loja
- ja usa endpoints menores para escrita parcial

Decisao:

- entra no modulo `fila-atendimento`

Observacao:

- este modulo deve continuar dono da configuracao operacional por loja
- ele nao deve virar "configuracoes gerais do painel"

### Entra no modulo, mas com split obrigatorio

#### `back/internal/modules/consultants`

Estado:

- importante para o dominio
- hoje mistura `roster operacional` com `provisionamento de conta real`

Decisao:

- entra parcialmente no modulo `fila-atendimento`

Split recomendado:

- parte do modulo:
  - roster operacional
  - metas por consultor
  - comissao
  - vinculacao `consultants.user_id`
- parte do shell:
  - criacao/inativacao de conta autenticada
  - politica de senha
  - convite
  - papel concreto de auth

Leitura final:

- `consultants` pertence ao dominio `atendimento`
- identidade do consultor nao pertence ao modulo; pertence ao shell

#### `back/internal/modules/realtime`

Estado:

- contrato HTTP ja e leve e orientado a invalidacao
- bom potencial de reaproveitamento
- ainda depende de auth, tenant e store do projeto atual no handshake

Decisao:

- entra como infraestrutura do modulo `fila-atendimento`, mas por adapter

Split recomendado:

- parte do modulo:
  - eventos `operation.updated`
  - eventos de invalidacao do dominio
- parte do shell:
  - autenticacao do socket
  - resolucao do actor
  - validacao de tenant/loja acessiveis

### Nao entra cru no modulo

#### `back/internal/modules/auth`

Papel:

- host local de identidade, login, token, convite, profile e password

Decisao:

- fica fora do modulo `fila-atendimento`
- deve ser substituido pelo shell da plataforma

#### `back/internal/modules/tenants`

Papel:

- host local de tenant

Decisao:

- fica fora do modulo `fila-atendimento`
- deve ser substituido pelo shell

#### `back/internal/modules/stores`

Papel:

- CRUD administrativo de lojas
- escopo de loja do host

Decisao:

- nao entra como modulo `fila-atendimento`
- deve virar provider do shell para `StoreScopeProvider`

Observacao:

- o modulo `fila-atendimento` consome lojas
- ele nao deve ser dono do cadastro principal de lojas

#### `back/internal/modules/users`

Papel:

- administracao de usuarios e acessos do host

Decisao:

- fica fora do modulo `fila-atendimento`
- deve permanecer no shell ou em modulo de identidade/acesso

#### `back/internal/platform/app/*`

Papel:

- wiring do projeto standalone
- composicao de modulos locais

Decisao:

- nao entra como modulo
- serve apenas de referencia para a futura montagem do modulo no shell

## Classificacao do frontend

### Frontend que ja parece modulo `fila-atendimento`

#### Entram com pouca adaptacao

- `web/app/features/operation/*`
- `web/app/pages/operacao/index.vue`
- `web/app/stores/operations.ts`
- `web/app/pages/relatorios.vue`
- `web/app/stores/reports.ts`
- `web/app/pages/ranking.vue`
- `web/app/pages/dados.vue`
- `web/app/pages/inteligencia.vue`
- `web/app/stores/analytics.ts`
- `web/app/composables/useOperationsRealtime.ts`

Leitura:

- isso ja e claramente UI de dominio de atendimento

#### Entram, mas precisam split de host

- `web/app/pages/configuracoes.vue`
- `web/app/stores/settings.ts`
- `web/app/pages/consultor.vue`
- `web/app/stores/consultants.ts`

Leitura:

- pertencem ao dominio `atendimento`
- mas hoje dependem fortemente de `auth`, `activeStore` e `app-runtime`

### Frontend que e host local

- `web/app/stores/auth.ts`
- `web/app/pages/auth/login.vue`
- `web/app/pages/auth/convite/[token].vue`
- `web/app/pages/perfil.vue`
- `web/app/stores/workspace.ts`
- `web/app/pages/multiloja.vue`
- `web/app/stores/multistore.ts`
- `web/app/pages/usuarios.vue`
- `web/app/stores/users.ts`
- `web/app/composables/useContextRealtime.ts`

Leitura:

- isso nao e modulo `fila-atendimento`
- isso e shell, identidade, contexto e administracao

### Frontend que ainda e compatibilidade, nao fronteira final

- `web/app/stores/app-runtime.ts`
- `web/app/stores/dashboard.ts`
- `web/app/stores/dashboard/runtime/*`
- `web/app/utils/runtime-remote.ts`

Leitura:

- esta camada ainda injeta um runtime local comum para varios dominios
- ela ajuda o projeto standalone a funcionar
- mas nao deve ser a fronteira final do modulo plugavel

Risco:

- se copiarmos o modulo "como esta", vamos arrastar um runtime monolitico junto

Decisao:

- incorporar o frontend do modulo por fatias
- reduzir gradualmente a dependencia desse runtime

### Frontend que ainda nao esta pronto para entrar como modulo

- `web/app/pages/campanhas.vue`
- `web/app/stores/campaigns.ts`

Motivo:

- hoje `campaigns` ainda depende de runtime local
- nao tem backend modulo proprio no `back/`
- o proprio backend de `reports` diz que o alinhamento final com `campaigns` ainda e evolucao futura

Decisao:

- nao entra na primeira incorporacao do modulo `fila-atendimento`
- pode virar modulo separado depois, quando existir dominio e backend de verdade

## Classificacao de dados e migrations

### Tabelas que devem pertencer ao modulo `fila-atendimento`

- `consultants`
- `store_operation_settings`
- `store_setting_options`
- `store_catalog_products`
- `operation_queue_entries`
- `operation_active_services`
- `operation_paused_consultants`
- `operation_current_status`
- `operation_status_sessions`
- `operation_service_history`

Observacao importante:

- `consultants` deve continuar referenciando `user_id`, mas como referencia opaca ao shell
- o modulo nao precisa ser dono da tabela de usuarios para ser dono do roster

### Tabelas que devem pertencer ao shell

- `users`
- `user_invitations`
- `tenants`
- `stores`
- `user_platform_roles`
- `user_tenant_roles`
- `user_store_roles`

Leitura:

- esse bloco e identidade, tenancy e escopo
- nao deve ser carregado para dentro do modulo `fila-atendimento`

### Implicacao de migracao

Hoje as migrations de `incubadora/fila-atendimento` misturam host e dominio na mesma trilha.

Na incorporacao, sera preciso separar:

- migrations do shell
- migrations do modulo `fila-atendimento`

## Contratos do shell descobertos por esta auditoria

Os contratos ja previstos no desenho continuam corretos:

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `StoreScopeProvider`
- `ModuleRegistry`
- `AuditSink`
- `DomainEventBus`
- `Clock`
- `PersistenceProvider`

Esta auditoria mostrou que ainda vamos precisar explicitar mais dois contratos:

### `IdentityProvisioner`

Necessario para o pedaÃ§o de `consultants` que hoje cria ou inativa acesso real.

Deve permitir no minimo:

- criar conta vinculada ao consultor
- associar papel/escopo no shell
- forcar troca de senha inicial
- inativar conta vinculada

### `RealtimeContextResolver`

Necessario para o handshake do websocket e para invalidacao administrativa.

Deve permitir no minimo:

- autenticar sessao/token
- resolver actor/tenant/store scope
- validar assinatura por loja
- validar assinatura por tenant

## Classificacao da QA

### Cenarios que devem virar regressao do modulo `fila-atendimento`

- `qa-bot/scenarios/operation_smoke.yaml`
- `qa-bot/scenarios/settings_smoke.yaml`
- `qa-bot/scenarios/reports_smoke.yaml`
- `qa-bot/scenarios/ranking_smoke.yaml`
- `qa-bot/scenarios/data_smoke.yaml`
- `qa-bot/scenarios/intelligence_smoke.yaml`
- `qa-bot/scenarios/consultant_smoke.yaml`

Leitura:

- isso cobre o nucleo funcional do modulo

### Cenarios que devem virar integracao host + modulo

- `qa-bot/scenarios/multistore_smoke.yaml`

Leitura:

- aqui ja aparece tela de host/admin
- nao e smoke puro do modulo

### Cenarios que devem ficar fora da primeira incorporacao

- `qa-bot/scenarios/campaigns_smoke.yaml`

Motivo:

- `campaigns` ainda nao tem backend/modulo consistente

## Redundancias e sobras identificadas

### Nao queremos levar para o modulo final

- `docker-compose.yml` proprio da pasta
- host local inteiro de auth/tenant/user/store
- runtime monolitico de compatibilidade do frontend
- fluxo de `campaigns` ainda local

### Podemos reaproveitar como material de transicao

- `back/CORE_MODULES_PORTABILITY.md`
- `web/PANEL_EMBED_CONTRACT.md`
- `qa-bot/`
- `back/internal/modules/*/AGENT.md`

## Plano de migracao recomendado

### Bloco 1. Contratos e adapters

Antes de mover codigo:

- congelar `ActorContext`, `TenantContext`, `AccessPolicy`, `StoreScopeProvider`
- introduzir `IdentityProvisioner`
- introduzir `RealtimeContextResolver`

### Bloco 2. Backend do modulo

Ordem sugerida:

1. `operations`
2. `reports`
3. `analytics`
4. `settings`
5. `consultants` dividido em roster + adapter de identidade
6. `realtime` adaptado ao shell

### Bloco 3. Frontend do modulo

Ordem sugerida:

1. `operacao`
2. `relatorios`
3. `ranking`, `dados`, `inteligencia`
4. `configuracoes`
5. `consultor`

Regra:

- migrar tirando dependencia do `app-runtime` aos poucos
- nao levar `auth`, `usuarios` e `multiloja` para dentro do modulo

### Bloco 4. QA

- transformar `qa-bot` em suite de regressao do modulo
- separar cenarios de modulo dos cenarios de host

### Bloco 5. Encerramento da incubadora

Depois da incorporacao:

- `incubadora/fila-atendimento/` deixa de ser app standalone
- vira referencia de migracao temporaria
- depois pode ser arquivada ou removida

## Decisao final da tarefa 14

O intake esta aprovado.

`incubadora/fila-atendimento/` deve seguir como:

- candidato principal para formar o modulo `fila-atendimento`

Fronteira proposta:

- entra no modulo:
  - `operations`
  - `reports`
  - `analytics`
  - `settings`
  - `consultants` com split
  - `realtime` com adapter
  - frontend de `operacao`, `relatorios`, `ranking`, `dados`, `inteligencia`, `configuracoes`, `consultor`
  - QA declarativa dos fluxos do dominio
- fica no shell:
  - `auth`
  - `tenants`
  - `stores`
  - `users`
  - sessao/contexto
  - navegacao global
  - multiloja administrativa
- fica fora por enquanto:
  - `campanhas`
  - compose proprio
  - runtime monolitico como fronteira final



