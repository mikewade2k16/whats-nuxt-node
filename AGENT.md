# AGENT.md

Memoria operacional do projeto para agentes e para as proximas rodadas de deploy/debug.

## Ambiente atual

- repositorio local: `C:\Users\Mike\Documents\Projects\whats-test`
- VPS: `root@85.31.62.33`
- chave SSH esperada: `~/.ssh/vps_deploy`
- diretorio remoto: `/opt/omnichannel`
- app publica: `https://app.whenthelightsdie.com`
- API publica: `https://api.whenthelightsdie.com`

## Acesso validado

- painel/admin atual: `mikewade2k16@gmail.com`
- senha atual: `123123456`
- ultimo teste confirmado: `2026-03-31`

## Decisoes e correcoes recentes

### Finance

- o modal/config do financeiro quebrava porque o frontend enviava IDs temporarios que nao eram UUID validos
- o frontend passou a gerar UUID real e normalizar referencias antes do save
- o backend (`plataforma-api`) passou a tolerar UUID invalido no payload de finance sem derrubar a request
- o autosave do `finances` recebeu debounce maior, fila de save unico e atraso no indicador visual para reduzir flicker enquanto digita
- o toggle de `pago/efetivado` agora salva com prioridade maior e passa a preencher a data com `hoje` quando ela estiver vazia
- o backend de finance tambem normaliza linhas efetivadas sem data para gravar uma data valida, evitando perda do status no reload
- o `plataforma-api` passou a preservar os UUIDs de linhas e ajustes enviados pelo frontend durante `create/update` das planilhas, evitando churn de IDs entre autosaves
- a migration `0013_backfill_finance_effective_dates.sql` corrige registros antigos que ficaram com `effective = true` e `effectiveDate = ''`
- o financeiro deve usar sempre o fuso `America/Sao_Paulo` para `today`, `period` e `effectiveDate`; nao usar `UTC` nem `toISOString().slice(0, 10)` para preencher data automaticamente
- a migration `0014_fix_finance_effective_dates_timezone.sql` corrige linhas auto-datadas com o dia seguinte por causa da virada em UTC
- a arquitetura do `plataforma-api` foi reorganizada para usar `internal/domain/finance` como package dedicado; o finance deixou de ser atendido por `domain/core`
- o contrato de finance agora e `lista leve + detalhe`: `GET /core/admin/finance-sheets` devolve resumo e `GET /core/admin/finance-sheets/{sheetId}` devolve a planilha completa
- o frontend de finance passou a buscar detalhe sob demanda para a planilha selecionada, reduzindo payload carregado na listagem inicial
- o caminho novo e explicito para planilhas e `finance-sheets`; no frontend/BFF o fluxo principal deve preferir `/api/admin/finance-sheets/...` em vez de `/api/admin/finances/...`
- o toggle/data de efetivacao nao deve mais salvar a planilha inteira: agora existe `PATCH /api/admin/finance-sheets/{sheetId}/lines/{lineId}` com body curto (`effective`, `effectiveDate`) e resposta curta (`line`, `summary`, `preview`, `updatedAt`)
- no `plataforma-api`, o alias equivalente e `PATCH /core/admin/finance-sheets/{sheetId}/lines/{lineId}`; usar esse endpoint para mutacoes de linha pequenas e reservar `PUT /core/admin/finance-sheets/{sheetId}` para saves completos do editor
- IDs publicos de planilha agora sao UUID; o `legacy_id` da tabela `finance_sheets` fica apenas para compatibilidade interna e nao deve aparecer em rotas novas
- `fixedAccountId` de linhas deve ser aceito apenas quando pertencer ao mesmo tenant/config; referencias cruzadas ou invalidas precisam ser limpas no backend para evitar acoplamento entre configuracao e planilha
- `categoryId` de contas fixas deve apontar apenas para categoria da mesma `finance_config`; payload cruzado entre tenants/configs precisa falhar com `400`
- a migration `0015_finance_scalability_indexes.sql` adiciona indices de ordenacao/escopo para `finance_categories`, `finance_fixed_accounts`, `finance_fixed_account_members` e `finance_lines`

### Auth e admin

- o `core-bff` do Nuxt precisa converter `x-core-token` em header `Authorization: Bearer ...` antes de chamar o `plataforma-api`
- sem isso, endpoints como `/core/tenants/{tenantId}` e `/modules` falham com `401` e o frontend mostra `Falha no backend core`
- a criacao de usuario admin/root foi ajustada para suportar `isPlatformAdmin`
- o login do painel autentica no `plataforma-api` e o `apps/atendimento-online-api` aceita esse mesmo token como sessao principal
- o modal `Conexao WhatsApp` da inbox agora expõe limpeza manual de historico por instancia via `POST /tenant/whatsapp/conversations/clear`; a acao remove conversas, mensagens e eventos operacionais do tenant/instancia selecionados sem derrubar a sessao da Evolution
- o modulo operacional nao expoe mais `POST /auth/login`; o JWT local do modulo foi removido e o login principal ficou em `POST /core/auth/login`
- `POST /session/context` devolve o mesmo token do `plataforma-api` com contexto explicito do tenant selecionado
- quando `isPlatformAdmin = true`, o usuario deve:
  - nascer no tenant `root`
  - ficar com `users.is_platform_admin = true`
  - receber membership de owner/admin/admin
  - receber role `platform_root`
  - receber os modulos ativos do tenant root
- o usuario `tonyw.wright@outlook.com` precisou de backfill manual em producao para ficar coerente com esse modelo

## Estado validado em producao

- login do painel com `mikewade2k16@gmail.com / 123123456` funcionando
- `GET /api/core-bff/core/auth/me` funcionando
- `GET /api/core-bff/core/tenants/{tenantId}` funcionando
- `GET /api/core-bff/core/tenants/{tenantId}/modules` funcionando
- `plataforma-api` e `painel-web` recriados na VPS apos os ajustes
- finance antigo backfillado: a linha `Hospedagem` do cliente `2` passou a responder com `effectiveDate = 2026-03-31`
- smoke test de finance validado em `2026-03-31/2026-04-01`: create -> patch efetivado -> list -> delete com ID estavel e `effectiveDate` persistido
- ajuste de timezone documentado depois do caso de `2026-03-31 22:34` no Brasil aparecer como `2026-04-01` no modal: a regra correta do sistema e usar horario de Sao Paulo para datas automaticas do financeiro
- smoke test adicional validado em `2026-04-01`: `GET /api/admin/finance-sheets/{sheetUuid}` respondeu pelo caminho novo e `PATCH /api/admin/finance-sheets/{sheetUuid}/lines/{lineUuid}` respondeu `200` com resposta curta; no log do core a rota nova apareceu como `PATCH /core/admin/finance-sheets/{sheetUuid}/lines/{lineUuid}` com ~600B

## Documentacao tecnica

- `AGENTS.md` na raiz agora e a fonte de verdade para padroes de engenharia do repositorio
- `apps/plataforma-api/AGENTS.md` define o padrao do servico Go
- cada modulo principal do `plataforma-api` deve manter seu proprio `AGENTS.md` (`auth`, `core`, `finance`)
- `CLAUDE.md` antigos ficam como legado de referencia; novas regras e acordos devem ser atualizados em `AGENTS.md`

## Playbook rapido de deploy

### Subir arquivos pontuais

```bash
scp -i ~/.ssh/vps_deploy "CAMINHO_LOCAL" root@85.31.62.33:/opt/omnichannel/CAMINHO_REMOTO
```

### Rebuild/recreate de servicos principais

```bash
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "cd /opt/omnichannel && docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d --build --force-recreate plataforma-api painel-web"
```

### Deploy rapido seletivo apos git push

- o `docker-compose.prod.yml` passou a usar `Dockerfile.prod` para `painel-web`, `atendimento-online-api` e workers, evitando `npm ci` + `build` no startup do container de producao
- na VPS, o script `scripts/deploy-vps-fast.ps1` faz `git pull --ff-only`, `docker compose build` seletivo e `up -d --no-deps` so dos servicos pedidos
- exemplo local Windows:

```powershell
./scripts/deploy-vps-fast.ps1 -Services painel-web,atendimento-online-api -ForceRecreate
```

### Smoke test minimo de auth

1. `POST /api/core-bff/core/auth/login`
2. extrair `accessToken`
3. `GET /api/core-bff/core/auth/me`
4. `GET /api/core-bff/core/tenants/{tenantId}`
5. `GET /api/core-bff/core/tenants/{tenantId}/modules`

## Proximo objetivo

Consolidar a limpeza estrutural do repo, mantendo os nomes semanticos atuais estaveis e preparando a futura extracao modular para `modules/`.

Antes disso:

- confirmar compose, docs e deploy alinhados com `painel-web`, `atendimento-online-api`, `plataforma-api` e `whatsapp-evolution-gateway`
- manter `test:tenant:isolation`, `go test ./...`, build da `apps/atendimento-online-api` e `test:composables` do `apps/painel-web` como trilha minima de validacao

## Alvos provaveis para continuar removendo legado

- `apps/atendimento-online-api/src/routes/session-context.ts`: ainda concentra a ponte entre core token, shadow local e selecao de contexto operacional
- `apps/atendimento-online-api/src/services/core-identity.ts`: converte roles do core para roles locais do shadow operacional
- `apps/painel-web/app/pages/admin/login.vue`: fluxo do painel ja usa `POST /core/auth/login`; manter sem regressao para auth paralela
- `apps/painel-web/app/stores/session-simulation.ts`: simulacao local de tenant/cliente ainda interfere no contexto administrativo
- `apps/painel-web/server/api/bff/[...path].ts`: proxy do backend legado ainda participa do fluxo principal
- `apps/painel-web/server/api/core-bff/[...path].ts`: deve permanecer alinhado com o token do core durante a migracao
