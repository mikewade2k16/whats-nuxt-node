# API Reference (MVP + Step 2)

Base URL (default): `http://localhost:4100`

All protected endpoints use:

- Header: `Authorization: Bearer <token>`

## Auth

### POST /core/auth/login

Request:

```json
{
  "email": "admin@demo-core.local",
  "password": "123456",
  "tenantId": "optional-tenant-uuid"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "expiresAt": "2026-03-05T01:00:00Z",
  "user": {
    "id": "uuid",
    "name": "Demo Owner",
    "email": "admin@demo-core.local",
    "isPlatformAdmin": false,
    "tenantId": "uuid"
  }
}
```

### GET /core/auth/me

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Demo Owner",
    "email": "admin@demo-core.local",
    "isPlatformAdmin": false,
    "tenantId": "uuid"
  }
}
```

### POST /core/auth/logout

Response:

```json
{
  "ok": true
}
```

## Tenants

### GET /core/tenants

Lists tenants visible to current user.

### POST /core/tenants

Platform admin only.

Request:

```json
{
  "slug": "new-tenant",
  "name": "New Tenant",
  "contactEmail": "owner@new-tenant.local",
  "timezone": "America/Sao_Paulo",
  "locale": "pt-BR",
  "status": "trialing"
}
```

### GET /core/tenants/{tenantId}

Permission: `tenants.read`

### PATCH /core/tenants/{tenantId}

Permission: `tenants.update`

Request (partial):

```json
{
  "name": "Tenant Renamed",
  "status": "active",
  "contactEmail": "ops@tenant.local"
}
```

## Tenant Users

### GET /core/tenants/{tenantId}/users

Permission: `tenant.users.read`

### POST /core/tenants/{tenantId}/users/invite

Permission: `tenant.users.invite`

Request:

```json
{
  "email": "agent2@demo-core.local",
  "name": "Agent 2",
  "password": "123456",
  "isOwner": false,
  "roleCodes": ["module_agent"]
}
```

### GET /core/tenants/{tenantId}/users/{tenantUserId}/roles

Permission: `roles.read`

### POST /core/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}/assign

Permission: `roles.update`

Response:

```json
{
  "tenantUserRoleId": "uuid",
  "alreadyAssigned": false
}
```

### DELETE /core/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}

Permission: `roles.update`

Response:

```json
{
  "revoked": true
}
```

## Tenant Modules

### GET /core/tenants/{tenantId}/modules

Permission: `tenant.modules.read`

### POST /core/tenants/{tenantId}/modules/{moduleCode}/activate

Permission: `tenant.modules.update`

### POST /core/tenants/{tenantId}/modules/{moduleCode}/deactivate

Permission: `tenant.modules.update`

## Roles and Permissions

### GET /core/permissions

Permission:

- `roles.read` (tenant context required for non-platform-admin users)
- platform admin can read directly

Optional query:

- `tenantId`

### GET /core/tenants/{tenantId}/roles

Permission: `roles.read`

Returns tenant roles + global template roles visible to that tenant.

### POST /core/tenants/{tenantId}/roles

Permission: `roles.update`

Request:

```json
{
  "moduleCode": "core_panel",
  "code": "support_supervisor",
  "name": "Support Supervisor",
  "description": "Supervisor role",
  "permissionCodes": [
    "tenant.users.read",
    "tenant.modules.read",
    "tenant.limits.read"
  ]
}
```

### PATCH /core/tenants/{tenantId}/roles/{roleId}

Permission: `roles.update`

Request (partial):

```json
{
  "name": "Support Supervisor Updated",
  "isActive": true,
  "permissionCodes": ["tenant.users.read", "tenant.modules.read"]
}
```

## Limits

### GET /core/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}

Permission: `tenant.limits.read`

Response:

```json
{
  "tenantId": "uuid",
  "moduleCode": "atendimento",
  "limitKey": "users",
  "resolved": {
    "isUnlimited": false,
    "value": 6,
    "source": "tenant_override"
  }
}
```

### PUT /core/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}

Permission: `tenant.limits.update`

Request:

```json
{
  "valueInt": 6,
  "isUnlimited": false,
  "source": "manual_override",
  "notes": "special contract"
}
```

## Admin Manage (clientes/usuarios do painel)

### GET /core/admin/clients

Query: `page`, `limit`, `q`, `status`.

### POST /core/admin/clients

Request:

```json
{
  "name": "Cliente Demo",
  "status": "active"
}
```

### PATCH /core/admin/clients/{clientId}

Request:

```json
{
  "field": "monthlyPaymentAmount",
  "value": 350
}
```

### PUT /core/admin/clients/{clientId}/stores

Request:

```json
{
  "stores": [
    { "name": "Loja Centro", "amount": 120 },
    { "name": "Loja Norte", "amount": 180 }
  ]
}
```

### POST /core/admin/clients/{clientId}/webhook/rotate

Gera nova chave de webhook para o cliente.

### DELETE /core/admin/clients/{clientId}

Remove cliente via soft-delete.

### GET /core/admin/users

Query: `page`, `limit`, `q`.

### POST /core/admin/users

Cria ou reaproveita o usuario pelo email informado. Quando o email ja existe, o core reaproveita a conta sem falhar por duplicidade. Quando existir `clientId` valido, o core ativa a conta e o vinculo com o tenant alvo. Quando um root criar usuario sem `clientId`, o cadastro fica `inactive`, sem login habilitado, ate receber um cliente depois.

Request:

```json
{
  "name": "Operador",
  "nick": "operador1",
  "email": "operador@demo.local",
  "password": "Senha@123",
  "phone": "55999999999",
  "clientId": 106,
  "level": "marketing",
  "userType": "client"
}
```

### PATCH /core/admin/users/{userId}

Request:

```json
{
  "field": "status",
  "value": "active"
}
```

### POST /core/admin/users/{userId}/approve

Ativa usuario e atualiza ultimo login. Usuarios sem `clientId`/tenant valido nao podem ser aprovados; o fluxo esperado e atribuir um cliente, o que reativa a conta automaticamente.

### DELETE /core/admin/users/{userId}

Remove usuario via soft-delete.

## User Allocation by Module

### POST /core/tenants/{tenantId}/modules/{moduleCode}/users/{tenantUserId}/assign

Permission: `tenant.users.modules.assign`

Response:

```json
{
  "assignmentId": "uuid",
  "alreadyAssigned": false,
  "resolvedLimit": {
    "isUnlimited": false,
    "value": 6,
    "source": "tenant_override"
  },
  "activeUsersInModule": 1
}
```

## Realtime

### GET /core/ws

Authentication:

- `?token=<jwt>` query string
- OR header `Authorization: Bearer <token>`

Client events:

- `presence.join`
- `presence.heartbeat`
- `presence.leave`

Server events:

- `presence.joined`
- `presence.user_joined`
- `presence.heartbeat_ack`
- `presence.user_left`
- `tenant.user.module.assigned`
- `tenant.module.updated`
- `tenant.limit.updated`
- `tenant.role.created`
- `tenant.role.updated`
- `tenant.user.role.assigned`
- `tenant.user.role.revoked`

## Authorization behavior

- Platform admin bypasses permission checks.
- Tenant owner bypasses permission checks for own tenant.
- Other users require explicit permissions via roles.

## Common errors

- `bad_request`
- `unauthorized`
- `forbidden`
- `not_found`
- `module_inactive`
- `tenant_user_inactive`
- `limit_reached`
- `limit_not_configured`
- `invalid_input`
