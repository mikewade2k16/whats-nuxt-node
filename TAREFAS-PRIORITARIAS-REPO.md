# TAREFAS-PRIORITARIAS-REPO

Snapshot salvo em `2026-04-03` para preservar o contexto da auditoria do repo.
Ultima atualizacao: `2026-04-04`.

Objetivo:

- registrar o que precisa ser feito agora
- manter a ordem de ataque das correcoes
- evitar perder contexto sobre auth, tenants, modulos, legado e redundancias

## Ordem executiva combinada em `2026-04-04`

Sequencia atual decidida para os itens restantes:

1. `13` reavaliar quantos servicos Docker realmente precisam ficar separados
2. `10` criar padrao de `AGENTS.md` por modulo com dependencias declaradas
3. `15` incorporar `incubadora/fila-atendimento` ao painel como modulo plugavel `fila-atendimento`
4. `4` restaurar build verde do `apps/painel-web`
5. subir na VPS, validar online e rodar smoke real do fluxo principal
6. `16` planejar a convergencia do backend de `atendimento` de Node para Go, bem mais para frente

Observacao:

- o item `16` nao entra agora; ele fica explicitamente pos-VPS e pos-validacao online

## P0 - Corrigir a base estrutural

### [x] 1. Unificar auth de verdade no `plataforma-api`

Status atual:

- HTTP e Socket.IO do `apps/atendimento-online-api` aceitam `core token` como sessao principal
- o login principal do painel nasce direto de `POST /core/auth/login`
- `POST /session/context` reaproveita o mesmo token do `plataforma-api` e so atualiza o contexto operacional de tenant
- o tenant selecionado agora trafega como contexto explicito via `x-selected-tenant-slug` em HTTP, fetch direto e Socket.IO
- `POST /auth/session` foi removido
- o front ganhou `useAdminSession` para hidratar, limpar e validar consistencia entre `auth` e `core-auth`
- middleware de admin agora derruba "meia sessao" em vez de deixar estado mascarado no painel
- o fallback final de JWT local foi removido do `apps/atendimento-online-api`
- a auditoria `test:tenant:isolation` foi alinhada ao contrato real de tenant explicito via header

Problema atual:

- o `plataforma-api` autentica
- o `apps/atendimento-online-api` usa shadow local apenas para IDs operacionais
- o browser ainda espelha contexto em `core` + `omni`, mas sem segunda autenticacao real

Fazer:

- manter o shadow local minimo e sob controle
- seguir removendo documentacao e nomenclatura legada conforme aparecer
- usar `x-selected-tenant-slug` sempre que o tenant exibido nao puder ser inferido apenas do token canonico do core

Criterio de pronto:

- auth centralizada no core
- sem permissao real baseada apenas em JWT local do modulo
- sem auth paralela mascarando RBAC

### [x] 2. Alinhar seeds, CI e documentacao de tenants

Status:

- `plataforma-api` passou a semear `acme-core` via migration `0016_seed_acme_core_tenant.sql`
- `apps/atendimento-online-api` e `plataforma-api` voltaram a concordar sobre `demo`/`acme`
- `README.md`, `apps/plataforma-api/README.md` e `docs/ci-github-actions.md` foram alinhados
- `npm run test:tenant:isolation` voltou a passar

Problema atual:

- `apps/atendimento-online-api` seed assume `demo` e `acme`
- `plataforma-api` nao garante `acme`
- `npm run test:tenant:isolation` falha no login do `acme`
- docs e CI assumem um estado que o banco/core nao garante

Fazer:

- decidir qual conjunto de tenants seed oficial sera mantido
- alinhar `apps/atendimento-online-api/prisma/seed.ts` com o seed/migrations do `plataforma-api`
- alinhar `README.md`
- alinhar `docs/ci-github-actions.md`
- alinhar scripts que assumem `demo` e `acme`

Criterio de pronto:

- `test:tenant:isolation` passa sem ajuste manual
- docs de seed batem com o estado real

### [x] 3. Restaurar build verde do `apps/atendimento-online-api`

Status:

- `npm run prisma:generate` passa
- `npm run build` passa
- o drift principal de compile do modulo foi removido nesta fase do P0

Problema atual:

- compile quebra no fluxo de multi-instancia WhatsApp
- drift entre `schema.prisma`, Prisma Client e codigo

Hotspots:

- `apps/atendimento-online-api/src/routes/tenant/routes-core.ts`
- `apps/atendimento-online-api/src/routes/tenant/routes-whatsapp-instances.ts`
- `apps/atendimento-online-api/src/services/whatsapp-instances.ts`
- `apps/atendimento-online-api/prisma/schema.prisma`

Fazer:

- revisar schema Prisma vs banco real
- revisar selects/includes tipados
- revisar enum `WhatsAppInstanceUserScopePolicy`
- garantir `npm run prisma:generate`
- garantir `npm run build`

Criterio de pronto:

- `apps/atendimento-online-api` compila local e no container

### [ ] 4. Restaurar build verde do `apps/painel-web`

Problema atual:

- no host Windows o build pode cair por binding opcional nativo
- no container o build nao falhou rapido nesta rodada: `docker compose exec painel-web npm run build` ficou preso por mais de 10 minutos e deixou o container em estado ruim para inspecao, indicando que alem de memoria pode existir gargalo de processo/bundle server

Status:

- nova tentativa no host confirmou erro imediato de ambiente: `oxc-transform` nao conseguiu carregar `@oxc-transform/binding-win32-x64-msvc` (`not a valid Win32 application`)
- a aplicacao continua servindo `http://localhost:3000/admin/login` com `200`, entao o bloqueio atual e de build/toolchain, nao de runtime basico
- o Docker local continua degradado para esse item: `docker ps` e outras inspecoes simples seguem expirando enquanto o `painel-web` responde HTTP
- apos a renomeacao semantica, 
pm run build em pps/painel-web continuou sem concluir no host e expirou por timeout (124s), sem indicar erro imediato novo de path/import causado pelo rename

Fazer:

- validar se o problema principal e memoria do build ou peso do bundle server
- revisar `NODE_OPTIONS` do `painel-web`
- medir se existe rota/modulo inflando demais o build
- validar build no container como referencia principal

Criterio de pronto:

- `docker compose exec painel-web npm run build` passa
- documentar qualquer requisito especial de host Windows se ainda existir

## P1 - Fechar o legado com seguranca

### [x] 5. Renomear pastas e servicos com semantica clara

Status:

- o rename fisico foi executado em `2026-04-04`
- `apps/omni-nuxt-ui` virou `apps/painel-web`
- `apps/api` virou `apps/atendimento-online-api`
- `apps/platform-core` virou `apps/plataforma-api`
- `fila-atendimento` virou `incubadora/fila-atendimento`
- `docker-compose*.yml`, `Caddyfile`, scripts operacionais, CI e docs de VPS foram alinhados
- o gateway externo ficou padronizado como `whatsapp-evolution-gateway`
- a proxima etapa estrutural deixa de ser rename semantico e passa a ser extracao gradual para `modules/`

Problema que existia:

- os nomes antigos confundiam papel real de cada parte
- havia mistura entre nome tecnico legado, nome de dominio e nome de runtime

Feito:

- fechar a nomenclatura oficial do repo
- executar o rename fisico dos apps
- alinhar compose, docs, CI, scripts e deploy com os novos nomes

Estado oficial desta fase:

- `apps/painel-web`
- `apps/plataforma-api`
- `apps/atendimento-online-api`
- `incubadora/fila-atendimento`
- servicos Docker `painel-web`, `plataforma-api`, `atendimento-online-api`, `atendimento-online-worker`, `atendimento-online-retencao-worker` e `whatsapp-evolution-gateway`
- `old_web` removido do repositorio; nao manter novo legado com nome historico

Criterio de pronto:

- qualquer pessoa nova entende o papel de cada app pelo nome da pasta
- docs, compose, CI e AGENTS usam a mesma linguagem

### [x] 5. Migrar os testes de composables de `old_web`

Status:

- `apps/painel-web` ganhou `vitest.config.ts`, `tests/setup.ts` e suite propria em `tests/composables/*`
- `apps/painel-web/package.json` agora expoe `test`, `test:watch` e `test:composables`
- `npm run test:composables` em `apps/painel-web` passou com `12/12`
- `old_web` deixou de ser dependencia tecnica para rodar os testes de composables

Problema atual:

- `old_web` nao esta em runtime
- antes guardava o unico harness de testes do omnichannel

Fazer:

- migrar `old_web/tests/composables/*`
- migrar `old_web/tests/setup.ts`
- migrar `old_web/vitest.config.ts`
- criar script equivalente no `apps/painel-web`

Criterio de pronto:

- `apps/painel-web` possui seu proprio `test:composables`
- `old_web` deixa de ser necessario para testes

### [x] 6. Revisar referencias restantes do front legado

Status:

- readmes, AGENTS e docs operacionais foram alinhados para refletir o front ativo em `apps/painel-web`
- `old_web` deixou de aparecer como dependencia tecnica em runtime, testes e onboarding
- o harness de composables permaneceu no front ativo com `12/12` passando

Pre-condicao:

- tarefa 5 concluida

Fazer:

- revisar referencias restantes em docs
- atualizar readmes e AGENTS que ainda citarem o legado como dependencia

Criterio de pronto:

- `old_web` deixa de ser dependencia tecnica

### [x] 7. Remover ou arquivar `old_web`

Status:

- a auditoria confirmou ausencia de referencias de runtime, build e deploy para `old_web`
- a pasta `old_web` foi removida do repositorio em `2026-04-04`
- a documentacao operacional deixou de tratar o legado como snapshot ativo

Pre-condicao:

- tarefa 6 concluida

Fazer:

- revisar referencias restantes em docs
- remover a pasta do repo ou arquivar formalmente
- atualizar readmes e AGENTS que ainda citarem o legado como dependencia

Criterio de pronto:

- `old_web` deixa de ser dependencia tecnica

### [x] 8. Renomear arquivos principais com nome legado

Status:

- `apps/atendimento-online-api/src/routes/tenant/register-routes.ts` passou a ser a implementacao real do registrador de `/tenant`
- `apps/atendimento-online-api/src/routes/tenant/tenant-legado.ts` foi removido
- `apps/atendimento-online-api/src/routes/webhooks/old_webhook.ts` foi removido por estar fora do runtime e sem referencias de codigo
- `apps/atendimento-online-api/src/routes/conversations/conversations-backup.ts` e `apps/atendimento-online-api/src/routes/tenant/tenant-backup.ts` foram removidos por estarem fora do runtime e servirem apenas como rollback morto
- documentacao viva foi alinhada para refletir a estrutura sem nomes legados no caminho principal
- `npm run build` em `apps/atendimento-online-api` continuou verde apos a limpeza
- `npm run test:tenant:isolation` ficou momentaneamente bloqueado por `plataforma-api` fora do ar em `http://localhost:8080`, nao por regressao do corte estrutural

Problema atual:

- existiam arquivos com nome legado no caminho principal
- isso embaralhava onboarding e manutencao

Fazer:

- renomear registradores que hoje ja sao o caminho oficial
- manter nomes coerentes com o uso atual

Hotspots:

- `apps/atendimento-online-api/src/routes/tenant/register-routes.ts`
- outros `*-legado.ts` que ainda vierem a surgir como entrypoint principal

Criterio de pronto:

- nomes refletem funcao atual
- legado fica so onde for realmente legado

## P2 - Endurecer isolamento e modularidade

### [x] 9. Definir arquitetura modular plugavel com modulo pai

Status:

- arquitetura-alvo documentada em `ARQUITETURA-MODULAR-ALVO.md`
- shell/modulo pai, contratos minimos e direcao de modularizacao ja estao registrados
- extracao real fica para as fases posteriores

Objetivo arquitetural:

- cada modulo deve ser independente o suficiente para viver em outro projeto
- um modulo nao deve depender de detalhes internos de outro
- o sistema precisa ter um modulo pai/shell que injeta contexto comum sem acoplar dominio

Modelo desejado:

- cada modulo tem seu proprio:
  - backend
  - frontend
  - migrations
  - DTOs/contratos
  - `AGENTS.md`
- cada modulo declara apenas o que precisa para funcionar
- o modulo pai fornece capacidades comuns como:
  - auth
  - tenant atual
  - actor atual
  - controle de modulos ativos
  - feature flags
  - auditoria
  - eventos e observabilidade

Exemplo de regra:

- `finance` nao deve conhecer internals de `users`, `clients` ou `auth`
- `finance` deve depender apenas de contratos como:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
  - `Clock`
  - `Storage`
- quem resolve usuario, tenant, multitenancy e escopo e o modulo pai/shell

Fazer:

- desenhar a arquitetura-alvo em documento proprio
- definir o que e modulo de dominio e o que e modulo pai/shell
- listar contratos minimos que qualquer modulo pode importar do shell
- proibir import direto entre modulos de dominio
- criar padrao de export/import de contratos, nao de implementacao

Direcao sugerida:

- modulo pai:
  - responsavel por auth, tenant, RBAC, registry de modulos, contexto e integracao
- modulos de dominio:
  - `finance`
  - `atendimento`
  - futuros `crm`, `site`, `kanban`
- shared contracts:
  - pacote ou pasta de contratos comuns
  - tipos de contexto e interfaces de capability

Perguntas que este desenho precisa responder:

- como um modulo recebe `actor/tenant/access` sem importar internals do core?
- como o front de cada modulo descobre rotas, menus e capacidades ativas?
- como um modulo roda sozinho em outro projeto sem puxar meio monorepo junto?
- como migrations e tabelas ficam isoladas por modulo?

Criterio de pronto:

- existe arquitetura-alvo documentada
- cada modulo tem fronteira clara
- dependencia entre modulos passa apenas por contrato
- modulo de dominio pode ser extraido com muito menos atrito

### [x] 10. Criar padrao de `AGENTS.md` por modulo com dependencias declaradas

Status:

- o template canonico foi criado em `docs/padrao-agents-modulo.md`
- `AGENTS.md` da raiz e `apps/plataforma-api/AGENTS.md` passaram a exigir o novo formato para modulos
- os modulos `domain/auth`, `domain/core`, `domain/finance`, `apps/atendimento-online-api` e `incubadora/fila-atendimento` ja foram alinhados ao padrao novo
- o contrato minimo agora ficou explicito: responsabilidades, contratos consumidos, contratos exportados, persistencia, interfaces expostas, eventos, limites de conhecimento e checks minimos

Objetivo:

- cada modulo deve explicar claramente do que precisa
- a dependencia deve ser conceitual e por contrato, nao por implementacao concreta

Exemplo desejado:

- `finance` declara:
  - precisa de `ActorContext`
  - precisa de `TenantContext`
  - precisa de `AccessPolicy`
  - precisa de `Persistence`
  - nao depende de `users` ou `clients` concretos

Fazer:

- padronizar template de `AGENTS.md` por modulo
- adicionar secao fixa:
  - responsabilidades
  - contratos que consome
  - contratos que exporta
  - tabelas/migrations
  - endpoints
  - eventos
  - o que nao pode conhecer

Criterio de pronto:

- qualquer modulo novo nasce com esse template
- fica claro o que ele consome e o que ele oferece

### [x] 11. Fechar o fail-open de acesso ao modulo atendimento

Status:

- `resolveTenantHasAtendimentoModule` agora falha fechado (`fail-closed`)
- erro/fallback de consulta no core nao libera mais acesso silenciosamente

Problema atual:

- em fallback, a checagem de modulo pode liberar `true`

Fazer:

- revisar `resolveTenantHasAtendimentoModule`
- mudar comportamento para fail-closed quando o core nao confirmar acesso
- documentar excecoes, se existirem

Criterio de pronto:

- sem liberacao de modulo por erro/fallback silencioso

### [x] 12. Revisar falhas atuais do `security-access-audit`

Status:

- gate de `finance` foi alinhado com a regra documentada: cliente com modulo ativo libera `finance` para os perfis padrao (`admin`/`finance`) sem exigir alocacao individual igual ao `atendimento`
- o BFF/server do Nuxt e o `session-simulation` do front agora aplicam a mesma regra para `finance`
- o `security-access-audit` foi corrigido para usar UUID real das planilhas financeiras nos cenarios de editar/excluir
- `node scripts/security-access-audit.mjs` agora fecha `40/40`

Sintoma:

- tenant admin com modulo `finance` esta recebendo `403` onde o audit esperava acesso

Fazer:

- revisar gate de finance no front e no BFF
- revisar modulos ativos e contexto do tenant
- revisar se o problema e permissao, seed ou expectativa do audit

Criterio de pronto:

- `node scripts/security-access-audit.mjs` com todos os cenarios verdes

### [x] 13. Reavaliar quantos servicos Docker realmente precisam ficar separados

Status:

- auditoria consolidada em `docs/runtime-servicos-2026-04-04.md`
- `atendimento-online-worker` foi confirmado como servico que deve continuar separado no runtime atual
- `atendimento-online-retencao-worker` foi classificado como candidato real a fusao futura no worker principal
- `whatsapp-evolution-gateway` foi mantido como opcional via `profile: channels`
- `adminer` e `redis-commander` foram mantidos fora do boot padrao via `profile: ops`
- a decisao foi registrada sem fazer refactor prematuro de runtime antes da estabilizacao do modulo e da validacao online na VPS

Pergunta a responder:

- `atendimento-online-worker` e `atendimento-online-retencao-worker` precisam continuar separados?
- `whatsapp-evolution-gateway` deve continuar opcional por profile?
- ferramentas `ops` devem continuar fora do boot padrao?

Direcao sugerida:

- manter `atendimento-online-worker` enquanto outbound usar BullMQ
- avaliar se `atendimento-online-retencao-worker` pode virar job agendado no worker principal
- manter `whatsapp-evolution-gateway` opcional
- manter `adminer` e `redis-commander` fora do boot padrao

Criterio de pronto:

- desenho de runtime mais simples, sem perder fila nem manutencao

### [x] 14. Auditar `incubadora/fila-atendimento` como modulo candidato de `fila-atendimento`

Status:

- intake concluido em `docs/fila-atendimento-intake-2026-04-04.md`
- fronteira entre shell e modulo candidato foi explicitada
- backend/frontend/QA ja foram classificados entre "entra", "adapta" e "fica fora"

Contexto:

- `incubadora/fila-atendimento` entrou no repo em `2026-04-04`
- ele veio com `web/` Nuxt, `back/` Go, docs de portabilidade e `qa-bot`
- ele ainda esta standalone, com auth, tenants, stores e compose proprios

Objetivo:

- descobrir o que desse projeto vira modulo reaproveitavel
- descobrir o que e host local e precisa ser descartado ou adaptado

Mapear:

- `back/internal/modules/operations`
- `back/internal/modules/realtime`
- `back/internal/modules/reports`
- `back/internal/modules/analytics`
- `back/internal/modules/settings`
- `web/app/features/operation`
- `web/PANEL_EMBED_CONTRACT.md`
- `back/CORE_MODULES_PORTABILITY.md`
- `qa-bot/scenarios/*`

Responder:

- o que vira backend do modulo `fila-atendimento`
- o que vira frontend do modulo `fila-atendimento`
- o que vira suite de regressao do modulo
- o que e auth/tenant/store/user local e nao deve entrar cru no shell

Criterio de pronto:

- intake documentado
- fronteira modulo vs host local explicitada
- plano de migracao backend/frontend/QA separado

### [ ] 15. Incorporar `incubadora/fila-atendimento` ao painel como modulo plugavel `fila-atendimento`

Status atual:

- o scaffold oficial do modulo foi criado em `modules/fila-atendimento/`
- o modulo ja possui `AGENTS.md`, `module.manifest.json`, plano de incorporacao e ownership inicial de backend/frontend/contracts/migrations/tests/qa
- a fronteira oficial do modulo saiu da incubadora isolada e passou a existir no monorepo principal
- o codigo principal do modulo continua na incubadora, mas a primeira integracao real ja entrou no runtime principal
- `fila-atendimento` foi separado semanticamente de `atendimento-online` para evitar colisao de dominio e nomenclatura
- o protocolo de orquestracao shell <-> modulo por JSON foi formalizado em `docs/protocolo-orquestracao-modulos.md` e `packages/shell-contracts/*`
- o runtime oficial deixou de subir containers paralelos do modulo; agora o backend do `fila-atendimento` roda dentro do `plataforma-api`, o front entra pelo `painel-web` e a persistencia usa o mesmo `postgres` com schema `fila_atendimento`
- `apps/painel-web` ganhou a rota `/admin/fila-atendimento` e os endpoints `bootstrap`, `session`, `context`, `operations-snapshot` como host real do modulo dentro do shell
- o host do modulo foi corrigido para usar `useBffFetch` com `x-core-token` nas rotas do shell, sem depender de navegacao crua sem header de auth
- o shell bridge do `fila-atendimento` agora carrega `tenantSlug` e `scopeMode` explicitamente, reduzindo inferencia acoplada no backend do modulo
- o backend de `incubadora/fila-atendimento` agora aceita `POST /v1/auth/shell/exchange` e troca esse bridge por sessao propria do modulo
- o backend do modulo corrigiu a rotacao de identidade externa do shell para nao quebrar quando `provider + user_id` permanecem e o `external_subject` muda
- o build do container `plataforma-api` foi validado localmente com `.dockerignore` e `docker compose up -d --build`
- a stack oficial subiu localmente com `postgres`, `redis`, `plataforma-api`, `atendimento-online-api`, `painel-web`, `atendimento-online-worker` e `atendimento-online-retencao-worker`
- smoke via HTTP passou em `GET /health` do `plataforma-api`, `GET /core/modules/fila-atendimento/healthz`, `GET /health` do `atendimento-online-api` e `GET /admin/login` do `painel-web`
- smoke integrado do host passou com `POST /api/core-bff/core/auth/login`, `GET /api/admin/modules/fila-atendimento/bootstrap`, `POST /api/admin/modules/fila-atendimento/session`, `GET /api/admin/modules/fila-atendimento/context` e `GET /api/admin/modules/fila-atendimento/operations-snapshot`
- smoke no navegador passou em `http://localhost:3000/admin/fila-atendimento`, com o botao `Conectar modulo` mudando para `Reconectar modulo` e o estado da sessao indo para `Conectado`
- o bloqueio restante para fechar o item nao e mais runtime ou compose: agora ele esta concentrado em absorver frontend/backend do modulo para dentro da fronteira oficial `modules/fila-atendimento/`, reduzindo dependencia da `incubadora/`

Pre-condicoes:

- Fase 1 concluida
- contratos do shell congelados
- tarefa 14 concluida

Fazer:

- adaptar a incorporacao para o modelo em que o modulo declara dependencias e o shell orquestra o contexto
- adaptar backend para `ActorContext`, `TenantContext`, `AccessPolicy`, `StoreScopeProvider` e eventos do shell
- acoplar frontend ao host web via registry de rotas, menus e capacidades
- definir ownership das migrations do modulo
- transformar contratos de embed em contrato oficial de modulo
- decidir destino do `qa-bot` e cenarios smoke
- desmontar gradualmente o Compose proprio da pasta quando o modulo estiver absorvido
- subir um conjunto limpo de `plataforma-api` + `atendimento-online-api` ou validar direto na VPS antes de fechar o smoke final do item

Checklist objetivo do que falta no backend:

- [ ] absorver `operations`
- [ ] absorver `reports`
- [ ] absorver `analytics`
- [ ] absorver `settings`
- [ ] dividir `consultants` entre roster do modulo e `IdentityProvisioner`
- [ ] adaptar `realtime` ao shell com `RealtimeContextResolver`
- [ ] retirar dependencia estrutural de `auth`, `tenants`, `stores` e `users` locais
- [ ] consolidar ownership de migrations e tabelas no schema `fila_atendimento`

Checklist objetivo do que falta no frontend:

- [ ] trazer a tela `operacao`
- [ ] trazer a tela `relatorios`
- [ ] trazer a tela `ranking`
- [ ] trazer a tela `dados`
- [ ] trazer a tela `inteligencia`
- [ ] trazer a tela `configuracoes`
- [ ] trazer a tela `consultor`
- [ ] migrar stores e composables do dominio para a fronteira oficial do modulo
- [ ] remover dependencia rigida de `app-runtime` e `dashboard runtime`

Observacao importante:

- o host integrado no `painel-web` ja esta funcionando
- o que falta agora nao e infra
- o que falta agora e trazer o produto real do modulo para dentro da plataforma

Criterio de pronto:

- `fila-atendimento` roda dentro do painel principal sem host paralelo
- auth e tenant passam pelo shell da plataforma
- integracoes opcionais entram por contrato e nao por query direta em outro modulo
- modulo continua com fronteira clara e possibilidade real de extracao futura

### [ ] 16. Planejar a convergencia do backend de `atendimento` de Node para Go

Contexto:

- hoje o backend operacional do WhatsApp/atendimento que esta em runtime principal vive no `apps/atendimento-online-api` e e Node/Fastify
- essa convergencia deve acontecer depois da estabilizacao da base e da evolucao do proprio modulo `atendimento-online`

Regra:

- nao misturar agora a limpeza de auth/tenants/legado com uma migracao completa de runtime de linguagem
- primeiro estabilizar o shell, os contratos e a entrada do modulo no painel
- depois decidir se o destino final do backend de `atendimento` sera totalmente Go ou hibrido por fase

Fazer:

- mapear o que do `apps/atendimento-online-api` atual ainda pertence ao dominio `atendimento`
- separar adapters de shell do que e regra real do modulo
- definir estrategia de migracao por fatias sem downtime estrutural
- decidir o destino do realtime, workers e integracoes WhatsApp nesse corte

Criterio de pronto:

- existe plano de migracao Node -> Go por fronteira funcional
- o modulo `atendimento` consegue convergir para Go sem quebrar shell, tenant e auth

## Ordem recomendada por fase

### Fase 0 - Pode comecar agora no papel

Estas tarefas podem ser feitas desde ja, sem mexer pesado na estrutura:

1. desenhar arquitetura modular plugavel
2. definir o conceito do modulo pai/shell
3. padronizar o template de `AGENTS.md` por modulo
4. propor nomes semanticos novos para apps/pastas/servicos
5. mapear `incubadora/fila-atendimento` como intake de modulo incubado

Regra:

- nesta fase, documentar e decidir
- ainda nao sair renomeando pasta nem extraindo modulo no codigo

### Fase 1 - Estabilizar a base primeiro

Estas entram antes da refatoracao modular de verdade:

1. P0.1 auth centralizada
2. P0.2 seeds e CI coerentes
3. P0.3 build do `apps/atendimento-online-api`
4. P0.4 build do `apps/painel-web`
5. P2.11 fail-open de modulo
6. P2.12 audit de seguranca 100%

Motivo:

- sem isso, qualquer modularizacao vai nascer em cima de contratos quebrados
- primeiro precisamos saber qual e a verdade do sistema

### Fase 2 - Congelar fronteiras e contratos

Depois da base estabilizada:

1. P2.9 arquitetura modular plugavel
2. P2.10 padrao de AGENTS por modulo
3. definir contratos compartilhados do shell:
   - `ActorContext`
   - `TenantContext`
   - `AccessPolicy`
   - `ModuleRegistry`
   - `Audit/EventBus`

Motivo:

- antes de mover pasta e separar modulo, precisamos definir a fronteira certa

### Fase 3 - Renomear com semantica

So depois das fases 1 e 2:

1. P1.5 renomeacao semantica das pastas
2. P1.8 renomear entradas legadas

Motivo:

- renomear cedo demais gera caos e quebra onboarding, scripts, compose e docs junto

### Fase 4 - Fechar legado e migrar testes

1. P1.6 revisao final das referencias do legado
2. P1.7 remocao do legado de front

Motivo:

- primeiro o front ativo precisa ter o proprio harness
- so depois o legado pode sair de cena

### Fase 5 - Modularizacao real

Quando tudo acima estiver coerente:

1. escolher o primeiro modulo piloto
2. extrair backend/frontend/migrations dele com fronteira clara
3. fazer o shell injetar contexto em vez do modulo puxar internals

Ordem sugerida de piloto:

1. `finance`
2. intake de `incubadora/fila-atendimento` como modulo `atendimento`
3. `atendimento` ja incorporado ao shell
4. futuros `crm`, `site`, `kanban`

Motivo:

- `finance` ja esta mais perto desse formato no `plataforma-api`

### Fase 6 - Simplificar runtime e Docker

1. P2.13 simplificacao do Docker

Motivo:

- so vale simplificar servico depois que a arquitetura alvo estiver clara
- antes disso, corre o risco de simplificar no lugar errado

## Resposta curta sobre a ordem

Nao precisamos organizar absolutamente tudo antes de pensar na parte modular.

O certo e:

1. desenhar agora
2. estabilizar auth/build/seed/testes
3. congelar contratos
4. so entao renomear e modularizar de verdade

Em resumo:

- a arquitetura modular entra agora como desenho
- a implementacao modular entra depois da estabilizacao
- `incubadora/fila-atendimento` entra agora como intake documentado e depois como incorporacao real

## Principio arquitetural que vamos perseguir

Regra simples:

- modulo de dominio nao conhece outro modulo de dominio
- modulo de dominio conhece apenas contratos
- modulo pai/shell entrega contexto comum e capacidades compartilhadas

Em outras palavras:

- `finance` nao precisa saber quem implementa usuario
- `finance` nao precisa saber de onde vem tenant
- `finance` nao precisa importar internals de auth
- `finance` apenas recebe `actor`, `tenant`, `policy` e persiste seu proprio dominio

Quanto mais perto chegarmos disso, mais plugavel, extraivel e seguro o projeto fica.

## Referencias uteis desta rodada

- `ARQUITETURA-MODULAR-ALVO.md`
- `docs/repo-audit-2026-04-03.md`
- `docs/incubadora/fila-atendimento-intake-2026-04-04.md`
- `AGENTS.md`
- `incubadora/fila-atendimento/AGENTS.md`
- `apps/atendimento-online-api/AGENTS.md`
- `apps/painel-web/AGENTS.md`
- `docs/metrics/security-access-audit-latest.json`

## Artefatos ja produzidos nesta fase

Documentos ja produzidos:

- `ARQUITETURA-MODULAR-ALVO.md`
- `docs/incubadora/fila-atendimento-intake-2026-04-04.md`

Esse documento registra:

- o conceito de shell como modulo pai
- os contratos minimos que os modulos podem consumir
- a proposta de nomes semanticos
- a estrutura-alvo para modulos plugaveis
- o template de `AGENTS.md` por modulo
- o intake detalhado de `incubadora/fila-atendimento` como modulo candidato de `atendimento`

Regra:

- usar esse documento como referencia de desenho
- ainda nao iniciar rename fisico ou extracao pesada antes das tarefas da Fase 1

## Nota final

Enquanto esse contexto ainda esta fresco, evitar abrir frentes paralelas de feature nova.
Primeiro estabilizar auth, seed, build e testes. Depois disso fica muito mais seguro modularizar e remover redundancias.

