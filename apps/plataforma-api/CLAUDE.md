# Platform Core Ã¢â‚¬â€ Guia do ServiÃƒÂ§o Go

ServiÃƒÂ§o central da plataforma: **autenticaÃƒÂ§ÃƒÂ£o, tenants, finanÃƒÂ§as e backoffice admin**. Go com chi router e pgx direto (sem ORM).

**Porta:** `4100` | **Schema PostgreSQL:** `platform_core` | **Go:** 1.22+

---

## Estrutura de Packages

```
apps/plataforma-api/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ cmd/server/main.go              Ã¢â€ â€™ entrypoint
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ cmd/migrate/main.go             Ã¢â€ â€™ runner de migrations standalone
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ internal/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ config/config.go            Ã¢â€ â€™ variÃƒÂ¡veis de ambiente
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ database/
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ db.go                   Ã¢â€ â€™ pool pgxpool
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ migrate.go              Ã¢â€ â€™ runner de migrations SQL
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ domain/
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ auth/                   Ã¢â€ â€™ package auth (login, JWT, sessÃƒÂµes)
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ core/                   Ã¢â€ â€™ package core (tenants, admin clients/users, RBAC)
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ finance/                Ã¢â€ â€™ package finance (planilhas, config financeira)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ httpapi/
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ router.go               Ã¢â€ â€™ todas as rotas
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ handlers/               Ã¢â€ â€™ um handler struct por mÃƒÂ³dulo
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ middleware/             Ã¢â€ â€™ auth, rate limit, proxy
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ realtime/hub.go            Ã¢â€ â€™ hub WebSocket
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ migrations/                     Ã¢â€ â€™ SQL numeradas (0001Ã¢â‚¬â€œ0012+)
```

---

## PadrÃƒÂµes Go ObrigatÃƒÂ³rios

### Service Pattern

Cada mÃƒÂ³dulo tem seu prÃƒÂ³prio `Service` struct com `*pgxpool.Pool`:

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

Cada mÃƒÂ³dulo tem seu prÃƒÂ³prio handler struct em `handlers/`:

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
// MÃƒÂ³dulo define seus erros
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
// BOM: query direta, campos explÃƒÂ­citos, sem ORM
rows, err := s.pool.Query(ctx, `
    SELECT id, title, period FROM finance_sheets
    WHERE tenant_id = $1
    ORDER BY period DESC
    LIMIT $2 OFFSET $3
`, tenantID, limit, offset)

// RUIM: carregar dados desnecessÃƒÂ¡rios
// SELECT * FROM finance_sheets  Ã¢â€ Â nunca usar *
// Carregar 500 sheets com todas as lines para mostrar uma lista Ã¢â€ Â overload
```

### Payload Rules

```go
// BOM: tipos separados para lista vs detalhe
type SheetListItem struct {  // Lista: sÃƒÂ³ metadata + summary
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

## Wiring (main.go Ã¢â€ â€™ router)

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

| # | Arquivo | ConteÃƒÂºdo |
|---|---------|---------|
| 0001Ã¢â‚¬â€œ0010 | `core_schema.sql` ... `atendimento_defaults.sql` | Base, seeds, RBAC, admin |
| 0011 | `add_viewer_access_level.sql` | NÃƒÂ­vel viewer |
| 0012 | `finance_module.sql` | Finance: sheets, lines, adjustments, configs |

**Regras:**
- Nunca editar migration jÃƒÂ¡ aplicada Ã¢â‚¬â€ criar nova
- Usar `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`
- Sem FKs entre domÃƒÂ­nios que sofrem mutaÃƒÂ§ÃƒÂ£o simultÃƒÂ¢nea (deadlock risk)
- Testar migration local antes de deploy

---

## Build e Deploy Local

**IMPORTANTE:** O plataforma-api ÃƒÂ© um binÃƒÂ¡rio Go compilado em imagem Docker. Qualquer alteraÃƒÂ§ÃƒÂ£o no cÃƒÂ³digo Go (rotas, handlers, services, migrations) **exige rebuild da imagem** para ter efeito localmente.

```bash
# ApÃƒÂ³s qualquer mudanÃƒÂ§a no cÃƒÂ³digo Go:
docker compose build plataforma-api
docker compose up -d plataforma-api
```

Sinal de imagem desatualizada: rotas que existem no `router.go` retornam **404** na chamada HTTP. Ex: o mÃƒÂ³dulo `finance` foi adicionado mas a imagem ainda era a antiga Ã¢â€ â€™ `GET /core/admin/finance-sheets` retornava 404 localmente, mas funcionava na VPS (que tinha feito deploy com `build`).

Na VPS o deploy jÃƒÂ¡ faz `docker compose build` automaticamente. Localmente ÃƒÂ© necessÃƒÂ¡rio rodar manualmente.

---

## VariÃƒÂ¡veis de Ambiente

| VariÃƒÂ¡vel | PadrÃƒÂ£o | DescriÃƒÂ§ÃƒÂ£o |
|----------|--------|-----------|
| `CORE_DATABASE_URL` | Ã¢â‚¬â€ | PostgreSQL connection string |
| `CORE_JWT_SECRET` | Ã¢â‚¬â€ | Segredo JWT (min 32 chars) |
| `CORE_HTTP_ADDR` | `:4100` | Porta |
| `CORE_DB_SCHEMA` | `platform_core` | Schema PostgreSQL |
| `CORE_AUTO_MIGRATE` | `false` | Rodar migrations no boot |
| `CORE_REDIS_URL` | Ã¢â‚¬â€ | Redis para rate limiting |
