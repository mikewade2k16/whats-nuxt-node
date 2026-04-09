# Plano de Incorporação - `fila-atendimento`

Snapshot: `2026-04-04`

## Objetivo

Fazer o módulo `fila-atendimento` rodar dentro do painel principal sem host paralelo permanente, preservando:

- auth centralizada no shell
- isolamento por tenant
- escopo por loja/unidade
- fronteira real de módulo
- possibilidade futura de extração

## Regra desta fase

Não tentar migrar tudo de uma vez.

O caminho seguro é por fatias:

1. congelar contratos e ownership
2. adaptar backend ao shell
3. adaptar frontend ao host
4. consolidar QA
5. só então desativar o standalone da incubadora

## Fase 15A - Scaffold oficial do módulo

Entregue nesta rodada:

- `modules/fila-atendimento/`
- `module.manifest.json`
- `AGENTS.md` próprio
- plano de incorporação
- mapeamento de contratos consumidos

## Fase 15B - Backend

### Entradas prioritárias

- `incubadora/fila-atendimento/back/internal/modules/operations`
- `incubadora/fila-atendimento/back/internal/modules/reports`
- `incubadora/fila-atendimento/back/internal/modules/analytics`
- `incubadora/fila-atendimento/back/internal/modules/settings`
- `incubadora/fila-atendimento/back/internal/modules/consultants`
- `incubadora/fila-atendimento/back/internal/modules/realtime`

### Adaptações obrigatórias

- substituir `auth.Principal` concreto por `ActorContext`
- substituir tenant local por `TenantContext`
- substituir escopo local de lojas por `StoreScopeProvider`
- separar provisionamento de identidade de consultor via `IdentityProvisioner`
- formalizar eventos de operação e invalidação

### O que fica fora do módulo

- auth própria
- tenant system próprio
- CRUD principal de usuários
- cadastro principal de lojas

## Fase 15C - Frontend

### Entradas prioritárias

- `incubadora/fila-atendimento/web/app/features/operation`
- páginas de `operacao`, `relatorios`, `ranking`, `dados`, `inteligencia`
- páginas e stores de `configuracoes` e `consultor`, com split de host quando necessário

### Adaptações obrigatórias

- plugar via registry de rotas, menu e capacidades do host
- remover dependência rígida do runtime local da incubadora
- manter o host web como shell, não como dono da regra do módulo

## Fase 15D - Migrations e persistência

Decisões obrigatórias antes do cutover:

- quais tabelas passam a ser ownership explícito do módulo
- como separar persistência operacional do módulo de dados do shell
- como manter `consultants.user_id` como referência opaca ao shell

Regra:

- auth, tenant e usuário global não entram no ownership de persistência do módulo

## Fase 15E - QA e regressão

Unificar:

- `incubadora/fila-atendimento/qa-bot/scenarios/*`
- smoke do módulo já embutido no painel principal

Critério:

- todo fluxo crítico do módulo precisa ser validável sem subir um produto paralelo

## O que ainda falta

### Backend

O backend já está hospedado no `plataforma-api`, mas o domínio ainda não foi absorvido por completo para a fronteira oficial do módulo.

Falta fazer:

- absorver `operations`
- absorver `reports`
- absorver `analytics`
- absorver `settings`
- dividir `consultants` entre:
  - roster operacional do módulo
  - provisionamento de identidade via shell (`IdentityProvisioner`)
- adaptar `realtime` ao shell com `RealtimeContextResolver`
- remover dependência estrutural de `auth`, `tenants`, `stores` e `users` locais da incubadora
- consolidar ownership de migrations e tabelas no schema `fila_atendimento`
- transformar o backend da incubadora em referência temporária, e não em source principal de runtime

Resumo:

- do back, não falta subir
- do back, falta internalizar o código de domínio e cortar a dependência da incubadora

### Frontend

Hoje o `painel-web` já tem o host integrado do módulo, mas ainda não trouxe as telas reais do produto.

Falta fazer:

- trazer `operacao`
- trazer `relatorios`
- trazer `ranking`
- trazer `dados`
- trazer `inteligencia`
- trazer `configuracoes`
- trazer `consultor`
- migrar stores e composables do domínio para a fronteira oficial do módulo
- remover dependência rígida de `app-runtime` e `dashboard runtime`

Continuam fora do módulo:

- `auth`
- `usuarios`
- `multiloja`
- `perfil`
- `campanhas` por enquanto

Resumo:

- sim, do front ainda falta trazer praticamente todas as páginas reais do domínio
- o que existe hoje no `painel-web` é o host integrado, não o frontend completo do `fila-atendimento`
