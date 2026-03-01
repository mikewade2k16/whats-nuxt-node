# CI no GitHub Actions

Objetivo: garantir gate minimo de qualidade em PR/push sem depender de execucao manual.

## Workflow implementado

Arquivo:

1. `.github/workflows/ci.yml`

Triggers:

1. `push` em `main`
2. `pull_request`
3. `workflow_dispatch`

Jobs:

1. `api-build`
2. `web-quality`
3. `tenant-isolation-audit`
4. `media-integration-audit`

Gates atuais:

1. `apps/api`: `npm ci`, `npm run prisma:generate`, `npm run build`
2. `apps/web`: `npm ci`, `npm run test:composables`, `npm run build`
3. seguranca multi-tenant: sobe API com Postgres/Redis efemeros e executa `npm run test:tenant:isolation`
4. integracao de midia: sobe API + worker com Postgres/Redis efemeros e executa `npm run test:media:integration`
5. gate MVP: no job `media-integration-audit`, executa `npm run test:gate:mvp` para validar texto/midia inbound+outbound + dedupe
6. jornada principal: no job `media-integration-audit`, executa `npm run test:journey:e2e` (login + inbox + outbound + inbound)

## Comandos locais equivalentes

1. API:
   - `cd apps/api`
   - `npm ci`
   - `npm run prisma:generate`
   - `npm run build`
2. Web:
   - `cd apps/web`
   - `npm ci`
   - `npm run test:composables`
   - `npm run build`

## Automacao de bateria de midia

Script:

1. `apps/api/src/scripts/media-battery.ts`

Comando:

1. `cd apps/api`
2. `npm run test:media:battery`

Modo seguro (default):

1. Sem `BATTERY_DESTINATION_EXTERNAL_ID`, o script usa destino invalido controlado.
2. Resultado esperado: `FAILED` rapido para todos os tipos, sem `PENDING` infinito.
3. Esse modo valida pipeline/fila/worker sem disparar mensagem real.

Modo homologacao real:

1. Defina `BATTERY_DESTINATION_EXTERNAL_ID` com numero/JID de teste.
2. Resultado esperado: `SENT` para tipos suportados.

Exemplo PowerShell:

```powershell
$env:BATTERY_DESTINATION_EXTERNAL_ID='5511999999999@s.whatsapp.net'
cd apps/api
npm run test:media:battery
```

## Integracao de midia (com auditoria)

Script:

1. `apps/api/src/scripts/media-integration.ts`

Comando:

1. `cd apps/api`
2. `npm run test:media:integration`

O que valida:

1. Envio API para `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`.
2. Transicao de status para estado terminal (`SENT` ou `FAILED`) sem `PENDING` infinito.
3. Registro de evento de auditoria final por mensagem (`MESSAGE_OUTBOUND_SENT` ou `MESSAGE_OUTBOUND_FAILED`).

Modo padrao:

1. Usa destino invalido controlado quando `MEDIA_IT_DESTINATION_EXTERNAL_ID` nao e definido.
2. Resultado esperado nesse modo: `FAILED` rapido, com auditoria presente.

## Gate MVP (texto + midia + dedupe)

Script:

1. `apps/api/src/scripts/mvp-gate-audit.ts`

Comando:

1. `cd apps/api`
2. `npm run test:gate:mvp`

O que valida:

1. Outbound de texto em status terminal (`SENT`/`FAILED`) sem `PENDING` infinito.
2. Outbound de midia essencial (`IMAGE`, `AUDIO`, `DOCUMENT`) com status terminal e auditoria final.
3. Inbound via webhook (texto e imagem) persistindo corretamente na conversa.
4. Dedupe de eco outbound para evitar duplicidade da mesma mensagem.

## Jornada E2E (login + inbox + envio + recebimento)

Script:

1. `apps/api/src/scripts/journey-e2e.ts`

Comando:

1. `cd apps/api`
2. `npm run test:journey:e2e`

O que valida:

1. Login no tenant alvo (`demo` por padrao).
2. Inbox com conversa criada/listada.
3. Envio outbound de texto com status terminal.
4. Recebimento inbound via webhook.
5. Correlation id persistido na mensagem e presente na auditoria outbound.

## Auditoria de isolamento por tenant

Script:

1. `apps/api/src/scripts/tenant-isolation-audit.ts`

Comando:

1. `cd apps/api`
2. `npm run test:tenant:isolation`

Cobertura atual:

1. Login por tenant (`demo` e `acme`).
2. Escopo de listagem de usuarios por tenant.
3. Escopo de listagem de conversas por tenant.
4. Bloqueio de leitura cruzada de mensagens (`404`).
5. Bloqueio de envio/atualizacao cruzada de conversa (`404`).
6. Bloqueio de update cruzado de usuario (`404`).
7. Falha esperada sem token em rota protegida (`401`).

Nota:

1. Este audit roda contra API local (`http://localhost:4000`) e exige seed com tenants `demo` e `acme`.
