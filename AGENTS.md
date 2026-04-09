# AGENTS.md

Este arquivo define as regras de engenharia do repositorio.

- `AGENT.md` na raiz e memoria operacional de deploy/debug.
- `AGENTS.md` e fonte de verdade para arquitetura, limites de payload e padroes de implementacao.
- `CLAUDE.md` existentes passam a ser legado de referencia. Novas regras devem nascer em `AGENTS.md`.

## Objetivo do projeto

Nao queremos codigo que apenas "funcione".
Queremos modulos isolados, payloads enxutos, contratos previsiveis, observabilidade minima e manutencao segura.

## Mapa rapido

```text
apps/painel-web/   -> frontend Nuxt 4 + BFF
apps/atendimento-online-api/            -> API operacional Node/Fastify + Prisma
apps/plataforma-api/  -> servico Go de auth, admin, tenants e modulos de negocio
incubadora/fila-atendimento/    -> projeto incorporado ao repo; candidato ao modulo plugavel de fila-atendimento
modules/fila-atendimento/ -> scaffold oficial do modulo fila-atendimento em extracao
docs/                -> deploy, troubleshooting, playbooks
packages/            -> contratos comuns do shell e adapters tecnicos de modulo
scripts/             -> automacoes de diagnostico, monitoramento e auditoria
```

## Estado auditado do repositorio

- `apps/painel-web` e o front ativo no runtime atual.
- `old_web` foi removido do repositorio em `2026-04-04` apos migracao do harness de testes e limpeza das referencias restantes.
- `apps/painel-web` possui o harness ativo de `test:composables`.
- `apps/atendimento-online-api` agora aceita `core token` como sessao principal em HTTP e realtime; o shadow local do modulo ficou restrito ao contexto operacional usado por `POST /session/context` e compatibilidade.
- `apps/atendimento-online-api` usa schema `public` do Postgres para dados operacionais do modulo.
- `apps/plataforma-api` usa schema `platform_core` para identidade, tenants, modulos, admin e finance.
- `incubadora/fila-atendimento` entrou no repo em `2026-04-04` como projeto originalmente standalone, com `web/` Nuxt e `back/` Go.
- `fila-atendimento` agora roda hospedado na stack principal: o backend sobe dentro do `plataforma-api`, o front entra pelo `painel-web` e a persistencia usa o mesmo PostgreSQL com schema proprio (`fila_atendimento`).
- `fila-atendimento` agora tambem possui uma primeira ponte de sessao pelo shell: o `painel-web` emite um bridge efemero e o modulo troca isso por sessao propria.
- `fila-atendimento` e um modulo diferente de `atendimento-online`.
- `atendimento-online` continua sendo o dominio operacional digital atual, hoje centrado em WhatsApp e preparado para Instagram depois.
- a parte mais reaproveitavel de `incubadora/fila-atendimento` hoje esta no nucleo `operations + realtime + reports + analytics + settings`; `auth`, `tenants`, `stores` e `users` devem ser adaptados ao shell antes de qualquer fusao definitiva.
- regra de contratos: `HTTP + JSON` e a borda canonica, mas adapters internos podem usar tipos nativos quando isso nao violar o contrato publicado.

## Stack oficial

- Frontend: Nuxt 4, Vue 3, Pinia, TypeScript
- BFF: Nuxt server routes
- API operacional: Node.js, Fastify, Prisma
- Core: Go, chi, pgx, PostgreSQL
- Infra: Docker Compose, Redis, Caddy

## Regras globais

### Linguagem, texto e encoding

- O time e os usuarios principais deste projeto sao brasileiros.
- Documentacao, comentarios, textos de UI, playbooks operacionais e comunicacoes escritas do projeto devem usar `pt-BR` como padrao.
- Quando houver texto formal, preferir redacao clara em `pt-BR` com estilo tecnico consistente com ABNT.
- Preservar acentuacao correta em portugues (`acao` so quando o contexto exigir ASCII; em texto normal usar `ação`).
- Ao editar arquivos textuais com conteudo em `pt-BR`, preservar `UTF-8` e evitar conversoes de encoding que gerem mojibake (`Ã`, `â€¦`, `Â` etc.).
- Antes de aplicar substituicoes em massa em docs/playbooks, validar se o arquivo manteve acentos, cedilha e travesso corretamente.

### Payloads e respostas

- Toda listagem deve ter DTO proprio de lista.
- Todo detalhe deve ter DTO proprio de detalhe.
- Lista nao carrega filhos pesados por conveniencia.
- Ajustes, historicos, composicoes e arrays nested so entram em endpoint de detalhe.
- Limite padrao de pagina: `50`.
- Limite maximo de pagina: `200`, salvo justificativa tecnica forte.
- Resposta HTTP deve trazer apenas o que o consumidor usa na tela atual.
- BFF nao deve remontar payload gigante nem agregar dados sem necessidade.

### Banco e persistencia

- Sem `SELECT *`.
- Sem N+1 evitavel.
- Somatorios, contagens e previews devem ser feitos em SQL quando possivel.
- Migrations sao imutaveis: nunca editar migration ja aplicada, sempre criar outra.
- Cada modulo dono dos seus tipos, queries e helpers.

### Fronteiras de modulo

- Funcionalidade nova entra em modulo proprio quando tiver regras de negocio, tabelas ou contratos proprios.
- Um modulo nao deve depender de detalhes internos de outro sem passar por contrato explicito.
- Handler HTTP nao carrega regra de negocio.
- BFF e proxy fino com auth, sanitizacao e composicao minima.

### Qualidade minima

- Go: `go test ./...` obrigatorio para mudancas no `plataforma-api`.
- Front/BFF: validar build ou, quando o ambiente local bloquear, registrar claramente o motivo.
- Tipos compartilhados devem refletir fielmente o contrato da API.
- Datas automaticas de negocio devem usar timezone explicita. Nao usar UTC por padrao em regras de dominio.

## Padroes por area

- `docs/padrao-agents-modulo.md`
- `docs/protocolo-orquestracao-modulos.md`
- `packages/shell-contracts/README.md`
- `PADRAO-MODULOS-ORQUESTRADOS.md`
- `apps/plataforma-api/AGENTS.md`
- `apps/plataforma-api/internal/domain/auth/AGENTS.md`
- `apps/plataforma-api/internal/domain/core/AGENTS.md`
- `apps/plataforma-api/internal/domain/finance/AGENTS.md`

Regra:

- todo modulo novo deve nascer com `AGENTS.md` proprio seguindo `docs/padrao-agents-modulo.md`
- modulos existentes devem ser trazidos gradualmente para esse formato, declarando responsabilidades, contratos consumidos, contratos exportados, persistencia, interfaces expostas e limites de conhecimento

## Anti-padroes proibidos

- Endpoint de lista retornando objeto de detalhe completo.
- Componente Vue chamando API diretamente sem composable/store.
- Service de dominio com conhecimento de tela ou formato do frontend.
- Reaproveitar um "god package" por comodidade quando o modulo ja merece package proprio.
- Aceitar payload gigante por falta de DTO especifico.

