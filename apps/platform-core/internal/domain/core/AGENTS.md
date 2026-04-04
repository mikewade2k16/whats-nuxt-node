# AGENTS.md - domain/core

Modulo compartilhado do `platform-core`.

## Escopo atual

- tenants
- admin clients
- admin users
- memberships
- RBAC
- limites e modulos de tenant

## Regra principal

`domain/core` nao e deposito de qualquer funcionalidade nova.

Se a feature tiver:

- tabelas proprias
- endpoints proprios
- contratos proprios
- logica de negocio propria

ela deve ir para package proprio em `internal/domain/<modulo>/`.

## Quando manter em core

- comportamento compartilhado de tenant/admin
- regras transversais de permissao
- tipos e services que pertencem claramente ao backoffice central

## Quando extrair de core

- quando o arquivo cresce ao ponto de misturar contextos de negocio
- quando os DTOs de um modulo ficam independentes do resto
- quando handlers dedicados comecam a surgir

## Padrao desejado

- arquivos pequenos por subdominio
- tipos separados por contexto
- helpers locais e sem vazar regra de outro modulo
- sem payloads pesados em listagens administrativas
