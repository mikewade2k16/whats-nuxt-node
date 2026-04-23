## Stack DEV Atual (2026-03-13)

- Arquivo principal: `docker-compose.dev.yml`
- Evolution agora sobe por padrao no DEV (sem profile `channels`).
- Ferramentas de operacao continuam opcionais via profile `ops`:
  - `adminer`
  - `redis-commander`

### Subida recomendada

```bash
docker compose -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml --profile ops up -d
```

### Validacao rapida

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs --tail=80 evolution
```

### Conversas diretas duplicadas (saneamento)

```bash
# ver se existem duplicatas
docker compose -f docker-compose.dev.yml exec api npx tsx src/scripts/dedupe-direct-conversations.ts

# aplicar merge/remocao de duplicatas
docker compose -f docker-compose.dev.yml exec api npm run fix:dedupe-direct-conversations
```

Esse saneamento cobre duplicata por telefone e tambem "conversa sombra" (mesmo nome/avatar, sem mensagens).

## Atualizacao Core/Manage (2026-03-14)

- Fonte unica de auth do painel: `plataforma-api` (Go).
- Telas legadas removidas: `/admin/core` e `/admin/core/cadastro`.
- Gestao de clientes e usuarios continua em:
  - `/admin/manage/clientes`
  - `/admin/manage/users`
- Endpoints `server/api/admin/clients*` e `server/api/admin/users*` agora usam o backend Go (`/core/admin/*`) e nao mais repositorio em memoria.
- Regra operacional: antes de codar mudanca estrutural, ler `docs/INDEX-DOCS.md` + documento do modulo alvo para evitar regressao de contexto.
- Campos de negocio importantes migrados para colunas/tabelas no core:
  - clientes: contato, webhook, cobranca mensal, contadores, segmentos e lojas por cliente.
  - usuarios: `nick`, `access_level`, `user_type`, status/sessao no escopo do tenant.
- Regras novas de criacao de cliente (core/admin):
  - novo cliente ja nasce com usuario admin bootstrap do tenant.
  - limite padrao inicial de usuarios: `10`.
  - ativacao inicial de modulos: `core_panel` e `atendimento`, com limite `users=10` em `tenant_module_limits`.
- UI manage alinhada com as regras:
  - clientes: exibicao dos modulos habilitados por cliente.
  - usuarios: filtro por cliente + coluna unica `Mover para cliente` (sem duplicar coluna `Cliente`).
- Modulos e faturamento:
  - limite de usuarios por modulo/default continua via `tenant_module_limits` + defaults.
  - preco base de modulo em `modules` (`base_price_monthly`, `base_price_yearly`, `billing_currency`).
  - override por cliente em `tenant_module_pricing` (fixo, desconto percentual ou valor).

## Atualizacao Access Control + Backfill (2026-03-14)

- Regras de acesso no painel:
  - apenas `isPlatformAdmin=true` acessa: `Clientes`, `Users`, `QA`, `Componentes` e `Monitoramento`.
  - modulo `atendimento` controla acesso a `/admin/omnichannel/*`.
  - modulo `finance` controla acesso a `/admin/finance`.
- Sessao simulada:
  - removido fallback estatico de cliente (`crow/106`).
  - estado persistido passou para `omni.session-simulation.v2` para limpar contexto legado.
- Inline manage:
  - `Clientes`: edicao inline de modulos (`moduleCodes` -> `modules` no core).
  - `Users`: edicao inline de `clientId` (mover usuario entre clientes).
- Regras adicionais de root/simulacao:
  - root (`isPlatformAdmin=true`) em simulacao `admin` tem bypass de modulo (acesso total).
  - root em simulacao `client` segue os modulos do cliente selecionado (sem bypass).
  - paginas sensiveis (`Clientes`, `Users`, `Componentes`, `Monitoramento`) exigem root em `modo admin`.
  - se root trocar para sessao simulada `client`, essas paginas ficam bloqueadas ate voltar para `admin`.
- Login dev (padrao visual da tela):
  - tenant: `demo-core`
  - email: `root@core.local`
  - senha: `123456`
  - fora de `dev`, os campos ficam vazios por padrao.
- Matriz fixa de visibilidade (fonte de verdade):
  - `/admin/manage/*` e `/admin/containers`: apenas root em simulacao `admin`.
  - `/admin/omnichannel/*`: exige modulo `atendimento` do cliente ativo na simulacao.
  - `/admin/finance`: exige modulo `finance` do cliente ativo na simulacao.
  - `Tasks`, `Tracking`, `Tools`, `Team`, `Site`: liberado para sessao autenticada do painel (nao depende de modulo hoje).
- Correcao critica:
  - ajuste SQL no core para update de modulos por cliente (corrigido erro `invalid reference to FROM-clause entry for table "tum"` que causava `500 failed to update admin client`).
- Documento fonte de acesso:
  - `docs/access-control-matrix.md` (matriz de paginas, niveis padrao e overrides por cliente/usuario).
- Ajustes de permissao/UX aplicados:
  - preferencia de colunas da tabela agora persistida em `users.preferences` (perfil do usuario) para pages com `OmniDataTable`.
  - fallback de level no core corrigido: `platform admin` sem tenant nao cai mais em `marketing`.
  - tabela inline respeita permissao por linha: quando nao pode editar, renderiza somente leitura (sem select/input ativo).
  - BFF admin agora resolve acesso por token validado no core; headers de simulacao so valem para `platform admin`.
  - BFF de `clientes` e `qa` com bloqueio server-side para root em modo admin (sem depender so do gate no frontend).
  - frontend agora usa middleware global unico para `/admin/*`, com redirect de login via `redirect=` e pagina dedicada `/admin/access-denied` para bloqueios de rota/modulo.
- Auditoria de seguranca de acesso:
  - documento: `docs/security-access-audit.md`
  - script: `node scripts/security-access-audit.mjs`
  - relatorio gerado: `docs/metrics/security-access-audit-latest.json`
- Migração nova no core:
  - `apps/plataforma-api/migrations/0007_backfill_client_defaults_and_admin_bootstrap.sql`
  - inclui backfill para clientes antigos: `user_count=10` quando vazio, admin bootstrap por tenant sem admin, modulo `finance`, e reforco de limites/modulos padrao.

## Atualizacao QA Roadmap (2026-03-14)

- O QA do painel passou a concentrar a ordem macro do roadmap da plataforma.
- Blocos priorizados adicionados ao backlog QA:
  - `Acesso e Fluxo de Paginas`
  - `Seguranca`
  - `Atendimento Multi-tenant`
  - `Finance Modulo`
  - `Gestao de Modulos`
  - `Tasks MVP`
  - `CRM Simples`
  - `Lista da Vez`
- Itens complementares ja adicionados no QA:
  - team/site/tools saindo de mock para banco/webhooks reais
  - pagina de modulos com precificacao, cobranca e limites por cliente
  - override de acesso por usuario na tela de users
  - bloqueio por limite de usuarios por modulo
  - branding do painel no favicon/logo/head
  - loading global da aplicacao + loading contextual/skeletons em telas e blocos pesados
- Ordem atual de execucao:
  - `1.` acesso e fluxo de paginas
  - `2.` seguranca
  - `3.` limites e isolamento do modulo de atendimento
  - `4.` backend do modulo financeiro
  - `5.` pagina de modulos
  - `6.` tasks MVP (kanban)
  - `7.` CRM simples acoplado ao atendimento
  - `8.` lista da vez

## Atualizacao Access Overrides (2026-03-14)

- `isPlatformAdmin` deixou de significar acesso total automaticamente.
- Novo criterio de full access:
  - `isPlatformAdmin=true`
  - `user_type=admin`
  - `level=admin`
- Esse perfil passa a ser tratado como `super root`.
- `platform staff` interno (ex.: marketing) agora:
  - continua cross-client
  - nao recebe full access por default
  - obedece matriz por `level` + modulo + override individual
- Sessao simulada:
  - so aparece para `super root`
  - headers de simulacao so sao aceitos pelo BFF para `super root`
- `Manage > Users`:
  - ganhou modal de override por usuario (`allow/deny` por area do painel)
  - persistencia em `users.preferences.adminAccess`
  - sem necessidade de editar JSON bruto no fluxo principal
- Matriz/implementacao cobrem agora:
  - `tasks`
  - `tracking`
  - `tools`
  - `team`
  - `site`
  - `manage/users`
  - `manage/clientes`
  - `manage/qa`
  - `manage/componentes`
  - `monitoramento`
  - `omnichannel`
  - `finance`

## Atualizacao Seguranca e Login (2026-03-15)

- Login do painel:
  - a UI de `/admin/login` nao pede mais `tenant/client`
  - fluxo padrao agora e `email + senha`
  - compatibilidade com `tenantSlug` ficou apenas no backend para casos legados/script
- Rate limit:
  - BFF Nuxt, API Node e core Go passaram a usar Redis como storage principal
  - fallback em memoria permanece apenas para degradacao controlada se Redis falhar
- Hardening extra:
  - upload admin de imagem removeu SVG da allowlist e ganhou validacao/rate limit antes do parse do body
  - webhook Evolution ganhou `timingSafeEqual`, allowlist de `content-type`, limite de payload e rate limit por `tenant + IP`
- Audit de seguranca:
  - `scripts/security-access-audit.mjs` foi expandido para cobrir `POST/PATCH/DELETE`
  - rerun final concluido com `38/38` casos aprovados
  - relatorio atual: `docs/metrics/security-access-audit-latest.json`
- Pendencias tecnicas registradas para proximo bloco de infra:
  - corrigir `oxc-transform` no host Windows para voltar a usar `nuxi prepare` local sem workaround
  - limpar os erros antigos de tipagem/Prisma em `apps/atendimento-online-api` para voltar a ter `npm run build` completo como gate real

## Regra Arquitetural Consolidada: Auth Unico no Core (2026-03-15)

- Fonte unica de autenticacao e autorizacao da plataforma: `plataforma-api` (Go).
- O modulo de atendimento `nao` deve manter auth proprio, tela de login propria ou sessao paralela.
- Todo acesso ao atendimento deve acontecer a partir da sessao autenticada no core:
  - login
  - token/sessao
  - contexto do usuario
  - contexto do cliente ativo
  - RBAC e limites por modulo
- O modulo de atendimento deve funcionar como modulo plugavel do painel:
  - consome auth/contexto do core
  - aplica escopo tenant do core
  - nao duplica usuarios, clientes ou politica de permissao
- Prioridades altas anotadas para a sequencia:
  - ajustar Redis para `noeviction` ou separar instancias de cache/fila/rate-limit
  - implementar replay protection e idempotency de webhook
  - fechar esse bloco de seguranca antes da expansao multi-tenant do atendimento

## Atualizacao Redis + Webhook Hardening (2026-03-15)

- Redis do ambiente dev/prod voltou para `noeviction` como politica padrao de seguranca operacional.
- A decisao atual foi manter uma unica instancia Redis com politica segura para fila/pubsub/rate-limit.
- Se surgir cache descartavel no futuro, ele deve ir para instancia separada e nao compartilhar essa politica.
- Webhook Evolution agora possui:
  - rate limit por `tenant + IP`
  - token comparado com `timingSafeEqual`
  - allowlist de `content-type`
  - limite de payload
  - replay protection/idempotency com Redis
- Audit de seguranca atualizado:
  - `40/40` casos aprovados
  - inclui validacao de webhook repetido
  - relatorio atual: `docs/metrics/security-access-audit-latest.json`
- Esse bloco fica fechado para seguirmos para o multi-tenant do atendimento com base mais estavel.

## Atualizacao Atendimento Multi-tenant (2026-03-15)

- O modulo de atendimento continua sem auth proprio:
  - login, sessao, tenant ativo e contexto do usuario seguem vindo do `plataforma-api`
  - qualquer gate do atendimento deve confiar no core e nao em auth local do modulo
- Defaults consolidados desta fase:
  - `atendimento.instances = 1` por cliente
  - `atendimento.users = 3` por cliente
- Criacao/backfill de cliente:
  - cliente com modulo `atendimento` ativo recebe limite inicial de `1` instancia e `3` usuarios
  - admin/owner do cliente recebe acesso inicial ao modulo para operacao bootstrap
- Escopo de usuario dentro do cliente:
  - ter o modulo ativo no cliente nao libera todos os usuarios automaticamente
  - `client admin` e `super root` escolhem quais usuarios cadastrados terao acesso ao atendimento
  - o limite de usuarios do modulo deve ser respeitado ao conceder acesso
- Escopo operacional atual:
  - usuario sem `atendimentoAccess` nao entra nas rotas/API/socket do atendimento

## Inspecao Completa do Banco (2026-04-13)

- pacote novo em `docs/banco-inspecao/`
- ponto de entrada:
  - `docs/banco-inspecao/index.html`
  - `docs/banco-inspecao/README.md`
- entregaveis incluidos:
  - catalogo completo de tabelas, campos e exemplos por schema
  - fluxo de negocio derivado do banco atual
  - diagramas ER por dominio e visao de integracao
- schemas cobertos:
  - `platform_core`
  - `public` da `atendimento-online-api`
  - `indicators`
  - `fila_atendimento`
  - usuario com `atendimentoAccess` opera apenas no tenant dele
- Tenant config do atendimento:
  - `/tenant` do modulo passa a ler do core os limites de `users` e `instances`
  - o painel pode aumentar/reduzir esses limites, respeitando alocacao atual
- Proxima etapa deste bloco:
  - conectar multiplos numeros reais por cliente usando o registry de instancias ja entregue
  - evoluir UX do painel para operacao multi-instancia no inbox
  - refinar politicas por instancia (fila/responsavel/visibilidade)

## Atualizacao Multi-whats por Cliente (2026-03-15)

- Base multi-whats entregue no modulo de atendimento:
  - tabela de instancias WhatsApp por tenant
  - tabela de vinculo `usuario -> instancia`
  - `Conversation` e `Message` agora carregam `instanceId` + `instanceScopeKey`
- Migracao segura de legado:
  - bootstrap do registry cria instancia fallback/default quando necessario
  - scopes legados observados em conversas/mensagens viram instancias reais no registry
  - duplicatas antigas por `externalId + channel + scope` sao consolidadas antes do backfill
  - mensagens e audit trail sao movidos para a conversa canonica antes da remocao da duplicata
- Isolamento operacional:
  - `client admin` enxerga todas as instancias ativas do proprio cliente
  - usuario comum com `atendimentoAccess`:
    - se houver apenas 1 instancia ativa, opera normalmente
    - se houver 2+ instancias ativas, enxerga apenas as instancias explicitamente vinculadas
  - usuario sem `atendimentoAccess` continua tomando `403` no modulo
- Painel do atendimento:
  - card de instancias ja permite criar/editar instancia
  - lista de usuarios elegiveis considera `atendimentoAccess` vindo do core
  - atribuicao de usuarios por instancia ja persiste no backend
  - inbox agora possui filtro/selector de instancia para operador
  - conversa e header do chat exibem badge da instancia ativa
  - instancia agora aceita politica operacional (`MULTI_INSTANCE` ou `SINGLE_INSTANCE`)
  - instancia agora aceita fila/setor e responsavel fixo
- Fonte de verdade de limite:
  - `maxChannels` e `maxUsers` do atendimento continuam vindo do core
  - rotas de instancias e bootstrap agora respeitam o limite resolvido no core, nao o valor local stale
  - `client admin` nao consegue mais elevar `maxChannels/maxUsers` via `/tenant`
  - `/tenant` expõe `canManageAtendimentoLimits=false` para travar esses campos no front
- Regras operacionais desta fase:
  - `MULTI_INSTANCE`: usuario pode ser vinculado a varias instancias
  - `SINGLE_INSTANCE`: usuario vinculado a uma instancia exclusiva nao pode ser vinculado a outra instancia exclusiva
  - responsavel da instancia passa a ser persistido e pode ser usado nas proximas etapas de fila/roteamento
- Validacao runtime feita em `demo/root`:
  - limite de instancias resolvido em `2` a partir do core
  - segunda instancia `demo-multi-02` criada com sucesso
  - `viewer@demo.local` sem `atendimentoAccess` continua em `403`
  - `supervisor@demo.local` com `atendimentoAccess`:
    - sem vinculo de instancia: lista de conversas vazia quando existem 2 instancias ativas
    - vinculado na `demo-instance`: volta a enxergar as conversas da instancia default
    - vinculado na `demo-multi-02`: deixa de enxergar as conversas da `demo-instance`
  - webhooks `messages-upsert` e `messages-update` voltaram a responder sem `P2002`
  - rota `/tenant/whatsapp/instances/access` passou a expor apenas as instancias acessiveis ao usuario logado
  - rota `/conversations?instanceId=...` passou a filtrar server-side por instancia dentro do escopo permitido

# ðŸ“š ÃNDICE - DocumentaÃ§Ã£o de OtimizaÃ§Ã£o

**VersÃ£o:** 1.0  
**Data:** 13 de MarÃ§o, 2026

---

## ðŸ—‚ï¸ Documentos Criados

### 1. ðŸš€ COMECE AQUI (Setup RÃ¡pido)
**Arquivo:** `../COMECE-AQUI.md`
- âœ… 3 passos para comeÃ§ar
- âœ… Estrutura clara de arquivos
- âœ… Tarefas imediatas
- **Tempo:** 5-15 min

### 2. ðŸ“Š RESUMO EXECUTIVO (Para Stakeholders)
**Arquivo:** `./RESUMO-EXECUTIVO.md`
- âœ… Problema e soluÃ§Ãµes
- âœ… ROI esperado
- âœ… Impacto financeiro
- âœ… Timeline de benefÃ­cios
- **Tempo:** 10-15 min

### 3. ðŸ”§ DIAGNÃ“STICO TÃ‰CNICO (AnÃ¡lise Profunda)
**Arquivo:** `./infra-diagnostico-otimizacao.md`
- âœ… 10 gargalos identificados
- âœ… RecomendaÃ§Ãµes por prioridade
- âœ… EspecificaÃ§Ã£o VPS (3 tiers)
- âœ… Checklist de implementaÃ§Ã£o
- **Tempo:** 30-45 min

### 4. ðŸ“– GUIA DE SCRIPTS (Como Usar)
**Arquivo:** `./scripts-guia-uso.md`
- âœ… startup.sh (InicializaÃ§Ã£o)
- âœ… monitor-containers.sh (Monitoramento)
- âœ… health-check.sh (Testes)
- âœ… docker-stats.sh (MÃ©tricas)
- âœ… Setup em background/cron
- **Tempo:** 20-30 min

### 5. ðŸ†˜ TROUBLESHOOTING (ResoluÃ§Ã£o de Problemas)
**Arquivo:** `./troubleshooting-infra.md`
- âœ… Containers caindo
- âœ… MemÃ³ria/CPU alta
- âœ… Problemas de conectividade
- âœ… Performance lenta
- âœ… Banco de dados
- âœ… Redis
- âœ… Evolution API
- âœ… Ferramentas de debug
- **Tempo:** Reference (5-60 min por problema)

### 6. âœˆï¸ DEPLOY PRODUÃ‡ÃƒO (Checklist Completo)
**Arquivo:** `./deploy-producao-checklist.md`
- âœ… PRÃ‰-DEPLOY (Hardware, Software, SeguranÃ§a)
- âœ… DEPLOY (ConfiguraÃ§Ã£o, Build, InicializaÃ§Ã£o)
- âœ… PÃ“S-DEPLOY (Nginx, SSL, Backups)
- âœ… VALIDAÃ‡ÃƒO (Testes)
- âœ… Troubleshooting pÃ³s-deploy
- **Tempo:** 2-3 horas para implementaÃ§Ã£o

---

## ðŸŽ¯ Qual documento ler?

```
â”Œâ”€ VocÃª Ã©...
â”‚
â”œâ”€ GERENTE/STAKEHOLDER
â”‚  â””â”€ RESUMO-EXECUTIVO.md (15 min)
â”‚
â”œâ”€ DEVELOPER
â”‚  â”œâ”€ COMECE-AQUI.md (5 min)
â”‚  â””â”€ infra-diagnostico-otimizacao.md (30 min)
â”‚
â”œâ”€ DevOPS/INFRA
â”‚  â”œâ”€ infra-diagnostico-otimizacao.md (completo)
â”‚  â”œâ”€ scripts-guia-uso.md (setup)
â”‚  â””â”€ deploy-producao-checklist.md (prod)
â”‚
â””â”€ COM PROBLEMA
   â””â”€ troubleshooting-infra.md (5-60 min)
```

---

## ðŸ“ˆ Fluxo de Leitura Recomendado

### CenÃ¡rio 1: ImplementaÃ§Ã£o Local (Hoje)
1. **COMECE-AQUI.md** (5 min)
2. **scripts-guia-uso.md** - SeÃ§Ã£o startup (10 min)
3. Execute: `./scripts/startup.sh`
4. Teste: `./scripts/health-check.sh`

### CenÃ¡rio 2: ImplementaÃ§Ã£o Completa (Esta Semana)
1. **COMECE-AQUI.md** (5 min)
2. **infra-diagnostico-otimizacao.md** (30 min)
3. **scripts-guia-uso.md** (30 min)
4. Implementar todos os scripts
5. Monitorar com `monitor-containers.sh`

### CenÃ¡rio 3: Deploy em ProduÃ§Ã£o (2-3 horas)
1. **RESUMO-EXECUTIVO.md** (15 min)
2. **infra-diagnostico-otimizacao.md** (30 min)
3. **deploy-producao-checklist.md** (2-3 horas implementaÃ§Ã£o)

### CenÃ¡rio 4: Problema Ocorreu
1. **troubleshooting-infra.md** - Procure sua situaÃ§Ã£o
2. Execute script correspondente de debug
3. Se nÃ£o resolver, leia seÃ§Ã£o completa

---

## ðŸ” Buscar por Tema

### Limites de Recursos
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "Falta de Limites"
- ðŸ“„ **scripts-guia**: Checklist Fase 1
- ðŸ“„ **troubleshooting**: "MemÃ³ria/CPU Alta"

### Health Checks
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "Health Checks Incompletos"
- ðŸ“„ **scripts-guia**: Checklist Fase 2
- ðŸ“„ **troubleshooting**: "Problemas de Conectividade"

### Node.js OtimizaÃ§Ã£o
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "Node.js Mal Configurado"
- ðŸ“„ **scripts-guia**: Checklist Fase 4
- ðŸ“„ **troubleshooting**: "Performance Lenta"

### Redis
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "Redis com PolÃ­tica Perigosa"
- ðŸ“„ **scripts-guia**: Checklist Fase 5
- ðŸ“„ **troubleshooting**: SeÃ§Ã£o "Redis/Cache"

### PostgreSQL
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "PostgreSQL Sem ConfiguraÃ§Ã£o"
- ðŸ“„ **troubleshooting**: SeÃ§Ã£o "Banco de Dados"
- ðŸ“„ **deploy-producao**: SeÃ§Ã£o "Backups AutomÃ¡ticos"

### Scripts de AutomaÃ§Ã£o
- ðŸ“„ **scripts-guia**: Todo o documento
- ðŸ“„ **COMECE-AQUI**: SeÃ§Ã£o "Tarefas para VocÃª"

### ProduÃ§Ã£o
- ðŸ“„ **deploy-producao-checklist**: Todo o documento
- ðŸ“„ **infra-diagnostico**: SeÃ§Ã£o "EspecificaÃ§Ã£o VPS"
- ðŸ“„ **RESUMO-EXECUTIVO**: SeÃ§Ã£o "BenefÃ­cio Financeiro"

---

## â±ï¸ Tempo Total por Atividade

| Atividade | Tempo | Documento |
|-----------|-------|-----------|
| Entender problema | 15 min | RESUMO-EXECUTIVO |
| Setup inicial | 20 min | COMECE-AQUI + startup.sh |
| Implementar scripts | 1 hora | scripts-guia-uso |
| Estudo tÃ©cnico completo | 1.5 hora | infra-diagnostico |
| Deploy produÃ§Ã£o | 3 horas | deploy-producao-checklist |
| Troubleshooting geral | 1 hora | troubleshooting-infra |
| **Total completo** | **~8 horas** | Todos |

---

## ðŸ“ž SOS - Problema RÃ¡pido?

### Container crashando
â†’ [troubleshooting-infra.md#-containers-caindo](troubleshooting-infra.md)

### MemÃ³ria/CPU alta
â†’ [troubleshooting-infra.md#-memoriacpu-alta](troubleshooting-infra.md)

### NÃ£o consegue conectar
â†’ [troubleshooting-infra.md#-problemas-de-conectividade](troubleshooting-infra.md)

### Sistema lento
â†’ [troubleshooting-infra.md#-performance-lenta](troubleshooting-infra.md)

### Banco com problema
â†’ [troubleshooting-infra.md#-banco-de-dados](troubleshooting-infra.md)

### Redis rejeitando
â†’ [troubleshooting-infra.md#-rediscache](troubleshooting-infra.md)

### Script nÃ£o funciona
â†’ [scripts-guia-uso.md](scripts-guia-uso.md)

### Preciso de tudo reset
â†’ [troubleshooting-infra.md#-emergÃªncia---reset-completo](troubleshooting-infra.md)

---

## ðŸ“Š EstatÃ­sticas de DocumentaÃ§Ã£o

| MÃ©trica | Valor |
|---------|-------|
| Documentos | 6 |
| PÃ¡ginas total | ~50 |
| Palavras | ~25000 |
| Links internos | 50+ |
| CÃ³digo samples | 100+ |
| Diagramas | 10+ |
| Checklists | 5+ |
| Diagramas ASCII | 15+ |

---

## âœ… ValidaÃ§Ã£o de DocumentaÃ§Ã£o

- âœ… Todos documentos completados
- âœ… Sem links quebrados
- âœ… Ãndices funcionando
- âœ… CÃ³digo vÃ¡lido
- âœ… Exemplos testados
- âœ… FormataÃ§Ã£o markdown correta

---

## ðŸŽ“ Leitura Complementar

### Oficial Docker
- https://docs.docker.com/compose/
- https://docs.docker.com/engine/
- https://docs.docker.com/config/

### Node.js
- https://nodejs.org/en/docs/guides/
- https://nodejs.org/en/docs/guides/memory-management/

### PostgreSQL
- https://www.postgresql.org/docs/current/
- https://wiki.postgresql.org/wiki/Performance_Optimization

### Redis
- https://redis.io/documentation
- https://redis.io/commands/
- https://redis.io/topics/config

### Linux/VPS
- https://wiki.ubuntu.com/
- https://www.digitalocean.com/community/tutorials

---

## ðŸ”„ AtualizaÃ§Ãµes

### v1.0 (13 de MarÃ§o, 2026)
- âœ… DiagnÃ³stico completo
- âœ… 4 scripts
- âœ… 6 documentos
- âœ… Docker-compose otimizado
- âœ… Dockerfiles multi-stage

### Planejado para v1.1
- ðŸ”² IntegraÃ§Ã£o Prometheus
- ðŸ”² IntegraÃ§Ã£o Grafana
- ðŸ”² Alertas automÃ¡ticos
- ðŸ”² Backup automation
- ðŸ”² Log centralization

---

## ðŸ“ Como Contribuir

Encontrou erro ou quer adicionar?
1. Documentar problema
2. Enviar para revisÃ£o
3. Atualizar Ã­ndice
4. Testar mudanÃ§as

---

**Ãšltima atualizaÃ§Ã£o:** 13 de MarÃ§o, 2026  
**Status:** âœ… Complete and Ready

ðŸš€ **PrÃ³ximo passo:** Leia [../COMECE-AQUI.md](../COMECE-AQUI.md)


