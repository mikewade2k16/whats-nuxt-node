# AGENTS.md - moduleapi/contracts

## Identidade do módulo

- papel: fronteira Go exportada entre o shell e o backend do módulo `fila-atendimento`
- status: ativa e já usada pelo runtime hospedado convergido ao core

## Responsabilidades

- exportar tipos estáveis de contexto do shell para o módulo
- exportar interfaces de adapters consumidos pelo backend do módulo
- evitar que slices do módulo dependam de tipos concretos de auth, tenant e loja do host atual

## Contratos que exporta

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `AccessContext`
- `AccessContextResolver`
- `StoreScopeProvider`
- `StoreCatalogProvider`
- `RealtimeContextResolver`
- `Clock`

## Regra atual

- provisionamento de identidade não pertence mais a esta fronteira
- novos cortes do backend devem continuar fora de `auth.Principal`, `stores.Service` e quaisquer services concretos do host

## Checks mínimos de mudança

- `go test ./...`
- validar imports dos slices do módulo apontando para `moduleapi/contracts`
