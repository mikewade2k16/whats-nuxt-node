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
apps/omni-nuxt-ui/   -> frontend Nuxt 4 + BFF
apps/api/            -> API operacional Node/Fastify + Prisma
apps/platform-core/  -> servico Go de auth, admin, tenants e modulos de negocio
docs/                -> deploy, troubleshooting, playbooks
```

## Stack oficial

- Frontend: Nuxt 4, Vue 3, Pinia, TypeScript
- BFF: Nuxt server routes
- API operacional: Node.js, Fastify, Prisma
- Core: Go, chi, pgx, PostgreSQL
- Infra: Docker Compose, Redis, Caddy

## Regras globais

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

- Go: `go test ./...` obrigatorio para mudancas no `platform-core`.
- Front/BFF: validar build ou, quando o ambiente local bloquear, registrar claramente o motivo.
- Tipos compartilhados devem refletir fielmente o contrato da API.
- Datas automaticas de negocio devem usar timezone explicita. Nao usar UTC por padrao em regras de dominio.

## Padroes por area

- `apps/platform-core/AGENTS.md`
- `apps/platform-core/internal/domain/auth/AGENTS.md`
- `apps/platform-core/internal/domain/core/AGENTS.md`
- `apps/platform-core/internal/domain/finance/AGENTS.md`

## Anti-padroes proibidos

- Endpoint de lista retornando objeto de detalhe completo.
- Componente Vue chamando API diretamente sem composable/store.
- Service de dominio com conhecimento de tela ou formato do frontend.
- Reaproveitar um "god package" por comodidade quando o modulo ja merece package proprio.
- Aceitar payload gigante por falta de DTO especifico.
