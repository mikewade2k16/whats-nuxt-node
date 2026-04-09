# AGENTS.md - moduleapi/contracts

## Identidade do módulo

- papel: fronteira Go exportada entre o shell e o backend do módulo `fila-atendimento`
- status: ativo e em expansão incremental por fatias do backend

## Responsabilidades

- exportar tipos estáveis de contexto do shell para o módulo
- exportar interfaces de adapters consumidos pelo backend do módulo
- evitar que slices do módulo dependam de tipos concretos de auth, tenant e loja do host atual
- servir como ponto de transição enquanto a incubadora ainda hospeda o código principal

## Contratos que consome

- obrigatórias:
  - nenhuma dependência de módulo de domínio; apenas biblioteca padrão
- opcionais:
  - nenhuma

## Contratos que exporta

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `AccessContext`
- `AccessContextResolver`
- `StoreScopeProvider`
- `StoreCatalogProvider`
- `IdentityProvisioner`
- `RealtimeContextResolver`
- `Clock`

## Protocolo de integração

- entrada:
  - tipos e interfaces consumidos in-process pelo módulo hospedado
- saída:
  - contratos Go estáveis para adapters do shell

## Persistência sob responsabilidade do módulo

- nenhuma

## Endpoints, filas e interfaces expostas

- pacote Go `moduleapi/contracts`
- interfaces de adapter usadas pelo backend do módulo

## Eventos e sinais de integração

- publicados:
  - nenhum evento próprio
- consumidos:
  - nenhum evento próprio

## Estado atual da fase

- feito em `2026-04-06`:
  - criada a primeira fronteira Go exportada do módulo
  - `operations` passou a consumir `AccessContext`, `StoreScopeProvider` e `AccessContextResolver` a partir daqui
  - `reports` e `analytics` passaram a poder consumir `StoreCatalogProvider` para validar e listar lojas acessíveis sem depender do módulo concreto de lojas do host
  - `settings` passou a consumir `AccessContext` na regra de negócio e na borda HTTP, removendo mais uma dependência estrutural de `auth.Principal`
  - `realtime` passou a consumir `RealtimeContextResolver` no handshake websocket, preservando compatibilidade do runtime atual via adapter local
  - `consultants` passou a consumir `AccessContext`, `StoreCatalogProvider` e `IdentityProvisioner`, removendo o provisionamento de identidade da regra de negócio principal
- próximo corte recomendado:
  - consolidar os smokes hospedados de leitura/escrita das rotas já alinhadas
  - usar este pacote para manter novos cortes fora de `auth.Principal`, `stores.Service` e demais services concretos do host

## O que o módulo não pode conhecer

- `auth.Principal` do host atual como contrato-base
- `stores.Service` ou qualquer service concreto do host
- detalhes de tabela do shell
- regra de negócio operacional do frontend

## Checks mínimos de mudança

- `go test ./...`
- validar imports dos slices do módulo apontando para `moduleapi/contracts` em vez de tipos concretos do host