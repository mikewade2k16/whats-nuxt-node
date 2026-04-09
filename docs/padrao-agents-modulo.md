# Padrão oficial de `AGENTS.md` por módulo

Snapshot: `2026-04-04`

## Objetivo

Todo módulo do repositório deve ter um `AGENTS.md` próprio quando possuir:

- regras de negócio;
- tabelas ou migrations próprias;
- endpoints, filas ou eventos próprios;
- integração com o shell da plataforma por contratos explícitos.

O objetivo do arquivo não é repetir o código.
Ele existe para deixar claro:

- o que o módulo faz;
- do que ele precisa para funcionar;
- o que ele oferece para o restante do sistema;
- o que ele não pode conhecer.

## Regra de fronteira

O módulo deve declarar dependências por contrato conceitual sempre que possível.

Preferir:

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `PersistenceProvider`
- `AuditSink`
- `DomainEventBus`
- `Clock`
- `ModuleRegistry`

Evitar, salvo quando inevitável:

- “depende diretamente do service X”
- “lê tabela Y de outro módulo”
- “importa helper interno do módulo Z”

Preferir contratos serializáveis e transport-agnostic.

Regra:

- o contrato do módulo deve poder ser representado em JSON
- o transporte pode mudar; o formato lógico do contrato não

## Estrutura obrigatória

Todo `AGENTS.md` de módulo deve ter as seções abaixo, nesta ordem:

### 1. Identidade do módulo

- nome do módulo
- papel dentro da arquitetura
- status atual: ativo, candidato, legado, incubado

### 2. Responsabilidades

Lista objetiva do que é dono do módulo.

Exemplos:

- autenticação
- RBAC
- planilhas financeiras
- operação de atendimento
- relatórios do módulo

### 3. Contratos que consome

Declarar o que o módulo precisa receber do shell ou de outro boundary.

Separar sempre:

- dependências obrigatórias
- integrações opcionais

Formato recomendado:

- `ActorContext`: identidade do ator autenticado
- `TenantContext`: tenant ativo e escopo de isolamento
- `AccessPolicy`: validação de permissão e módulos ativos
- `PersistenceProvider`: acesso às tabelas próprias do módulo

Se um contrato ainda não existir formalmente no código, declarar mesmo assim como contrato alvo.

Integração opcional é o caso em que o módulo continua funcionando sem aquele provider extra.

### 4. Contratos que exporta

Declarar o que o módulo oferece para fora.

Exemplos:

- DTOs públicos
- commands/queries
- handlers
- endpoints
- eventos
- adapters de UI
- envelopes JSON de entrada e saída quando houver integração orquestrada

### 5. Persistência sob responsabilidade do módulo

Declarar:

- schema
- tabelas
- migrations principais
- filas, índices ou storage próprio

Regra:

- listar apenas o que o módulo realmente possui;
- se depender de tabela de outro módulo, isso deve aparecer como dependência e não como posse.

### 6. Endpoints, filas e interfaces expostas

Declarar os pontos de entrada do módulo.

Exemplos:

- rotas HTTP
- consumers BullMQ
- webhooks
- jobs agendados
- páginas wrapper
- componentes plugáveis

Quando aplicável, declarar também:

- operação de contrato orquestrado
- payload de entrada
- payload de saída

### 7. Eventos e sinais de integração

Declarar:

- eventos publicados
- eventos consumidos
- mensagens de fila
- canais realtime

Se ainda não houver evento formal, escrever explicitamente:

- `Nenhum evento de domínio formal no momento`

### 8. O que o módulo não pode conhecer

Listar os acoplamentos proibidos.

Exemplos:

- UI concreta
- tabela interna de outro módulo
- sessão paralela
- decisão de tela
- regra específica de outro domínio

### 9. Checks mínimos de mudança

Declarar os comandos mínimos para validar mudanças naquele módulo.

Exemplos:

- `go test ./...`
- `npm run build`
- `npm run test:tenant:isolation`
- smoke específico

## Template base

```md
# AGENTS.md - <nome-do-módulo>

## Identidade do módulo

- papel:
- status:

## Responsabilidades

- 

## Contratos que consome

- obrigatórias:
  - `<Contrato>`
- opcionais:
  - `<IntegracaoOpcional>`

## Contratos que exporta

- 

## Protocolo de integração

- entrada:
- saída:

## Persistência sob responsabilidade do módulo

- schema:
- tabelas:
- migrations:
- filas/storage:

## Endpoints, filas e interfaces expostas

- 

## Eventos e sinais de integração

- publicados:
- consumidos:

## O que o módulo não pode conhecer

- 

## Checks mínimos de mudança

- 
```

## Exemplo conceitual

### `finance`

Não deve depender de “usuários” concretos.
Deve depender de:

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `PersistenceProvider`
- `Clock`

Pode exportar:

- endpoints administrativos
- DTOs de lista e detalhe
- regras de planilha/configuração

Não pode conhecer:

- tela específica do painel
- store do frontend
- tabela operacional de atendimento

## Regra de adoção

Ao criar módulo novo ou refatorar módulo já existente:

1. criar/atualizar o `AGENTS.md` do módulo;
2. seguir este padrão;
3. declarar contratos consumidos e exportados;
4. declarar dependências obrigatórias e integrações opcionais;
5. registrar explicitamente o que o módulo não pode conhecer.
