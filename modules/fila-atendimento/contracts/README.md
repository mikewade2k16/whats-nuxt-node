# Contratos consumidos pelo módulo `fila-atendimento`

Snapshot: `2026-04-13`

## Contratos do shell que o módulo precisa

| Contrato | Quem fornece | Quem consome no módulo | Observação |
|---|---|---|---|
| `ActorContext` | `apps/plataforma-api` | backend operacional, frontend plugável e realtime | substitui principals locais concretos |
| `TenantContext` | `apps/plataforma-api` + host web | backend e UI do módulo | isola dados por tenant |
| `AccessPolicy` | shell | guards e capacidades do módulo | deve falhar fechado |
| `StoreScopeProvider` | shell | operação, relatórios, analytics e settings | loja é contexto consumido, não ownership do módulo |
| `StoreCatalogProvider` | shell | consultants, reports, analytics e settings | lista e valida lojas acessíveis sem acoplamento ao host |
| `RealtimeContextResolver` | shell | handshake e autorização de canais realtime | evita auth paralela no socket |
| `PersistenceProvider` | host/backend do módulo | todo backend do domínio | ownership do módulo, sem invadir tabelas do shell |
| `DomainEventBus` | shell/host | invalidação e integração futura | contrato ainda será tipado |
| `AuditSink` | shell | ações operacionais críticas | trilha comum de auditoria |
| `ModuleRegistry` | `apps/painel-web` e `apps/plataforma-api` | menus, rotas e ativação do módulo | o host monta o módulo por capacidades |
| `Clock` | shell ou provider comum | fila, operação e analytics | timezone explícita |

## Dependências obrigatórias

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `StoreScopeProvider`
- `StoreCatalogProvider`
- `Clock`

## Integrações opcionais

- `UsersDirectory`
- `CustomersFeed`
- `RealtimeContextResolver`
- `AuditSink`
- `DomainEventBus`

Regra:

- o módulo não provisiona identidade, senha nem convite
- o módulo não depende de schema interno de usuários, clientes ou lojas do shell
- quando integrações opcionais existirem, o shell as injeta por contrato
