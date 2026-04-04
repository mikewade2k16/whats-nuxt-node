# Platform Core — Guia do Serviço Go

Serviço central da plataforma: **autenticação, tenants, finanças e backoffice admin**. Go com chi router e pgx direto (sem ORM).

**Porta:** `4100` | **Schema PostgreSQL:** `platform_core` | **Go:** 1.22+

---

## Estrutura de Packages

```
apps/platform-core/
├── cmd/server/main.go              → entrypoint
├── cmd/migrate/main.go             → runner de migrations standalone
├── internal/
│   ├── config/config.go            → variáveis de ambiente
│   ├── database/
│   │   ├── db.go                   → pool pgxpool
│   │   └── migrate.go              → runner de migrations SQL
│   ├── domain/
│   │   ├── auth/                   → package auth (login, JWT, sessões)
│   │   ├── core/                   → package core (tenants, admin clients/users, RBAC)
│   │   └── finance/                → package finance (planilhas, config financeira)
│   ├── httpapi/
│   │   ├── router.go               → todas as rotas
│   │   ├── handlers/               → um handler struct por módulo
│   │   └── middleware/             → auth, rate limit, proxy
│   └── realtime/hub.go            → hub WebSocket
└── migrations/                     → SQL numeradas (0001–0012+)
```

---

## Padrões Go Obrigatórios

### Service Pattern

Cada módulo tem seu próprio `Service` struct com `*pgxpool.Pool`:

```go
// domain/finance/service.go
type Service struct {
    pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
    return &Service{pool: pool}
}
```

### Handler Pattern

Cada módulo tem seu próprio handler struct em `handlers/`:

```go
// handlers/finance.go
type FinanceHandler struct {
    service *finance.Service
}

func NewFinanceHandler(service *finance.Service) *FinanceHandler {
    return &FinanceHandler{service: service}
}

func (h *FinanceHandler) ListSheets(w http.ResponseWriter, r *http.Request) {
    claims, ok := authmw.ClaimsFromContext(r.Context())
    if !ok { writeError(w, 401, "unauthorized", "missing auth"); return }

    // 1. Parse request (query params ou body)
    // 2. Call service
    // 3. Write response
}
```

### Error Handling

```go
// Módulo define seus erros
var ErrNotFound = errors.New("not found")

// Handler mapeia erros para HTTP status
func (h *FinanceHandler) writeError(w http.ResponseWriter, err error, msg string) {
    switch {
    case errors.Is(err, finance.ErrNotFound):
        writeError(w, 404, "not_found", "resource not found")
    default:
        log.Printf("finance error [%s]: %v", msg, err)  // SEMPRE logar 500s
        writeError(w, 500, "internal_error", msg)
    }
}
```

### SQL Queries

```go
// BOM: query direta, campos explícitos, sem ORM
rows, err := s.pool.Query(ctx, `
    SELECT id, title, period FROM finance_sheets
    WHERE tenant_id = $1
    ORDER BY period DESC
    LIMIT $2 OFFSET $3
`, tenantID, limit, offset)

// RUIM: carregar dados desnecessários
// SELECT * FROM finance_sheets  ← nunca usar *
// Carregar 500 sheets com todas as lines para mostrar uma lista ← overload
```

### Payload Rules

```go
// BOM: tipos separados para lista vs detalhe
type SheetListItem struct {  // Lista: só metadata + summary
    ID, Title, Period, Status, ClientName, Preview
    Summary SheetSummary
}

type SheetDetail struct {  // Detalhe: inclui linhas completas
    SheetListItem
    Entradas, Saidas []Line
}

// RUIM: mesmo tipo para tudo
type Sheet struct {
    // 50 campos incluindo arrays nested...
    // retornado igual na lista de 120 items e no detalhe de 1 item
}
```

### Pagination

```go
const (
    defaultPageLimit = 50
    maxPageLimit     = 200
)

func normalizePageAndLimit(page, limit int) (int, int) {
    if page <= 0 { page = 1 }
    if limit <= 0 { limit = defaultPageLimit }
    if limit > maxPageLimit { limit = maxPageLimit }
    return page, limit
}
```

---

## Wiring (main.go → router)

```go
// cmd/server/main.go
authService := auth.NewService(pool, ...)
coreService := core.NewService(pool, ...)
financeService := finance.NewService(pool)

router := httpapi.NewRouter(httpapi.RouterDeps{
    AuthService:    authService,
    CoreService:    coreService,
    FinanceService: financeService,
    // ...
})
```

---

## Migrations

| # | Arquivo | Conteúdo |
|---|---------|---------|
| 0001–0010 | `core_schema.sql` ... `atendimento_defaults.sql` | Base, seeds, RBAC, admin |
| 0011 | `add_viewer_access_level.sql` | Nível viewer |
| 0012 | `finance_module.sql` | Finance: sheets, lines, adjustments, configs |

**Regras:**
- Nunca editar migration já aplicada — criar nova
- Usar `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`
- Sem FKs entre domínios que sofrem mutação simultânea (deadlock risk)
- Testar migration local antes de deploy

---

## Build e Deploy Local

**IMPORTANTE:** O platform-core é um binário Go compilado em imagem Docker. Qualquer alteração no código Go (rotas, handlers, services, migrations) **exige rebuild da imagem** para ter efeito localmente.

```bash
# Após qualquer mudança no código Go:
docker compose build platform-core
docker compose up -d platform-core
```

Sinal de imagem desatualizada: rotas que existem no `router.go` retornam **404** na chamada HTTP. Ex: o módulo `finance` foi adicionado mas a imagem ainda era a antiga → `GET /core/admin/finance-sheets` retornava 404 localmente, mas funcionava na VPS (que tinha feito deploy com `build`).

Na VPS o deploy já faz `docker compose build` automaticamente. Localmente é necessário rodar manualmente.

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `CORE_DATABASE_URL` | — | PostgreSQL connection string |
| `CORE_JWT_SECRET` | — | Segredo JWT (min 32 chars) |
| `CORE_HTTP_ADDR` | `:4100` | Porta |
| `CORE_DB_SCHEMA` | `platform_core` | Schema PostgreSQL |
| `CORE_AUTO_MIGRATE` | `false` | Rodar migrations no boot |
| `CORE_REDIS_URL` | — | Redis para rate limiting |
