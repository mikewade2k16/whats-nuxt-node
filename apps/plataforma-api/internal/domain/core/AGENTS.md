# AGENTS.md - domain/core

## Identidade do módulo

- papel: domínio compartilhado de tenants, administração, RBAC e limites no `plataforma-api`
- status: ativo

## Responsabilidades

- tenants
- clientes administrativos
- usuários administrativos
- memberships e perfis de tenant
- ativação de módulos por tenant
- limites por módulo
- papéis, permissões e vinculações RBAC
- atualização de perfil do usuário autenticado

## Regra de fronteira com auth

- `domain/core` não emite login, não revoga sessão e não define expiração de sessão
- `domain/core` consome a identidade autenticada entregue por `domain/auth`
- tenant, RBAC, módulos e limites são decididos aqui, mas o ciclo de sessão continua sendo exclusivo de `domain/auth`

## Contratos que consome

- `ActorContext`: identidade autenticada vinda do módulo `auth`
- `AccessPolicy`: validação de permissões e escopos administrativos
- `PersistenceProvider`: acesso ao schema `platform_core`
- `AuditSink`: trilha de auditoria administrativa
- `RealtimePresenceSink`: integração com hub realtime quando o handler precisa refletir presença/estado
- `Clock`: timestamps e coerência temporal de operações administrativas

## Contratos que exporta

- queries e commands administrativos de tenant, usuário, módulo e RBAC
- resolução de permissões do usuário autenticado
- resolução de limites de módulo por tenant
- handlers administrativos em `/core/tenants`, `/core/admin/*` e `/core/permissions`

## Regras operacionais de usuarios administrativos

- `POST /core/admin/users` deve continuar idempotente por email.
- usuario criado por root sem `clientId` deve nascer `inactive`, sem `tenant_users` ativo e sem login habilitado.
- atribuir `clientId` depois deve reativar `users.status` e recriar/reativar o `tenant_users` alvo automaticamente.
- `POST /core/admin/users/{userId}/approve` e `PATCH status=active` nao podem ativar usuario sem cliente/tenant valido, salvo `platform admin`.

## Persistência sob responsabilidade do módulo

- schema: `platform_core`
- tabelas principais: `tenants`, `tenant_users`, `modules`, `plans`, `plan_modules`, `plan_module_limits`, `tenant_subscriptions`, `tenant_modules`, `tenant_module_limits`, `tenant_user_modules`, `roles`, `permissions`, `role_permissions`, `tenant_user_roles`, `audit_logs`, `presence_connections`
- tabela compartilhada com `auth`: `users`
- migrations-base: `0001_core_schema.sql`, `0003_rbac_seed.sql`, `0005_admin_manage_and_pricing.sql`, `0007_backfill_client_defaults_and_admin_bootstrap.sql`, `0009_root_admin_tenant_bootstrap.sql`, `0010_atendimento_multi_tenant_defaults.sql`, `0011_add_viewer_access_level.sql`, `0016_seed_acme_core_tenant.sql`, `0017_seed_fila_atendimento_module.sql`

## Endpoints, filas e interfaces expostas

- `PATCH /core/auth/profile`
- `GET /core/permissions`
- `GET|POST|PATCH|DELETE /core/admin/clients`
- `PUT /core/admin/clients/{clientId}/stores`
- `POST /core/admin/clients/{clientId}/webhook/rotate`
- `GET|POST|PATCH|DELETE /core/admin/users`
- `POST /core/admin/users/{userId}/approve`
- `GET|POST|PATCH /core/tenants`
- `GET /core/tenants/{tenantId}/users`
- `POST /core/tenants/{tenantId}/users/invite`
- `GET|POST|DELETE /core/tenants/{tenantId}/users/{tenantUserId}/roles/*`
- `GET|POST /core/tenants/{tenantId}/roles`
- `GET|POST /core/tenants/{tenantId}/modules/*`
- `GET|PUT /core/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}`

## Eventos e sinais de integração

- publicados: nenhum evento de domínio formal no momento
- consumidos: nenhum evento de domínio formal no momento
- sinais indiretos: notificações via hub realtime quando handlers administrativos precisarem refletir contexto ao painel
- mutacoes em `admin clients` que alterem campos ou lojas devem publicar no tenant room um evento curto `entity=clients`, `action=updated`, com `clientId` e `payload.field`, para o shell atualizar contexto sem reload

## O que o módulo não pode conhecer

- tela concreta do painel
- emissão, expiração ou revogação de login/sessão
- regras internas do módulo `finance`
- regras internas do módulo `atendimento`
- regras internas do módulo `fila-atendimento`
- queries diretas no schema operacional `public`
- payload específico de componente Vue

## Checks mínimos de mudança

- `go test ./...`
- validar rotas de tenant, RBAC e módulos tocadas pela mudança
- revisar se a alteração não inflou payload de listagem administrativa

## Regras atuais de clientes e modulos

- a lista administrativa de clientes e `ListTenantModules` devem expor o conjunto efetivo de modulos do tenant, nao apenas overrides ativos isolados
- precedencia obrigatoria: `tenant_modules.status` explicito vence heranca do plano; se o tenant marcou um modulo como `inactive`, esse override deve derrubar a heranca vinda de `plan_modules`
- payload administrativo de cliente deve continuar leve, mas precisa carregar `coreTenantId` e modulos efetivamente ativos para o shell resolver menu, rota, websocket e escopo
- quando `billing_mode = per_store`, o core deve derivar `monthly_payment_amount` pela soma de `tenant_store_charges`; update manual do valor mensal nao pode sobrescrever esse total enquanto o modo por loja estiver ativo
