# Module SDK

Snapshot: `2026-04-04`

Este diretório representa a futura camada de adapters e helpers para encaixar módulos no shell sem acoplamento direto.

## Papel

- adaptar transportes sem mudar o contrato
- montar registro de módulo
- normalizar envelopes de request/response
- evitar duplicação de bridge entre host e módulo

## Regra

O SDK não é lugar de regra de negócio de domínio.
Ele existe só para facilitar o encaixe técnico dos módulos no shell.
