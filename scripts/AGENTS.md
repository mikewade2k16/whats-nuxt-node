# AGENTS.md - scripts

Scripts operacionais e de auditoria do repositorio.

## Papel

- health checks e monitoramento
- medicao de baseline
- auditorias de acesso e seguranca
- utilitarios de recovery/deploy local

## Regras

- script destrutivo deve exigir flag explicita (`--apply`) ou deixar isso muito claro
- script de auditoria deve documentar prerequisitos de seed, tenants e servicos no ar
- script novo deve escrever saida em `docs/metrics/` quando gerar relatorio compartilhavel
- nao assumir que docs e seeds estao coerentes; validar prerequisitos no proprio script quando possivel

## Atencao especial

- `security-access-audit.mjs` audita o BFF/admin do painel
- `apps/atendimento-online-api/src/scripts/tenant-isolation-audit.ts` prioriza `AUDIT_*` do ambiente e cai para slugs conhecidos (`demo`/`demo-core`, `acme`/`acme-core`); o ambiente ainda precisa ter usuarios ativos com acesso ao modulo nos tenants escolhidos
- scripts de monitoramento em shell/ps1 sao apoio operacional e nao devem virar dependencia de regra de negocio
