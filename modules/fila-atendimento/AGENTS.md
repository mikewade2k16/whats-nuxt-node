# AGENTS.md - modules/fila-atendimento

## Identidade do módulo

- papel: módulo plugável de fila, operação, relatórios e analytics operacionais
- status: integração ativa no runtime principal
- entrada atual no host: `/admin/fila-atendimento`

## Responsabilidades

- fila de atendimento
- operação da loja/unidade
- relatórios operacionais
- analytics da operação
- configurações operacionais por loja
- roster operacional de consultores
- sinais realtime de atualização operacional

## Contratos que consome

- obrigatórios:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
  - `StoreScopeProvider`
  - `PersistenceProvider`
  - `ModuleRegistry`
  - `Clock`
- opcionais:
  - `RealtimeContextResolver`
  - `DomainEventBus`
  - `AuditSink`
  - `UsersDirectory`
  - `CustomersFeed`

## Sessão integrada atual

- o shell gera um bridge efêmero para o módulo
- o painel inicia a sessão do módulo por `POST /api/admin/modules/fila-atendimento/session`
- o backend do módulo troca o bridge em `POST /v1/auth/shell/exchange`
- o módulo mantém sua própria sessão depois da troca
- cadastro, nível, senha, loja vinculada e liberação de acesso ficam centralizados na página global de usuários do shell
- o bridge do shell é o único caminho de entrada do runtime hospedado
- papel e escopo devem respeitar `level`, `businessRole` e loja vinculada do core

## Persistência sob responsabilidade do módulo

- ownership oficial do domínio:
  - `consultants`
  - `store_profiles`
  - `store_operation_settings`
  - `store_setting_options`
  - `store_catalog_products`
  - `store_campaigns`
  - `operation_queue_entries`
  - `operation_active_services`
  - `operation_paused_consultants`
  - `operation_current_status`
  - `operation_status_sessions`
  - `operation_service_history`

- entidades globais consumidas do shell:
  - `platform_core.users`
  - `platform_core.tenants`
  - `platform_core.tenant_users`
  - `platform_core.tenant_stores`

- estruturas removidas do schema local:
  - `users`
  - `tenants`
  - `stores`
  - `user_platform_roles`
  - `user_tenant_roles`
  - `user_store_roles`
  - `user_external_identities`
  - `user_invitations`

Regra:

- auth global, tenants globais, lojas globais e cadastro principal de usuários não pertencem a este módulo

## Runtime atual

- backend hospedado em `apps/plataforma-api` no prefixo `/core/modules/fila-atendimento`
- implementação concreta do backend hospedado em `modules/fila-atendimento/backend`
- frontend hospedado em `apps/painel-web` na rota `/admin/fila-atendimento`
- persistência no mesmo PostgreSQL do shell, com schema próprio `fila_atendimento`

## O que o módulo não pode conhecer

- auth paralela própria como dependência permanente
- CRUD principal de tenants
- CRUD principal de usuários do painel
- layout ou store global do shell como dependência rígida
- regra interna de `finance`
- regra interna de `atendimento-online`
- acesso direto a tabelas privadas do `plataforma-api`

## Checks mínimos de mudança

- `go test ./...` em `modules/fila-atendimento/backend`
- `npm --prefix apps/painel-web run build`
- `docker compose -f docker-compose.yml config`
