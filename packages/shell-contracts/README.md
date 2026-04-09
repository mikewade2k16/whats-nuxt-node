# Shell Contracts

Snapshot: `2026-04-04`

Este diretório concentra os contratos canônicos entre shell e módulos.

## Objetivo

Permitir que módulos sejam consumidos por contrato serializável, sem depender de:

- linguagem
- framework
- ORM
- transporte específico

## Regras

- contratos devem ser serializáveis em JSON
- contratos devem servir para chamada in-process, HTTP ou mensageria
- módulos não podem depender de implementação interna de outro módulo
- dependências obrigatórias e opcionais devem ser explícitas

## Artefatos

- `examples/module-request-envelope.example.json`
- `examples/module-response-envelope.example.json`
- `examples/fila-atendimento-context.example.json`

## Leitura complementar

- `../../docs/protocolo-orquestracao-modulos.md`
- `../../ARQUITETURA-MODULAR-ALVO.md`
