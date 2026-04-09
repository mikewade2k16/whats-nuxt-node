# Contratos consumidos pelo módulo `fila-atendimento`

Snapshot: `2026-04-04`

## Contratos do shell que o módulo precisa

| Contrato | Quem fornece | Quem consome no módulo | Observação |
|---|---|---|---|
| `ActorContext` | `apps/plataforma-api` | backend operacional, frontend plugável e realtime | substitui principals locais concretos |
| `TenantContext` | `apps/plataforma-api` + host web | backend e UI do módulo | isola dados por tenant |
| `AccessPolicy` | shell | guards e capacidades do módulo | deve falhar fechado |
| `StoreScopeProvider` | shell | operação, relatórios, analytics e settings | loja é contexto consumido, não ownership do módulo |
| `IdentityProvisioner` | shell | vínculo de consultores com contas reais | provisioning não pertence ao módulo |
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
- `Clock`

## Integrações opcionais

- `UsersDirectory`
- `CustomersFeed`
- `IdentityProvisioner`

Regra:

- o módulo deve continuar operando sem `UsersDirectory` detalhado
- o módulo deve continuar operando sem `CustomersFeed`
- quando integrações opcionais existirem, o shell as injeta por contrato

## Envelope de integração recomendado

Entrada:

- seguir `packages/shell-contracts/examples/module-request-envelope.example.json`

Saída:

- seguir `packages/shell-contracts/examples/module-response-envelope.example.json`

## Referências opacas preferidas

- `storeRef`
- `consultantRef`
- `customerRef`
- `actorId`

O módulo não deve depender de schema interno de usuários, clientes ou lojas do shell.

## Implementação inicial desta fronteira

Nesta fase, o primeiro pacote Go exportado desta fronteira foi aberto em:

- `incubadora/fila-atendimento/back/moduleapi/contracts`

Objetivo desta etapa:

- permitir que o shell e o módulo compartilhem `ActorContext`, `TenantContext`, `AccessPolicy` e adapters como `StoreScopeProvider` sem depender de `auth.Principal` como contrato-base;
- manter compatibilidade com o runtime hospedado atual enquanto a absorção para o shell ainda acontece por fatias.

Regra de transição:

- `auth.Principal` continua existindo apenas como adapter legado local;
- novos cortes de backend devem preferir os tipos exportados em `moduleapi/contracts`.
