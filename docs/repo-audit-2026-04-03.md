# Auditoria do Repositorio - 2026-04-03

Snapshot tecnico do monorepo para responder quatro perguntas:

1. o que esta em runtime hoje
2. o que ja virou legado
3. o que esta quebrado ou inconsistente
4. o que pode ser removido com seguranca depois

## Arquitetura viva

### Servicos realmente ativos

- `postgres`: banco principal
- `redis`: cache + BullMQ + adapter do Socket.IO
- `plataforma-api`: auth, tenants, modulos, admin, finance
- `atendimento-online-api`: backend operacional do omnichannel
- `painel-web`: front Nuxt principal + BFF
- `atendimento-online-worker`: processamento outbound BullMQ
- `atendimento-online-retencao-worker`: sweep agendado de retencao

### Servicos opcionais ou auxiliares

- `whatsapp-evolution-gateway`: necessario apenas para integracao WhatsApp real
- `adminer` e `redis-commander`: operacao/ops
- `caddy`: edge/producao

### Pasta `old_web`

Veredito:

- nao participava do runtime
- nao participava do deploy
- foi removida do repositorio em `2026-04-04` depois da migracao do harness e da limpeza das referencias remanescentes

Evidencias:

- `docker-compose*.yml` monta `apps/painel-web`, nao `old_web`
- `docs/deploy-vps.md` passou a enviar o repo sem precisar tratar `old_web`, porque a pasta foi removida
- `docs/painel-web-merge.md` declara `apps/painel-web` como front consolidado
- `apps/painel-web/tests/*` agora concentra o harness ativo de testes de composables

## Auth, tenants e modulos

### Fluxo atual de auth

Hoje o login do painel faz:

1. `apps/painel-web` chama `/api/bff/auth/login`
2. `apps/atendimento-online-api` valida credenciais no `plataforma-api`
3. o token do `plataforma-api` volta como sessao principal para painel, HTTP e realtime
4. o shadow local do modulo continua apenas para IDs operacionais no schema `public`

### Consequencia

- nao existe mais JWT proprio do modulo
- o modulo Node continua dependente de shadow local de `Tenant` e `User`
- parte da autorizacao do modulo consulta o core por email/modulo e nao pela sessao viva do core

### Estado alvo desejado

- `plataforma-api` como unica sessao/autenticacao valida
- `apps/atendimento-online-api` focado em operacao omnichannel, sem auth paralelo
- shadow local reduzido ao minimo indispensavel

## Banco e seeds

### Separacao atual

- `public`: dados operacionais do modulo (`apps/atendimento-online-api`)
- `platform_core`: identidade, tenants, modulos, admin e finance

### Divergencia relevante encontrada

- `apps/atendimento-online-api/prisma/seed.ts` ainda semeia tenants `demo` e `acme`
- `plataforma-api` garante `root`/`demo-core` e aliases do `demo`, mas nao semeia `acme`
- resultado: o script `npm run test:tenant:isolation` falha ja no login do `acme`

### Snapshot do banco local auditado

No banco local em `platform_core`, o snapshot atual mostrou:

- ausencia de tenant `acme`
- `demo-core` ativo com nome `Root`
- `root` presente mas com status `cancelled`

Isso indica drift entre migrations, seeds, dados ja alterados manualmente e documentacao.

## Verificacoes executadas

### `apps/plataforma-api`

- comando: `go test ./...`
- resultado: OK

### `apps/atendimento-online-api`

- comando: `npm run test:tenant:isolation`
- resultado: FALHA
- motivo: login `acme` responde `401`

- comando: `npm run prisma:generate && npm run build`
- resultado: FALHA
- motivo principal: tipagem de `WhatsAppInstance` fora de coerencia no compile de TypeScript

### `apps/painel-web`

- comando local: `npm run build`
- resultado: FALHA no host Windows por binding opcional nativo (`oxc-transform`)

- comando no container: `docker compose exec painel-web npm run build`
- resultado: build do client conclui, build do server morre por `heap out of memory`

- comando local: `npm run test:composables`
- resultado: OK (`12/12`) apos migracao do harness e reparo local dos bindings nativos corrompidos

### Auditoria de acesso

- comando: `node scripts/security-access-audit.mjs`
- resultado: `36/40` cenarios aprovados
- falhas atuais:
  - `SEC-020`
  - `SEC-034`
  - `SEC-035`
  - `SEC-036`
- sintoma: tenant admin com modulo `finance` recebe `403` onde o audit esperava acesso

## Principais inconsistencias encontradas

1. Auth ainda esta parcialmente duplicada entre `plataforma-api` e `apps/atendimento-online-api`.
2. nomes legados no caminho principal aumentavam a confusao arquitetural; os registradores principais devem convergir para nomes semanticos.
3. `old_web` nao estava em producao e foi removido do repositorio depois da migracao do harness de testes de composables.
4. Seeds/docs/CI nao concordam sobre `demo`, `demo-core`, `root` e `acme`.
5. O front atual voltou a ter `test:composables`, mas o ambiente Windows local ainda exige atencao aos bindings nativos do toolchain.
6. O build do front nao esta estavel no host nem no container.
7. O build do `apps/atendimento-online-api` denuncia drift de tipos/selecoes em torno de multi-instancia WhatsApp.

## O que pode sair e o que ainda nao pode

### Pode sair do runtime

- `old_web`
  - ja saiu do runtime/deploy e do repositorio

- `adminer` e `redis-commander`
  - so devem rodar quando houver necessidade operacional

- `whatsapp-evolution-gateway`
  - manter opcional por profile/ambiente

### Itens que ainda nao devem sair do repositorio

- `atendimento-online-worker`
  - necessario enquanto o outbound depender de BullMQ

- `atendimento-online-retencao-worker`
  - pode virar cron/job unico no futuro, mas hoje ainda e parte do comportamento implementado

## Recomendacao objetiva por prioridade

### P0

1. alinhar seed e documentacao do `plataforma-api` com a realidade esperada em CI (`demo`, `acme`, `root`)
2. remover a dependencia de sessao JWT local do modulo ou ao menos validar o modulo contra sessao viva do core
3. restaurar build verde de `apps/atendimento-online-api`
4. restaurar build verde de `apps/painel-web`

### P1

1. concluido: `old_web` foi removido depois de revisar referencias restantes
2. renomear registradores `*-legado.ts` que ja sao caminho principal

### P2

1. reavaliar se `atendimento-online-retencao-worker` precisa ser servico dedicado ou job agendado no worker principal
2. revisar limites de memoria do build do `painel-web`
3. consolidar docs antigas que ainda citam `apps/web`

## Hotspots para a proxima rodada

- `apps/atendimento-online-api/src/routes/auth.ts`
- `apps/atendimento-online-api/src/services/core-atendimento-access.ts`
- `apps/atendimento-online-api/src/services/core-identity.ts`
- `apps/atendimento-online-api/src/services/whatsapp-instances.ts`
- `apps/painel-web/app/pages/admin/login.vue`
- `apps/painel-web/app/stores/session-simulation.ts`
- `apps/painel-web/tests/composables/*`
