# Módulo Auth — platform-core

Responsável por **autenticação de usuários**: login, logout, sessões persistidas e validação de JWT.

**Status:** ✅ Completo e em produção

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | Lógica principal: `Login`, `Logout`, `Me`, `ValidateSession`, `ParseToken` |
| `types.go` | Tipos: `LoginInput`, `LoginOutput`, `Claims`, `UserSummary`, `MeOutput` |
| `errors.go` | Erro único: `ErrUnauthorized` |

**Handler HTTP:** `../../httpapi/handlers/auth.go`
**Middleware:** `../../httpapi/middleware/auth.go` — `RequireAuth`, `ClaimsFromContext`

---

## Endpoints

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/core/auth/login` | — | Login com email + senha (+ tenantId opcional) |
| `POST` | `/core/auth/logout` | JWT | Revoga a sessão ativa |
| `GET` | `/core/auth/me` | JWT | Retorna perfil do usuário autenticado |
| `PATCH` | `/core/auth/profile` | JWT | Atualiza campos do próprio perfil (handler em core_admin_manage.go) |

> Rate limit em login: **50 req / 5min, block 2min**

---

## Tabelas PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `users` | Usuários: email, password_hash, is_platform_admin, status, nick, preferences |
| `user_sessions` | Sessões: token_hash (sha256), expires_at, status (active/revoked), ip, user_agent |
| `tenant_users` | Resolvedor de tenant no login: qual tenant o user pertence |

---

## Fluxo de Login (`service.go:Login`)

```
1. Busca user por email em `users` (LIMIT 1)
2. Verifica status = 'active'
3. bcrypt.CompareHashAndPassword(hash, password)
4. resolveTenantID:
   - Se tenantId passado no body: valida em tenant_users
   - Senão: pega o melhor tenant (is_owner DESC, created_at ASC)
   - Platform admin sem tenant: retorna tenantID = "" (permitido)
5. Gera JWT com Claims
6. Persiste sessão em user_sessions (status: active)
7. Retorna { accessToken, expiresAt, user: UserSummary }
```

---

## Claims JWT

```go
type Claims struct {
    TenantID        string `json:"tenant_id,omitempty"`  // UUID do tenant (vazio para root admin sem tenant)
    SessionID       string `json:"sid"`                   // UUID da sessão em user_sessions
    IsPlatformAdmin bool   `json:"is_platform_admin"`
    jwt.RegisteredClaims                                  // Subject = userUUID, Issuer, ExpiresAt
}
```

**Extrair nos handlers:**
```go
claims, ok := authmw.ClaimsFromContext(r.Context())
// claims.Subject          → userUUID (string)
// claims.TenantID         → tenantUUID (string, pode ser "")
// claims.IsPlatformAdmin  → bool
// claims.SessionID        → sessionUUID
```

---

## Validação de Sessão

`ValidateSession` é chamado pelo middleware `RequireAuth` em toda rota protegida:
```sql
SELECT s.status, s.expires_at, u.status
FROM user_sessions s JOIN users u ON u.id = s.user_id
WHERE s.id = $sessionID AND s.user_id = $userUUID
```
Rejeita se: sessão revogada, expirada ou usuário inativo.

---

## Notas de Segurança

- Token JWT não é armazenado — apenas seu sha256 hash em `user_sessions`
- Logout revoga a sessão no banco (não basta expirar o JWT)
- Platform admins podem logar sem tenant associado
- O campo `PATCH /core/auth/profile` para troca de senha exige verificação da senha atual
