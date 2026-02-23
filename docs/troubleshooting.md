# Troubleshooting

## Diagnostico rapido

1. Conferir se containers estao no ar:
   `docker compose ps`
2. Ver logs da API:
   `docker compose logs -f api`
3. Ver logs do worker:
   `docker compose logs -f worker`
4. Ver logs da Evolution:
   `docker compose --profile channels logs -f evolution`
5. Healthcheck API:
   `http://localhost:4000/health`

## Checklist obrigatorio de compatibilidade (antes de debugar)

1. Conferir versao do Nuxt UI:
   - `apps/web/package.json`
   - Para componentes `Dashboard*`, usar `@nuxt/ui` v4+.
2. Sempre que aparecer erro de componente ausente/invalido:
   - validar versoes de dependencias primeiro
   - depois validar imports explicitos do componente no arquivo de pagina/modulo
3. Se houve upgrade de dependencia:
   - rebuild do front (`docker compose exec web npm run build`)
   - restart do container (`docker compose restart web`)

## Problemas comuns e correcao

## 1) Login falha com "Credenciais invalidas"

Causa comum:

1. Seed nao rodou.
2. Tenant/email/senha incorretos.

Correcao:

1. Reaplicar schema e seed:
   - `docker compose exec api npm run prisma:push`
   - `docker compose exec api npm run prisma:seed`
2. Testar com:
   - tenant `demo`
   - email `admin@demo.local`
   - senha `123456`

## 2) Mensagem fica em `PENDING`

Causa comum:

1. Worker parado.
2. Evolution nao acessivel.
3. Instancia do tenant nao conectada.

Correcao:

1. Validar worker:
   `docker compose ps worker`
2. Logs do worker:
   `docker compose logs -f worker`
3. Consultar status em `/admin` no bloco WhatsApp.
4. Confirmar env:
   - `EVOLUTION_BASE_URL`
   - `EVOLUTION_API_KEY`
   - `EVOLUTION_SEND_PATH`

## 3) Webhook inbound nao chega na plataforma

Causa comum:

1. Webhook da instancia nao configurado.
2. URL de webhook errada para o ambiente.
3. Token de webhook divergente.

Correcao:

1. Em `/admin`, rodar `Bootstrap` novamente.
2. Verificar `WEBHOOK_RECEIVER_BASE_URL`.
3. Se usar token real, garantir mesmo valor de `EVOLUTION_WEBHOOK_TOKEN` na API e no header `x-webhook-token` enviado pela Evolution.
4. Em ambiente local, o valor placeholder `change-this-webhook-token` nao e validado (facilita teste rapido).
5. A API aceita ambos formatos de webhook:
   - `/webhooks/evolution/:tenantSlug`
   - `/webhooks/evolution/:tenantSlug/:eventName` (ex.: `connection-update`)
4. Conferir logs da API:
   `docker compose logs -f api`

## 3.1) QR nao aparece no painel

Causa comum:

1. Instancia ainda nao recebeu evento de QR.
2. Endpoint de QR nao foi chamado com `force=true`.
3. Estado ainda em transicao.

Correcao:

1. Em `/admin`, clicar `Conectar por QR`.
2. Em seguida clicar `Atualizar QR`.
3. Verificar `GET /tenant/whatsapp/qrcode?force=true`.
4. Validar logs da Evolution para evento de QR:
   `docker compose --profile channels logs -f evolution`
5. Se os logs mostrarem loop `state: close` com `statusReason: 405`, atualize a Evolution para imagem mais nova e configure:
   - `EVOLUTION_IMAGE=evoapicloud/evolution-api:v2.3.7`
   - `EVOLUTION_CONFIG_SESSION_PHONE_VERSION=2,3000,1025205472`
6. Depois de atualizar imagem, recrie a instancia (`logout/delete`) e rode `Bootstrap` novamente.

## 4) Erro de permissao `403`

Causa:

Rotas administrativas exigem role `ADMIN`.

Correcao:

1. Login com usuario ADMIN.
2. Ou promover usuario em `PATCH /users/:userId`.

## 4.1) `POST /tenant/whatsapp/bootstrap` retorna 403

Causa comum:

1. Usuario sem role `ADMIN`.
2. Instancia ja existe na Evolution com mesmo nome.

Correcao:

1. Fazer login com `admin@demo.local`.
2. Reexecutar `Bootstrap` (o backend agora trata "name already in use" como fluxo valido e segue com webhook/connect).

## 5) Tenant enxerga dados de outro tenant (risco de isolamento)

Causa:

Query sem filtro por `tenantId`.

Correcao:

1. Revisar endpoint no arquivo de rota correspondente.
2. Garantir filtro por `tenantId` em toda leitura/escrita.
3. Validar token JWT e escopo da consulta.

## 6) Erro no console: `refresh.js` com `ws://localhost:8081`

Causa:

Script de extensao do navegador (ou live-reload externo), nao da aplicacao Nuxt.

Correcao:

1. Testar em aba anonima sem extensoes.
2. Desativar extensoes de auto-refresh/live-server no navegador.
3. Confirmar que a pagina `http://localhost:3000` nao referencia `refresh.js`.

## 7) Conversa sem avatar em contato direto

Causa comum:

1. Webhook de mensagem nao trouxe `senderAvatarUrl`.
2. Integracao nao estava tentando fallback de foto de perfil.

Correcao:

1. Confirmar que a API esta com suporte ao fallback Evolution:
   - endpoint interno usado: `POST /chat/fetchProfilePictureUrl/:instance`
   - arquivo: `apps/api/src/routes/webhooks.ts`
2. Validar instancia conectada no admin (`/admin`) antes de testar novo inbound.
3. Reiniciar API apos update:
   `docker compose restart api`

## 8) Chat abre sem ultima mensagem / historico truncado

Causa comum:

1. Front consumindo pagina sem cursor de historico.
2. Endpoint de mensagens sem uso de `beforeId`.

Correcao:

1. Validar uso de paginacao no front:
   - arquivo: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
2. Validar contrato da API:
   - `GET /conversations/:conversationId/messages?limit=...&beforeId=...`
   - retorno com `hasMore`

## Testes manuais uteis

## Testar webhook inbound

PowerShell:

```powershell
$body = @{
  data = @{
    key = @{ remoteJid = "5511988887777@s.whatsapp.net" }
    pushName = "Cliente Teste"
    message = @{ conversation = "Teste inbound" }
  }
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:4000/webhooks/evolution/demo" `
  -Headers @{ "x-webhook-token" = "change-this-webhook-token" } `
  -ContentType "application/json" `
  -Body $body
```

## Validar status da conexao do canal

1. Entrar em `/admin`.
2. Clicar `Status`.
3. Ver `connectionState` no JSON de retorno.

## Ponto de depuracao por arquivo

1. Erro de auth/JWT: `apps/api/src/plugins/auth.ts`
2. Erro em tenant/admin: `apps/api/src/routes/tenant.ts`
3. Erro em usuarios: `apps/api/src/routes/users.ts`
4. Erro de envio outbound: `apps/api/src/workers/outbound-worker.ts`
5. Erro webhook inbound: `apps/api/src/routes/webhooks.ts`
6. Erro realtime: `apps/api/src/event-bus.ts` e `apps/api/src/main.ts`
7. Erro de UI inbox: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
8. Erro de UI admin: `apps/web/components/omnichannel/OmnichannelAdminModule.vue`
