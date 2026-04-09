# CLAUDE.md â€” Guia do Projeto

Leia este arquivo ANTES de qualquer tarefa. Cada serviÃ§o e mÃ³dulo tem seu prÃ³prio CLAUDE.md com detalhes especÃ­ficos.

---

## Arquitetura

```
Frontend (Nuxt 4)          â†’  BFF (Nuxt server/api/)  â†’  plataforma-api (:4100)  â†’  PostgreSQL (schema: platform_core)
apps/painel-web/app/       apps/painel-web/server/   apps/plataforma-api/        tabelas tenant_, finance_
                          â†’  apps/atendimento-online-api (:4000)          â†’  PostgreSQL (schema: public, via Prisma)
```

| ServiÃ§o | Stack | Porta | CLAUDE.md |
|---------|-------|-------|-----------|
| **plataforma-api** | Go 1.22+ / chi / pgx | 4100 | [â†’](apps/plataforma-api/CLAUDE.md) |
| **apps/atendimento-online-api** | Node.js / Fastify + Prisma | 4000 | [â†’](apps/atendimento-online-api/CLAUDE.md) |
| **BFF + Frontend** | Nuxt 4 / Vue 3 / Pinia | 3000 | `apps/painel-web/` |

## MÃ³dulos do plataforma-api

| MÃ³dulo | Package | CLAUDE.md |
|--------|---------|-----------|
| **Auth** | `domain/auth/` | [â†’](apps/plataforma-api/internal/domain/auth/CLAUDE.md) |
| **Finance** | `domain/finance/` | [â†’](apps/plataforma-api/internal/domain/finance/CLAUDE.md) |
| **Core** (tenants, admin clients/users, RBAC) | `domain/core/` | [â†’](apps/plataforma-api/internal/domain/core/CLAUDE.md) |

---

## Stack e VersÃµes

| Tecnologia | VersÃ£o | Uso |
|------------|--------|-----|
| **Go** | 1.22+ | plataforma-api (API HTTP, lÃ³gica de negÃ³cio, SQL direto) |
| **PostgreSQL** | 16 | Banco de dados principal (schemas: `platform_core`, `public`) |
| **pgx/v5** | 5.x | Driver PostgreSQL para Go (sem ORM â€” queries SQL diretas) |
| **chi** | v5 | Router HTTP para Go |
| **Node.js** | 20+ | API de operaÃ§Ã£o (Fastify) e BFF (Nuxt server) |
| **Fastify** | 4.x | API REST para dados operacionais (conversas, mensagens, WhatsApp) |
| **Prisma** | 5.x | ORM para apps/atendimento-online-api (schema `public`) |
| **Nuxt** | 4 | Frontend SSR + BFF |
| **Vue** | 3.4+ | Componentes frontend (Composition API, `<script setup>`) |
| **Pinia** | 2.x | State management global |
| **Docker Compose** | â€” | Infra local e produÃ§Ã£o |
| **Redis** | 7 | Rate limiting, cache de sessÃ£o, pub/sub (Socket.IO) |
| **Socket.IO** | 4.x | Realtime (mensagens WhatsApp, eventos) |
| **Evolution API** | â€” | Gateway WhatsApp (instÃ¢ncia externa) |

---

## Regras Gerais de Engenharia

### Payloads e Respostas

- **Nunca retornar dados desnecessÃ¡rios.** Se a listagem sÃ³ precisa de tÃ­tulo e resumo, NÃƒO carregar linhas/detalhes filhos.
- **Separar DTOs de lista vs detalhe.** `ListItem` (campos mÃ­nimos) e `Detail` (dados completos) sÃ£o tipos distintos.
- **Limitar paginaÃ§Ã£o.** Default: 50 itens. MÃ¡ximo absoluto: 200. Nunca permitir `limit=500` com dados nested.
- **Calcular agregaÃ§Ãµes em SQL.** Somas, contagens e resumos devem ser calculados no banco, nÃ£o carregando N registros em memÃ³ria.
- **MÃ¡ximo de profundidade de nesting: 2 nÃ­veis.** Ex: `Sheet â†’ Lines` ok. `Sheet â†’ Lines â†’ Adjustments` sÃ³ no detalhe, nunca em listas.

### Banco de Dados

- **Sem gambiarras.** Queries devem ser eficientes e usar Ã­ndices. Evitar N+1.
- **Transactions apenas quando necessÃ¡rio.** OperaÃ§Ãµes simples (single row update) nÃ£o precisam de `BEGIN/COMMIT`.
- **FKs com cuidado.** NÃ£o criar FK entre domÃ­nios que sofrem mutaÃ§Ã£o simultÃ¢nea (causa deadlocks). Usar soft references quando apropriado.
- **Schema `platform_core`** para tabelas do plataforma-api. Schema `public` para Prisma/apps/atendimento-online-api.
- **Migrations numeradas** em `apps/plataforma-api/migrations/`. Nunca editar migrations jÃ¡ aplicadas â€” criar novas.

### Go (plataforma-api)

- **Um package por mÃ³dulo de domÃ­nio.** `domain/auth/`, `domain/finance/`, `domain/core/`. Cada um com seu `Service` struct, types, e handler.
- **Service struct minimal.** Apenas `*pgxpool.Pool` + config necessÃ¡ria. Sem god objects.
- **Erros tipados.** Usar `errors.New()` com `errors.Is()` no handler para mapear HTTP status codes.
- **Handler pattern.** Claims do JWT â†’ decode request â†’ call service â†’ write response. Sem lÃ³gica de negÃ³cio no handler.
- **Log erros internos.** Todo `500 Internal Server Error` deve logar o erro real com `log.Printf`.
- **Sem reflection/generics desnecessÃ¡rios.** CÃ³digo explÃ­cito e legÃ­vel > cÃ³digo "elegante".

### Node.js (apps/atendimento-online-api + BFF)

- **BFF Ã© proxy fino.** O BFF (`painel-web/server/api/`) sÃ³ faz auth + proxy para plataforma-api ou apps/atendimento-online-api. Sem lÃ³gica de negÃ³cio.
- **`coreAdminFetch`** para chamar plataforma-api. `apiFetch` para chamar apps/atendimento-online-api.
- **Prisma queries com `select`.** Sempre especificar campos retornados, nunca `findMany()` sem filtro.
- **Rate limiting** em endpoints sensÃ­veis (login, profile update, envio de mensagem).

### Frontend (Nuxt/Vue)

- **Composables isolados.** Cada funcionalidade em seu prÃ³prio composable. Um composable nÃ£o deve ter 1000+ linhas.
- **Pinia para estado global.** Composables para lÃ³gica de feature. NÃ£o misturar.
- **Tipos TypeScript** para todos os dados da API. Nunca `any` em responses.
- **Sem chamadas de API diretas em componentes.** Sempre via composable ou store.

---

## PadrÃ£o de MÃ³dulo Go (plataforma-api)

Cada mÃ³dulo segue esta estrutura (exemplo: `finance`):

```
internal/domain/finance/
â”œâ”€â”€ service.go          â†’ Service struct + mÃ©todos pÃºblicos
â”œâ”€â”€ helpers.go          â†’ funÃ§Ãµes auxiliares internas
â”œâ”€â”€ types.go            â†’ structs de input/output
â”œâ”€â”€ errors.go           â†’ erros tipados do mÃ³dulo
â””â”€â”€ CLAUDE.md           â†’ documentaÃ§Ã£o do mÃ³dulo

internal/httpapi/handlers/
â”œâ”€â”€ finance.go          â†’ FinanceHandler struct + handlers HTTP

migrations/
â”œâ”€â”€ 0012_finance.sql    â†’ tabelas do mÃ³dulo
```

### Checklist para novo mÃ³dulo

1. Criar package em `domain/novo/` com Service struct
2. Definir tipos (input/output separados)
3. Implementar service methods com SQL direto (pgx)
4. Criar handler em `handlers/novo.go` com handler struct prÃ³prio
5. Registrar rotas em `router.go`
6. Criar CLAUDE.md no package documentando endpoints e tipos
7. Adicionar migration se precisar de tabelas
8. Atualizar este arquivo (Ã­ndice de mÃ³dulos)

---

## Deploy

- **Local:** `docker compose up -d`
- **ProduÃ§Ã£o (VPS):** Ver [docs/deploy-vps.md](docs/deploy-vps.md)
- **Migrations:** `CORE_AUTO_MIGRATE=true` no `.env` roda automaticamente no boot
- **ApÃ³s alterar schema Prisma:** Regenerar client no container worker/api
