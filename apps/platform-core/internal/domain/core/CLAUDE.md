# Módulo Core — platform-core

Módulo **compartilhado** da plataforma: tenants, admin clients, admin users, memberships, RBAC e limites de tenant.

**Regra principal:** `domain/core` não é depósito de funcionalidades novas. Feature com tabelas, endpoints e lógica própria vai para `internal/domain/<modulo>/`.

---

## Arquivos Esperados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | Service struct + métodos públicos de tenants/users/RBAC |
| `types.go` | Tipos separados por contexto (tenant, user, membership) |
| `errors.go` | Erros tipados do módulo |

**Handler HTTP:** `../../httpapi/handlers/core_admin_*.go`

---

## Escopo do Módulo

O que **pertence** ao core:

- Tenants: criação, atualização, listagem administrativa
- Admin clients e admin users (backoffice)
- Memberships: vínculo usuário↔tenant com roles
- RBAC: permissões e níveis de acesso (viewer, operator, admin, owner)
- Limites de tenant: usuários máximos, módulos habilitados

O que **não pertence** ao core (extrair para módulo próprio):

- Qualquer feature com tabelas próprias
- DTOs independentes do restante
- Handlers dedicados começando a surgir

---

## Regras de Domínio

- Arquivos pequenos por subdomínio — evitar arquivos grandes misturando contextos
- Tipos separados por contexto (`TenantListItem` ≠ `TenantDetail`)
- Helpers locais sem vazar regra de outro módulo
- Sem payloads pesados em listagens administrativas
- Novos módulos de negócio nunca entram aqui por inércia

---

## Quando Extrair de Core

- O arquivo cresce ao ponto de misturar contextos de negócio distintos
- Os DTOs de uma feature ficam independentes do restante do core
- Surgem handlers dedicados para a feature
- A feature tem migrations próprias separadas

---

## Schema PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `tenants` | Tenants da plataforma |
| `tenant_users` | Vínculo usuário↔tenant (role, status) |
| `admin_clients` | Clientes do backoffice admin |
| `admin_users` | Usuários do backoffice |
| `tenant_modules` | Módulos habilitados por tenant |

---

## Comunicação com outros módulos

- `domain/auth` usa `tenant_users` para resolver tenant no login — acoplamento de leitura apenas
- Outros módulos de domínio (`finance`, etc.) referenciam `tenant_id` por UUID sem FK cruzada
- Sem imports de outros packages de domínio dentro de `core`
