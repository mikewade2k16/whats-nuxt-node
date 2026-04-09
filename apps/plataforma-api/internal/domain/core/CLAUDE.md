# MÃ³dulo Core â€” plataforma-api

MÃ³dulo **compartilhado** da plataforma: tenants, admin clients, admin users, memberships, RBAC e limites de tenant.

**Regra principal:** `domain/core` nÃ£o Ã© depÃ³sito de funcionalidades novas. Feature com tabelas, endpoints e lÃ³gica prÃ³pria vai para `internal/domain/<modulo>/`.

---

## Arquivos Esperados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | Service struct + mÃ©todos pÃºblicos de tenants/users/RBAC |
| `types.go` | Tipos separados por contexto (tenant, user, membership) |
| `errors.go` | Erros tipados do mÃ³dulo |

**Handler HTTP:** `../../httpapi/handlers/core_admin_*.go`

---

## Escopo do MÃ³dulo

O que **pertence** ao core:

- Tenants: criaÃ§Ã£o, atualizaÃ§Ã£o, listagem administrativa
- Admin clients e admin users (backoffice)
- Memberships: vÃ­nculo usuÃ¡rioâ†”tenant com roles
- RBAC: permissÃµes e nÃ­veis de acesso (viewer, operator, admin, owner)
- Limites de tenant: usuÃ¡rios mÃ¡ximos, mÃ³dulos habilitados

O que **nÃ£o pertence** ao core (extrair para mÃ³dulo prÃ³prio):

- Qualquer feature com tabelas prÃ³prias
- DTOs independentes do restante
- Handlers dedicados comeÃ§ando a surgir

---

## Regras de DomÃ­nio

- Arquivos pequenos por subdomÃ­nio â€” evitar arquivos grandes misturando contextos
- Tipos separados por contexto (`TenantListItem` â‰  `TenantDetail`)
- Helpers locais sem vazar regra de outro mÃ³dulo
- Sem payloads pesados em listagens administrativas
- Novos mÃ³dulos de negÃ³cio nunca entram aqui por inÃ©rcia

---

## Quando Extrair de Core

- O arquivo cresce ao ponto de misturar contextos de negÃ³cio distintos
- Os DTOs de uma feature ficam independentes do restante do core
- Surgem handlers dedicados para a feature
- A feature tem migrations prÃ³prias separadas

---

## Schema PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `tenants` | Tenants da plataforma |
| `tenant_users` | VÃ­nculo usuÃ¡rioâ†”tenant (role, status) |
| `admin_clients` | Clientes do backoffice admin |
| `admin_users` | UsuÃ¡rios do backoffice |
| `tenant_modules` | MÃ³dulos habilitados por tenant |

---

## ComunicaÃ§Ã£o com outros mÃ³dulos

- `domain/auth` usa `tenant_users` para resolver tenant no login â€” acoplamento de leitura apenas
- Outros mÃ³dulos de domÃ­nio (`finance`, etc.) referenciam `tenant_id` por UUID sem FK cruzada
- Sem imports de outros packages de domÃ­nio dentro de `core`
