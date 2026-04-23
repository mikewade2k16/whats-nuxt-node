# AGENT

## Escopo

Estas instruções valem para `back/internal/modules/auth`.

## Responsabilidade do módulo hoje

O `auth` hospedado do `fila-atendimento` não é mais dono de login local nem de cadastro de usuário.

Ele deve cuidar de:

- troca do bridge do shell por sessão própria do módulo
- emissão e leitura de token do módulo
- principal autenticado
- catálogo de roles consumido pela UI hospedada
- middleware de auth/role
- leitura de identidade atual por `GET /v1/auth/me`

Ele não deve cuidar de:

- login local
- convite e primeira senha
- troca de senha
- edição de perfil
- avatar
- CRUD administrativo de usuário
- regra operacional da fila

## Persistência

- usuários, tenants, memberships e lojas canônicas vivem em `platform_core`
- o schema local `fila_atendimento` não possui mais `users`, `tenants`, `stores`, `user_*_roles`, `user_external_identities` nem `user_invitations`
- o runtime hospedado usa `CoreUserStore` e `CoreShellBridgeProvisioner`

## Endpoints atuais

- `GET /v1/auth/roles`
- `POST /v1/auth/shell/exchange`
- `GET /v1/auth/me`

## Invariantes

- email deve ser tratado normalizado em lowercase
- usuário inativo não pode autenticar no bridge
- role fora do catálogo é erro de modelagem
- `platform_admin` pode atravessar limites de tenant; os demais não
- `consultant`, `manager` e `store_terminal` devem carregar apenas a loja permitida pelo contexto do core
- `owner` e `marketing` recebem o conjunto de lojas ativas do tenant via `platform_core.tenant_stores`

## Cuidados ao integrar com o Nuxt

- o front hospedado deve usar `POST /v1/auth/shell/exchange` e `GET /v1/me/context`
- `GET /v1/auth/me` serve apenas para leitura simples da identidade atual
- workspaces visíveis no front devem derivar do principal autenticado e do contexto do core

## Arquivos atuais

- `model.go`
- `roles.go`
- `service.go`
- `tokens.go`
- `middleware.go`
- `http.go`
- `core_user_store.go`
- `core_shell_bridge_provisioner.go`
- `shell_bridge_scope.go`
- `store_memory.go`
- `passwords.go`
- `errors.go`
