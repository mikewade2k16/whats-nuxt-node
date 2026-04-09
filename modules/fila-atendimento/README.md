# Módulo `fila-atendimento`

Snapshot: `2026-04-04`

Este diretório é o scaffold oficial do módulo plugável `fila-atendimento`.

## Papel

O módulo representa o domínio de:

- fila operacional
- operação assistida
- relatórios operacionais
- analytics da operação
- configurações operacionais por loja

Ele é separado do módulo `atendimento-online`.

## Situação atual

O módulo ainda não foi absorvido pelo shell.
Hoje sua fonte principal está em:

- `incubadora/fila-atendimento`

Este diretório existe para:

- concentrar a fronteira oficial do módulo
- registrar contratos consumidos e exportados
- definir ownership de backend, frontend, migrations e QA
- guiar a incorporação ao painel principal sem renomear o domínio

## Relação com os outros módulos

- `fila-atendimento` não é o módulo `atendimento-online`
- `atendimento-online` continua sendo o domínio digital atual de WhatsApp e futura entrada de Instagram
- `fila-atendimento` é um segundo módulo de operação e fila, com identidade própria

## Fonte atual do módulo

- backend candidato: `incubadora/fila-atendimento/back`
- frontend candidato: `incubadora/fila-atendimento/web`
- QA candidato: `incubadora/fila-atendimento/qa-bot`

## Estrutura deste diretório

```text
modules/fila-atendimento/
  AGENTS.md
  README.md
  module.manifest.json
  PLANO-DE-INCORPORACAO.md
  backend/
  frontend/
  contracts/
  migrations/
  tests/
  qa/
```

## Regra desta fase

Ainda não mover código em massa para cá.

Primeiro:

- congelar a fronteira do módulo
- declarar contratos
- definir ownership
- preparar a absorção por fatias

Depois:

- começar a mover backend, frontend, migrations e QA para o módulo
