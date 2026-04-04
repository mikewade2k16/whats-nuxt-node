# CLAUDE.md — Guia do Projeto

Leia este arquivo ANTES de qualquer tarefa. Cada serviço e módulo tem seu próprio CLAUDE.md com detalhes específicos.

---

## Arquitetura

```
Frontend (Nuxt 4)          →  BFF (Nuxt server/api/)  →  platform-core (:4100)  →  PostgreSQL (schema: platform_core)
apps/omni-nuxt-ui/app/       apps/omni-nuxt-ui/server/   apps/platform-core/        tabelas tenant_, finance_
                          →  apps/api (:4000)          →  PostgreSQL (schema: public, via Prisma)
```

| Serviço | Stack | Porta | CLAUDE.md |
|---------|-------|-------|-----------|
| **platform-core** | Go 1.22+ / chi / pgx | 4100 | [→](apps/platform-core/CLAUDE.md) |
| **apps/api** | Node.js / Fastify + Prisma | 4000 | [→](apps/api/CLAUDE.md) |
| **BFF + Frontend** | Nuxt 4 / Vue 3 / Pinia | 3000 | `apps/omni-nuxt-ui/` |

## Módulos do platform-core

| Módulo | Package | CLAUDE.md |
|--------|---------|-----------|
| **Auth** | `domain/auth/` | [→](apps/platform-core/internal/domain/auth/CLAUDE.md) |
| **Finance** | `domain/finance/` | [→](apps/platform-core/internal/domain/finance/CLAUDE.md) |
| **Core** (tenants, admin clients/users, RBAC) | `domain/core/` | [→](apps/platform-core/internal/domain/core/CLAUDE.md) |

---

## Stack e Versões

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| **Go** | 1.22+ | platform-core (API HTTP, lógica de negócio, SQL direto) |
| **PostgreSQL** | 16 | Banco de dados principal (schemas: `platform_core`, `public`) |
| **pgx/v5** | 5.x | Driver PostgreSQL para Go (sem ORM — queries SQL diretas) |
| **chi** | v5 | Router HTTP para Go |
| **Node.js** | 20+ | API de operação (Fastify) e BFF (Nuxt server) |
| **Fastify** | 4.x | API REST para dados operacionais (conversas, mensagens, WhatsApp) |
| **Prisma** | 5.x | ORM para apps/api (schema `public`) |
| **Nuxt** | 4 | Frontend SSR + BFF |
| **Vue** | 3.4+ | Componentes frontend (Composition API, `<script setup>`) |
| **Pinia** | 2.x | State management global |
| **Docker Compose** | — | Infra local e produção |
| **Redis** | 7 | Rate limiting, cache de sessão, pub/sub (Socket.IO) |
| **Socket.IO** | 4.x | Realtime (mensagens WhatsApp, eventos) |
| **Evolution API** | — | Gateway WhatsApp (instância externa) |

---

## Regras Gerais de Engenharia

### Payloads e Respostas

- **Nunca retornar dados desnecessários.** Se a listagem só precisa de título e resumo, NÃO carregar linhas/detalhes filhos.
- **Separar DTOs de lista vs detalhe.** `ListItem` (campos mínimos) e `Detail` (dados completos) são tipos distintos.
- **Limitar paginação.** Default: 50 itens. Máximo absoluto: 200. Nunca permitir `limit=500` com dados nested.
- **Calcular agregações em SQL.** Somas, contagens e resumos devem ser calculados no banco, não carregando N registros em memória.
- **Máximo de profundidade de nesting: 2 níveis.** Ex: `Sheet → Lines` ok. `Sheet → Lines → Adjustments` só no detalhe, nunca em listas.

### Banco de Dados

- **Sem gambiarras.** Queries devem ser eficientes e usar índices. Evitar N+1.
- **Transactions apenas quando necessário.** Operações simples (single row update) não precisam de `BEGIN/COMMIT`.
- **FKs com cuidado.** Não criar FK entre domínios que sofrem mutação simultânea (causa deadlocks). Usar soft references quando apropriado.
- **Schema `platform_core`** para tabelas do platform-core. Schema `public` para Prisma/apps/api.
- **Migrations numeradas** em `apps/platform-core/migrations/`. Nunca editar migrations já aplicadas — criar novas.

### Go (platform-core)

- **Um package por módulo de domínio.** `domain/auth/`, `domain/finance/`, `domain/core/`. Cada um com seu `Service` struct, types, e handler.
- **Service struct minimal.** Apenas `*pgxpool.Pool` + config necessária. Sem god objects.
- **Erros tipados.** Usar `errors.New()` com `errors.Is()` no handler para mapear HTTP status codes.
- **Handler pattern.** Claims do JWT → decode request → call service → write response. Sem lógica de negócio no handler.
- **Log erros internos.** Todo `500 Internal Server Error` deve logar o erro real com `log.Printf`.
- **Sem reflection/generics desnecessários.** Código explícito e legível > código "elegante".

### Node.js (apps/api + BFF)

- **BFF é proxy fino.** O BFF (`omni-nuxt-ui/server/api/`) só faz auth + proxy para platform-core ou apps/api. Sem lógica de negócio.
- **`coreAdminFetch`** para chamar platform-core. `apiFetch` para chamar apps/api.
- **Prisma queries com `select`.** Sempre especificar campos retornados, nunca `findMany()` sem filtro.
- **Rate limiting** em endpoints sensíveis (login, profile update, envio de mensagem).

### Frontend (Nuxt/Vue)

- **Composables isolados.** Cada funcionalidade em seu próprio composable. Um composable não deve ter 1000+ linhas.
- **Pinia para estado global.** Composables para lógica de feature. Não misturar.
- **Tipos TypeScript** para todos os dados da API. Nunca `any` em responses.
- **Sem chamadas de API diretas em componentes.** Sempre via composable ou store.

---

## Padrão de Módulo Go (platform-core)

Cada módulo segue esta estrutura (exemplo: `finance`):

```
internal/domain/finance/
├── service.go          → Service struct + métodos públicos
├── helpers.go          → funções auxiliares internas
├── types.go            → structs de input/output
├── errors.go           → erros tipados do módulo
└── CLAUDE.md           → documentação do módulo

internal/httpapi/handlers/
├── finance.go          → FinanceHandler struct + handlers HTTP

migrations/
├── 0012_finance.sql    → tabelas do módulo
```

### Checklist para novo módulo

1. Criar package em `domain/novo/` com Service struct
2. Definir tipos (input/output separados)
3. Implementar service methods com SQL direto (pgx)
4. Criar handler em `handlers/novo.go` com handler struct próprio
5. Registrar rotas em `router.go`
6. Criar CLAUDE.md no package documentando endpoints e tipos
7. Adicionar migration se precisar de tabelas
8. Atualizar este arquivo (índice de módulos)

---

## Deploy

- **Local:** `docker compose up -d`
- **Produção (VPS):** Ver [docs/deploy-vps.md](docs/deploy-vps.md)
- **Migrations:** `CORE_AUTO_MIGRATE=true` no `.env` roda automaticamente no boot
- **Após alterar schema Prisma:** Regenerar client no container worker/api
