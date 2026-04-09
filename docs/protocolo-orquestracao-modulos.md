# Protocolo de Orquestração de Módulos

Snapshot: `2026-04-04`

## Objetivo

Definir como os módulos do sistema devem se integrar sem acoplamento direto de implementação, linguagem, banco ou framework.

Regra principal:

- módulo não puxa dado de outro módulo por conta própria;
- módulo declara o que precisa;
- o shell orquestrador resolve o contexto e entrega esse dado por contrato;
- o módulo responde por contrato.

Nota de implementação:

- `JSON` é a fronteira canônica entre shell e módulo;
- não precisamos serializar tudo internamente quando o adapter estiver no mesmo processo;
- o que precisa permanecer estável é o contrato, não a representação interna em memória.

## O que isso resolve

Esse padrão permite que o módulo:

- rode dentro do shell atual;
- seja transportado para outro projeto com menos atrito;
- seja consumido por host em Go, Node, PHP ou outra stack;
- tenha frontend e BFF consumindo contratos estáveis em JSON.

## Padrões da comunidade que isso segue

Isto não é exótico nem gambiarra.
É uma combinação de padrões bem conhecidos:

- arquitetura hexagonal
- ports and adapters
- contract-first design
- plugin architecture
- API composition
- backend-for-frontend
- anti-corruption layer

O diferencial aqui é aplicar isso com disciplina no monorepo inteiro.

## Regra de integração entre módulos

### Proibido

- módulo A importar service interno do módulo B
- módulo A consultar tabela privada do módulo B
- módulo A depender de classe, ORM ou helper interno do módulo B
- módulo A descobrir usuário, tenant ou cliente por conta própria em vários pontos

### Obrigatório

- módulo declarar dependências obrigatórias
- módulo declarar integrações opcionais
- shell resolver contexto e enrichments
- comunicação por contrato serializável

## Papel do shell orquestrador

O shell orquestrador é a camada que:

- autentica
- resolve `ActorContext`
- resolve `TenantContext`
- resolve `AccessPolicy`
- resolve escopos adicionais, como lojas ou limites
- injeta integrações opcionais quando disponíveis
- chama o módulo por contrato
- recebe resposta do módulo
- expõe isso para BFF, UI, jobs ou eventos

Regra:

- o módulo conhece o contrato do shell
- o módulo não conhece a implementação interna do shell

## Contrato canônico de chamada

### Envelope de request

```json
{
  "meta": {
    "contractVersion": "1.0",
    "requestId": "req_01",
    "transport": "http",
    "source": "painel-web-bff",
    "targetModule": "fila-atendimento",
    "operation": "operation.list"
  },
  "context": {
    "actor": {},
    "tenant": {},
    "policy": {},
    "capabilities": [],
    "integrations": {}
  },
  "input": {}
}
```

### Envelope de response

```json
{
  "meta": {
    "contractVersion": "1.0",
    "requestId": "req_01",
    "status": "ok"
  },
  "data": {},
  "errors": [],
  "events": []
}
```

## Transportes permitidos

O contrato deve ser o mesmo, mudando só o adaptador:

- chamada in-process
- HTTP/JSON
- fila/mensagem
- job agendado

Regra:

- o módulo não depende do transporte
- o módulo depende do contrato

## Sessão integrada via shell bridge

Quando um módulo estiver plugado ao painel principal, mas ainda preservar API, frontend e persistência próprios, a sessão integrada pode seguir este fluxo:

1. o painel autentica o usuário no shell principal;
2. o shell emite um token efêmero de bridge para o módulo;
3. o backend do módulo valida esse token e projeta o contexto local necessário;
4. o módulo cria ou sincroniza sua identidade local mínima;
5. o módulo devolve sua própria sessão;
6. o frontend do módulo passa a operar sobre sua API nativa.

Objetivo:

- eliminar login paralelo sem acoplar o módulo ao banco ou ao runtime interno do shell;
- manter a extração futura viável;
- deixar claro que auth integrada não significa service compartilhado ou tabela compartilhada.

## Dependências obrigatórias vs integrações opcionais

### Dependências obrigatórias

São necessárias para o módulo funcionar.

Exemplos:

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- `Clock`

### Integrações opcionais

São recursos extras que enriquecem o módulo, mas não são obrigatórios para a operação mínima.

Exemplos:

- integração com clientes
- integração com usuários detalhados
- integração com catálogo externo
- integração com CRM

Formato recomendado no `AGENTS.md` do módulo:

- obrigatórias:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
- opcionais:
  - `CustomersFeed`
  - `UsersDirectory`
  - `CatalogFeed`

## Regra de referência opaca

Quando um módulo precisar “apontar” para dado externo, preferir referência opaca.

Exemplos:

- `customerRef`
- `actorId`
- `userRef`
- `storeRef`

Evitar:

- copiar estrutura interna inteira do módulo dono
- amarrar a tabela ou DTO ao schema de outro módulo

## Contrato mínimo de contexto

### `ActorContext`

```json
{
  "actorId": "usr_123",
  "actorType": "user",
  "displayName": "Maria",
  "roles": ["tenant_admin"],
  "permissions": ["fila-atendimento.operation.read"],
  "timezone": "America/Sao_Paulo"
}
```

### `TenantContext`

```json
{
  "tenantId": "ten_123",
  "tenantSlug": "acme",
  "tenantStatus": "active",
  "timezone": "America/Sao_Paulo",
  "activeModules": ["atendimento-online", "fila-atendimento"],
  "featureFlags": []
}
```

## Como o frontend entra nisso

O frontend não precisa saber a linguagem do módulo.

O fluxo alvo é:

1. UI chama BFF
2. BFF chama shell orquestrador
3. shell resolve contexto e integrações
4. shell chama módulo por contrato JSON
5. shell devolve resposta estável para o BFF

Consequência:

- frontend desacoplado da linguagem do backend
- BFF desacoplado da implementação do módulo
- módulo substituível por outra stack mantendo o contrato

## Aplicação imediata em `fila-atendimento`

O módulo `fila-atendimento` deve nascer assim:

- obrigatório para operar:
  - `ActorContext`
  - `TenantContext`
  - `AccessPolicy`
  - `StoreScopeProvider`
  - `Clock`
- opcional para enriquecer:
  - `UsersDirectory`
  - `CustomersFeed`
  - `IdentityProvisioner`

Regra:

- se `UsersDirectory` não existir, o módulo continua funcionando com referências mínimas;
- se `CustomersFeed` não existir, o módulo não quebra;
- se integração opcional existir, o shell a injeta por contrato.

## Artefatos canônicos

- `packages/shell-contracts/README.md`
- `packages/shell-contracts/examples/module-request-envelope.example.json`
- `packages/shell-contracts/examples/module-response-envelope.example.json`
- `packages/shell-contracts/examples/fila-atendimento-context.example.json`

## Regra de adoção

Antes de incorporar qualquer módulo novo:

1. declarar dependências obrigatórias;
2. declarar integrações opcionais;
3. declarar envelope de entrada e saída;
4. declarar referências opacas aceitas;
5. registrar o contrato no `AGENTS.md` e no manifesto do módulo.
