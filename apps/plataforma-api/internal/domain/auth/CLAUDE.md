# MÃ³dulo Auth â€” plataforma-api

ResponsÃ¡vel por **autenticaÃ§Ã£o de usuÃ¡rios**: login, logout, sessÃµes persistidas e validaÃ§Ã£o de JWT.

**Status:** âœ… Completo e em produÃ§Ã£o

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | LÃ³gica principal: `Login`, `Logout`, `Me`, `ValidateSession`, `ParseToken` |
| `types.go` | Tipos: `LoginInput`, `LoginOutput`, `Claims`, `UserSummary`, `MeOutput` |
| `errors.go` | Erros de auth e negaÃ§Ãµes tipadas de login (`ErrUnauthorized`, `ErrUserInactive`, `ErrUserBlocked`, `ErrUserPendingInvite`, `ErrTenantMembership`) |

**Handler HTTP:** `../../httpapi/handlers/auth.go`
**Middleware:** `../../httpapi/middleware/auth.go` â€” `RequireAuth`, `ClaimsFromContext`

---

## Endpoints

| MÃ©todo | Path | Auth | DescriÃ§Ã£o |
|--------|------|------|-----------|
| `POST` | `/core/auth/login` | â€” | Login com email + senha (+ tenantId opcional) |
| `POST` | `/core/auth/logout` | JWT | Revoga a sessÃ£o ativa |
| `GET` | `/core/auth/me` | JWT | Retorna perfil do usuÃ¡rio autenticado |
| `PATCH` | `/core/auth/profile` | JWT | Atualiza campos do prÃ³prio perfil (handler em core_admin_manage.go) |

> Rate limit em login: **50 req / 5min, block 2min**

---

## Tabelas PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `users` | UsuÃ¡rios: email, password_hash, is_platform_admin, status, nick, preferences |
| `user_sessions` | SessÃµes: token_hash (sha256), expires_at, status (active/revoked), ip, user_agent |
| `tenant_users` | Resolvedor de tenant no login: qual tenant o user pertence |

---

## Fluxo de Login (`service.go:Login`)

```
1. Busca user por email em `users` (LIMIT 1)
2. Verifica status do usuÃ¡rio e retorna erro tipado quando estiver `inactive`, `blocked` ou `pending_invite`
3. bcrypt.CompareHashAndPassword(hash, password)
4. resolveTenantID:
   - Se tenantId passado no body: valida em tenant_users
   - SenÃ£o: pega o melhor tenant (is_owner DESC, created_at ASC)
   - Platform admin sem tenant: retorna tenantID = "" (permitido)
    - UsuÃ¡rio administrativo sem tenant/cliente ativo deve falhar com mensagem descritiva, nÃ£o como senha invalida
5. Gera JWT com Claims
6. Persiste sessÃ£o em user_sessions (status: active)
7. Retorna { accessToken, expiresAt, user: UserSummary }
```

---

## Claims JWT

```go
type Claims struct {
    TenantID        string `json:"tenant_id,omitempty"`  // UUID do tenant (vazio para root admin sem tenant)
    SessionID       string `json:"sid"`                   // UUID da sessÃ£o em user_sessions
    IsPlatformAdmin bool   `json:"is_platform_admin"`
    jwt.RegisteredClaims                                  // Subject = userUUID, Issuer, ExpiresAt
}
```

**Extrair nos handlers:**
```go
claims, ok := authmw.ClaimsFromContext(r.Context())
// claims.Subject          â†’ userUUID (string)
// claims.TenantID         â†’ tenantUUID (string, pode ser "")
// claims.IsPlatformAdmin  â†’ bool
// claims.SessionID        â†’ sessionUUID
```

---

## ValidaÃ§Ã£o de SessÃ£o

`ValidateSession` Ã© chamado pelo middleware `RequireAuth` em toda rota protegida:
```sql
SELECT s.status, s.expires_at, u.status
FROM user_sessions s JOIN users u ON u.id = s.user_id
WHERE s.id = $sessionID AND s.user_id = $userUUID
```
Rejeita se: sessÃ£o revogada, expirada ou usuÃ¡rio inativo.

---

## Notas de SeguranÃ§a

- Token JWT nÃ£o Ã© armazenado â€” apenas seu sha256 hash em `user_sessions`
- Logout revoga a sessÃ£o no banco (nÃ£o basta expirar o JWT)
- Platform admins podem logar sem tenant associado
- O campo `PATCH /core/auth/profile` para troca de senha exige verificaÃ§Ã£o da senha atual
