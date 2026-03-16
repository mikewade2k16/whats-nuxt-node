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
   - `apps/omni-nuxt-ui/package.json`
   - Para componentes `Dashboard*`, usar `@nuxt/ui` v4+.
2. Sempre que aparecer erro de componente ausente/invalido:
   - validar versoes de dependencias primeiro
   - depois validar imports explicitos do componente no arquivo de pagina/modulo
3. Se houve upgrade de dependencia:
   - rebuild do front (`docker compose exec web npm run build`)
   - restart do container (`docker compose restart web`)
4. Conferir configuracao do BFF:
   - `NUXT_API_INTERNAL_BASE` precisa apontar para a API acessivel pelo container `web` (ex.: `http://api:4000`).
   - `NUXT_PUBLIC_API_BASE` e usado no browser para realtime/socket (ex.: `http://localhost:4000`).

## Fluxo seguro para refactor de tela (evitar perda de codigo)

1. Nunca apagar o arquivo de tela inteiro para refazer.
2. Extrair um bloco por vez para componente novo.
3. Conectar o componente novo no arquivo pai antes de remover o bloco antigo.
4. Validar compatibilidade de versao primeiro quando aparecer erro de runtime de componente.
5. Validar imports explicitos de todos componentes usados no template.
6. Rodar build do front a cada etapa de extracao:
   - `docker compose exec web npm run build`
7. Registrar no documento:
   - arquivo novo
   - props/emits
   - pontos de extensao e rotas impactadas

## Problemas comuns e correcao

## 0) Rotas de login duplicadas / confusas

Regra oficial do projeto:

1. Login principal do painel: `/admin/login`
2. O modulo de atendimento (`/admin/omnichannel/*`) reutiliza a sessao do painel e nao possui login/auth proprio.
3. Paginas do core (`/admin/core/*`) usam a mesma sessao do painel; `/admin/core/login` foi aposentada e redireciona para `/admin/login`.

Compatibilidade legada:

1. `/` redireciona para `/admin/login`
2. `/login` redireciona para `/admin/login`
3. `/auth/*` removido (404 esperado)
4. `/admin/omnichannel/login` removido (404 esperado)

## 0.4) Login abre de novo com query string (`/admin/login?tenantSlug=...&email=...&password=...`)

Causa comum:

1. Submit nativo do browser antes de hidratar o handler Vue (`@submit.prevent`) em ambiente lento.
2. Formulario de login executando `GET` e serializando campos na URL.

Correcao aplicada:

1. Login do painel usa bloqueio de submit nativo (`onsubmit="return false;"`) + submit controlado no Vue.
2. Campos sensiveis em query (`tenantSlug`, `email`, `password`) sao limpos da URL ao montar a pagina.

## 0.5) Como acompanhar os bancos localmente (Postgres + Redis)

Servicos de observabilidade:

1. Adminer (Postgres): `http://localhost:8088`
2. Redis Commander (Redis): `http://localhost:8089`

Subir somente quando precisar (profile `ops`):

1. `docker compose --profile ops up -d adminer redis-commander`

Conexao no Adminer:

1. System: `PostgreSQL`
2. Server: `postgres`
3. Username: valor de `POSTGRES_USER` no `.env`
4. Password: valor de `POSTGRES_PASSWORD` no `.env`
5. Database: valor de `POSTGRES_DB` no `.env`

Observacao:

1. O `platform-core` usa o mesmo Postgres em schema separado (`platform_core` por padrao).

## 0.6) Erro 500 no front apos remover rota legacy (`Cannot find module '/pages/auth/index.vue?macro=true'`)

Causa comum:

1. Cache de rotas do Nuxt em dev (`.nuxt/routes.mjs`) mantendo referencia antiga apos exclusao de arquivo em `app/pages`.

Correcao:

1. Recriar o `web` para forcar recompilacao limpa:
   - `docker compose restart web`
2. Se persistir, limpar cache de build no container e reiniciar:
   - `docker compose exec web sh -lc "rm -rf /app/.nuxt /app/.output"`
   - `docker compose restart web`
3. Validar:
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/login` deve retornar `200`
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login` deve retornar `404`

## 0.7) Users/clients no modulo nao batem com painel core

Causa comum:

1. API do modulo ainda tentando usar dados legados locais sem sincronizar com `platform-core`.
2. Credenciais de integracao com `platform-core` ausentes no `api`.

Correcao:

1. Definir no `.env`:
   - `CORE_API_BASE_URL`
   - `CORE_API_EMAIL`
   - `CORE_API_PASSWORD`
2. Reiniciar a API:
   - `docker compose restart api`
3. Validar listagem:
   - `GET /users` (deve refletir tenant users do core)
   - `GET /clients` (deve refletir tenants visiveis no core)
4. Observacao:
   - `PATCH/DELETE /users/*` e `POST/PATCH/DELETE /clients*` legados retornam `501` por design; gestao completa fica no `/admin/core`.

## 0) Front sem dados apos migracao para BFF

Causa comum:

1. `NUXT_API_INTERNAL_BASE` ausente ou apontando para host errado.
2. Container `web` nao consegue resolver host da API.

Correcao:

1. Ajustar `.env`:
   - `NUXT_API_INTERNAL_BASE=http://api:4000`
2. Rebuild/restart do web:
   - `docker compose up -d --build web`
3. Testar proxy direto:
   - `http://localhost:3000/api/bff/health`

## 0.1) Erro na rota `/docs`: "Diretorio de docs nao encontrado..."

Causa comum:

1. Container `web` nao foi recriado apos alterar `docker-compose.yml`.
2. `PROJECT_DOCS_DIR` nao esta no ambiente do `web`.
3. Volume `./docs:/project-docs:ro` nao foi montado no `web`.

Correcao:

1. Recriar somente o `web`:
   - `docker compose up -d --build --force-recreate web`
2. Validar dentro do container:
   - `docker compose exec web sh -lc 'echo $PROJECT_DOCS_DIR && ls -la /project-docs'`
3. Se precisar, subir stack completa novamente:
   - `docker compose --profile channels up -d --build`

Observacao:

1. A API de docs no Nuxt tenta fallback automatico para `/project-docs` e `/docs` mesmo se a env nao existir.

## 0.2) Container `redis-1` nao sobe apos reboot do host

Causa comum:

1. Redis com AOF (`appendonly yes`) em volume local pode falhar apos desligamento abrupto.
2. Porta `6379` ocupada no host impede bind do container.

Ajuste aplicado no projeto:

1. `docker-compose.yml` agora sobe Redis em modo dev sem AOF (`--appendonly no --save ""`) para reduzir chance de corrupcao e I/O.
2. Redis nao expoe mais porta no host; API/worker acessam Redis apenas pela rede interna Docker (`redis:6379`).
3. Redis usa politica `noeviction` com `REDIS_MAXMEMORY` para evitar perda silenciosa de jobs da fila outbound.

Recuperacao recomendada (se ainda estiver quebrado):

1. `docker compose down`
2. Remover o volume `redis_data` no Docker Desktop (Volumes) para limpar estado legado do AOF.
3. `docker compose up -d redis`
4. `docker compose logs -f redis` (deve mostrar `Ready to accept connections`).

## 0.3) Ambiente local muito pesado (CPU/RAM altos em dev)

Causa comum:

1. `npm install` sendo executado em todo restart de `api/worker/retention-worker`.
2. Bootstrap de banco (`prisma:push` + `prisma:seed`) rodando sempre, mesmo sem mudanca.
3. Nuxt em modo dev + HMR + varias rotas abertas no navegador.

Ajuste aplicado no projeto:

1. `api/worker/retention-worker/web` agora instalam dependencias apenas quando `node_modules` estiver vazio.
2. `api` roda `prisma:push` e `prisma:seed` apenas no primeiro boot do volume `api_node_modules` (ou quando `API_DB_BOOTSTRAP_ALWAYS=true`).
3. `NODE_OPTIONS` por servico foi exposto no `.env` para limitar heap em dev sem perder funcionalidade.

Boas praticas de operacao local:

1. Subir apenas o necessario para a tarefa atual (`docker compose up -d postgres redis api web`).
2. Ativar `evolution` so quando for validar canal real (`--profile channels`).
3. Evitar rodar varias abas pesadas da inbox simultaneamente durante debug de frontend.

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
4. Falha de enfileiramento (Redis/fila indisponivel no momento do envio).

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
   - `EVOLUTION_SEND_MEDIA_PATH`
   - `EVOLUTION_SEND_AUDIO_PATH`
   - `EVOLUTION_SEND_STICKER_PATH`
   - `EVOLUTION_SEND_REACTION_PATH`
5. A partir do ajuste de confiabilidade do Sprint 4, se o enfileiramento falhar a API marca a mensagem como `FAILED` imediatamente (nao fica `PENDING` infinito). Use reprocessamento apos restaurar fila/worker.

## 2.2) Reprocessar mensagem outbound travada

Quando usar:

1. Mensagem outbound ficou em `FAILED`.
2. Mensagem outbound ficou em `PENDING` apos erro transitorio.

Rotas:

1. Reprocessar uma mensagem:
   - `POST /conversations/:conversationId/messages/:messageId/reprocess`
   - body: `{ "force": true }` para reenviar inclusive mensagem ja `SENT`.
2. Reprocessar lote de falhas:
   - `POST /conversations/:conversationId/messages/reprocess-failed`
   - body opcional: `{ "limit": 50 }`

## 2.1) Worker cai logo apos restart (race Prisma)

Causa comum:

1. `api` e `worker` compartilhando o mesmo volume de `node_modules`.
2. `prisma generate` rodando em paralelo nos dois servicos.

Correcao:

1. Usar volume dedicado para o worker (`worker_node_modules`).
2. No `worker`, remover `prisma:push` do comando de bootstrap.
3. Recriar containers:
   - `docker compose down`
   - `docker compose --profile channels up -d --build`
4. Validar:
   - `docker compose ps worker` deve permanecer `Up`.

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

## 3.3) Estado WhatsApp oscila entre conectado/desconectado e envio falha (`Connection Closed`, `1006`)

Causa comum:

1. Reconexoes forçadas em sequencia (`connect`/`qrcode?force=true`) durante fase de pareamento.
2. Polling concorrente de status/QR saturando a Evolution durante instabilidade.
3. Sessao da instancia em conflito (`stream replaced`) no provider.

Ajuste aplicado no projeto:

1. `GET /tenant/whatsapp/status` agora usa cache curto + deduplicacao de requests in-flight e fallback para ultimo estado conhecido em erro transitorio.
2. `GET /tenant/whatsapp/qrcode` nao força reconexao continuamente: existe cooldown server-side para `force=true`.
3. `POST /tenant/whatsapp/connect` agora evita reconnect redundante quando a instancia ja esta `open/connecting` e aplica cooldown curto.

Checklist de validacao:

1. Reiniciar API e web apos atualizar codigo:
   - `docker compose restart api web worker`
2. Conferir logs da Evolution:
   - `docker compose --profile channels logs -f evolution`
3. Conferir logs do worker para retries de rede:
   - `docker compose logs -f worker | rg "transientConnectionError|Connection Closed|1006"`

## 3.4) `status/qrcode/connect` retornam 500 e container `evolution` aparece `Exited (1)`

Causa comum:

1. Boot race no startup: Evolution tenta migracao do Prisma enquanto Postgres ainda esta inicializando (`FATAL: the database system is starting up`).
2. Service `evolution` nao estava ativo no profile `channels`.

Correcao:

1. Subir/recuperar apenas o canal:
   - `docker compose --profile channels up -d evolution`
2. Validar se ficou em `Up`:
   - `docker compose ps -a`
3. Conferir logs do startup:
   - `docker compose --profile channels logs --tail=120 evolution`
4. Validar API novamente:
   - `GET /tenant/whatsapp/status`
   - `GET /tenant/whatsapp/qrcode?force=false`
   - `POST /tenant/whatsapp/connect`

Observacao:

1. O `docker-compose.yml` do projeto agora usa `restart: unless-stopped` no service `evolution` para auto-recuperacao apos falhas transitórias de boot.

## 3.5) Mensagens chegam no WhatsApp, mas nao atualizam na Inbox

Causa comum:

1. Webhook `messages-upsert` sendo recusado por `413 Request body is too large` (payload com `base64` muito grande).
2. Em chats com identificador `@lid`, alguns eventos podem vir com `remoteJidAlt` e cair em mapeamento inconsistente se nao priorizar JID telefonico.

Correcao aplicada no projeto:

1. API com limite de body mais alto por padrao (`API_BODY_LIMIT_MB=200`).
2. Bootstrap/setWebhook com `webhookBase64=false` para reduzir payload e evitar gargalo de ingestao.
3. Parser de webhook prioriza `remoteJidAlt`/`@s.whatsapp.net` para conversa direta antes de `@lid`.

Checklist de recuperacao:

1. Reiniciar API:
   - `docker compose restart api`
2. Regravar webhook da instancia (sem base64):
   - executar `Bootstrap` no Admin (ou `POST /tenant/whatsapp/bootstrap`).
3. Confirmar em resposta de bootstrap: `webhookResult.webhookBase64=false`.
4. Verificar logs:
   - `docker compose logs -f api` (nao deve repetir `Request body is too large` em `messages-upsert`).

## 3.2) Busca de GIF retorna erro de provider nao configurado

Causa comum:

1. `NUXT_TENOR_API_KEY` nao definido no ambiente do `web`.
2. `NUXT_GIF_PROVIDER` diferente de `tenor`.

Comportamento esperado atual:

1. A rota `/api/gif/search` nao retorna mais HTTP 500 nesse caso.
2. A UI mostra aviso amigavel no painel de GIF.

Correcao:

1. Ajustar `.env`:
   - `NUXT_GIF_PROVIDER=tenor`
   - `NUXT_TENOR_API_KEY=<sua-chave-tenor>`
2. Recriar apenas o `web`:
   - `docker compose up -d --build --force-recreate web`
3. Validar no navegador:
   - abrir aba GIF no composer e buscar por termo simples (`amor`, `oi`, `feliz`).

## 3.3) Figurinhas nao ficam salvas no composer

Causa comum:

1. API de figurinhas bloqueada por permissao (`VIEWER` nao pode salvar/remover).
2. Falha no endpoint backend (`/stickers`).
3. Data URL invalida ou acima do limite de figurinha.

Correcao:

1. Validar role do usuario (`ADMIN`, `SUPERVISOR` ou `AGENT` para salvar/remover).
2. Testar endpoints:
   - `GET /stickers?limit=36`
   - `POST /stickers`
   - `DELETE /stickers/:stickerId`
3. Limite atual de figurinha no backend:
   - `min(tenant.maxUploadMb, 20MB)` por item.

## 4) Erro de permissao `403`

Causa:

Rotas administrativas exigem role `ADMIN`.

Correcao:

1. Login com usuario ADMIN.
2. Ou promover usuario no painel core (`/admin/core`) ajustando role/permissoes do tenant user.

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

## 7.1) Console com varios `403` em `pps.whatsapp.net` (avatar)

Causa comum:

1. URL de avatar do WhatsApp expirada/restrita para acesso direto pelo browser.
2. Front tentando baixar avatar direto de host externo sem proxy.

Correcao aplicada:

1. Front passa URLs de avatar WhatsApp por proxy local:
   - `/api/avatar/whatsapp?url=...`
2. O proxy server-side retorna:
   - imagem (`200`) quando disponivel
   - `204` quando upstream falha/expira (sem quebrar a inbox)

Validacao:

1. A requisicao no browser deve apontar para `http://localhost:3000/api/avatar/whatsapp?...`
2. O erro `403` de `pps.whatsapp.net` deixa de aparecer em massa no console.

## 7.2) Nome do contato oscila entre numero e nome na mesma conversa

Causa comum:

1. Parte das mensagens foi persistida com `senderName` tecnico (`numero`, `@lid`, `@s.whatsapp.net`).
2. Ingestao nova e historico legado usando fallback diferente, gerando inconsistencias visuais.

Correcao aplicada:

1. Ingestao (`messages-upsert`) prioriza `existingConversation.contactName` quando `senderName` inbound direto vem fraco/tecnico.
2. Leitura de mensagens (`GET /conversations/:id/messages*`) normaliza `senderName` no retorno para conversa direta, sem depender do valor bruto legado.

Saneamento do historico legado:

1. Rodar no container da API:
   - `docker compose exec api npm run fix:sender-names`
2. Resultado esperado:
   - `candidatos: 0` apos aplicar.

## 8) Chat abre sem ultima mensagem / historico truncado

Causa comum:

1. Front consumindo pagina sem cursor de historico.
2. Endpoint de mensagens sem uso de `beforeId`.

Correcao:

1. Validar uso de paginacao no front:
   - arquivo: `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`
2. Validar contrato da API:
   - `GET /conversations/:conversationId/messages?limit=...&beforeId=...`
   - retorno com `hasMore`
3. Rodar sync de historico da conversa para backfill de mensagens perdidas em reconnect:
   - `POST /conversations/:conversationId/messages/sync-history`
4. Verificar no retorno do sync:
   - `queryVariant` (estrategia selecionada na Evolution)
   - `processedCount` e `createdCount`

## 8.1) Inbox continua desatualizada quando websocket oscila

Causa comum:

1. Socket.IO caiu (`disconnect/connect_error`) e a aba ficou sem eventos realtime.
2. Historico local nao foi revalidado apos sync deduplicado (sem `createdCount`).

Correcao aplicada:

1. `useOmnichannelInboxRealtime` agora ativa polling leve de fallback enquanto o socket estiver instavel.
2. `useOmnichannelInboxHistory` passou a recarregar a conversa ativa apos sync com `processedCount > 0`.
3. Endpoint `/messages/sync-history` usa consulta escopada por `where.key.remoteJid` (com `offset/limit`) para evitar lote misto de outras conversas da instância.
4. Validar retorno do sync:
   - `queryVariant` deve vir como `where.key+offset` ou `where.key+limit`
   - se `conversationLastMessageAt` permanecer antigo e `createdCount=0`, a Evolution nao possui backfill novo para essa conversa no momento.
5. Backfill antigo nao deve mais regredir preview:
   - `lastMessageAt` agora so avanca (nunca volta para data menor) ao processar webhook/sync de historico.

## 9) Midia outbound falha (imagem/audio/video/documento)

Causa comum:

1. `mediaUrl` ausente na mensagem outbound.
2. Endpoint de envio de midia/audio nao configurado.
3. URL da midia inacessivel para Evolution.

Correcao:

1. Validar payload de envio:
   - `type` em `IMAGE|AUDIO|VIDEO|DOCUMENT`
   - `mediaUrl` obrigatorio
2. Validar `.env`:
   - `EVOLUTION_SEND_MEDIA_PATH=/message/sendMedia/:instance`
   - `EVOLUTION_SEND_AUDIO_PATH=/message/sendWhatsAppAudio/:instance`
   - `EVOLUTION_SEND_STICKER_PATH=/message/sendSticker/:instance`
   - `EVOLUTION_SEND_REACTION_PATH=/message/sendReaction/:instance`
3. Testar URL da midia de dentro do container Evolution (quando usar URL privada/restrita).
4. Para teste local rapido, enviar `mediaUrl` em formato `data:` (base64) pelo front.
5. O worker converte `data:*;base64,...` para base64 puro antes de chamar `sendMedia`.
   - motivo: Evolution `v2.3.7` retorna `400` com `Owned media must be a url or base64` quando recebe `data:` URI crua.
6. Se arquivo maior demora/falha por timeout, aumentar:
   - `EVOLUTION_REQUEST_TIMEOUT_MS=90000` (ou mais, conforme rede/host).

## 9.3) Audio gravado (`audio/webm;codecs=opus`) falha com `FAILED`

Causa comum:

1. `data:` URI com parametros extras (`;codecs=...`) nao estava sendo normalizada para base64 puro no worker.

Correcao:

1. Ajustar normalizacao de `data:` para aceitar parametros extras antes de `;base64,`.
2. Reprocessar mensagem falhada:
   - `POST /conversations/:conversationId/messages/:messageId/reprocess`

## 9.1) `POST /conversations/:id/messages` retorna `400 Payload invalido` com anexo

Causa comum:

1. Backend sem suporte a `mediaUrl` longo (`data:` base64).
2. API antiga ainda em memoria sem restart.

Correcao:

1. Atualizar backend com limite maior de `mediaUrl`.
2. Reiniciar `api` e `worker`:
   - `docker compose restart api worker`
3. Repetir envio do anexo pelo composer.

## 9.2) Botao de envio fica carregando indefinidamente com anexo

Causa comum:

1. `fetch` direto do browser para API ficou pendurado (rede/CORS).

Correcao:

1. Front da inbox usa timeout no envio direto.
2. Em timeout/erro de rede, o envio cai automaticamente para o BFF (`/api/bff/*`).
3. A UI mostra erro amigavel abaixo do composer quando ambas tentativas falham.
4. O timeout agora e dinamico por tamanho do arquivo (ate 300s no envio direto), reduzindo falso timeout em anexos maiores.

## 9.4) UI lenta/travando ao enviar midia maior

Causa comum:

1. Eventos realtime (`message.created`) transportando `mediaUrl` em `data:` base64 muito grande.
2. Redis + Socket repassando payloads pesados para todos clientes.

Correcao:

1. Payload de realtime agora sanitiza `mediaUrl` quando for `data:`.
2. O chat do remetente continua com preview local do anexo.
3. Mensagens antigas podem manter `data:` no banco, mas nao sao mais difundidas no canal realtime.

## 9.5) Anexo nao anexa e mostra erro no composer

Causa comum:

1. Arquivo acima do limite operacional definido para o MVP.

Correcao:

1. Limite atual do front: `20MB` por anexo.
2. Reduzir/comprimir o arquivo antes do envio ou evoluir para upload binario/multipart no backend.

## 9.6) Audio curto demora minutos para sair de `PENDING`

Causa comum:

1. Audio com codec nao aceito pela Evolution no endpoint de voice-note.
2. Retry sem fallback claro no worker.

Correcao:

1. Worker tenta `sendWhatsAppAudio` primeiro e, em erro compativel, faz fallback para `sendMedia` como documento.
2. Gravador no front prioriza codec `audio/ogg;codecs=opus` quando o navegador suporta.
3. Se ainda ficar lento, validar `EVOLUTION_REQUEST_TIMEOUT_MS` e latencia da instancia Evolution.

## 9.7) `FAILED` com `exists:false` no log do worker

Causa comum:

1. Conversa outbound aponta para numero sem conta WhatsApp ativa.
2. Muito comum em conversas seed/demo (`5511999999999@s.whatsapp.net`).

Correcao:

1. Ver logs do worker no campo `responseErrors`.
2. Se retornar algo como `{\"jid\":\"...\",\"exists\":false}`, trate como destino invalido (nao e bug de payload).
3. O worker marca `FAILED` e encerra sem retries quando classifica como `unrecoverable`.
4. Testar envio em conversa real conectada para validar regressao de codigo de envio.

## 10) Midia nao aparece no preview do chat

Causa comum:

1. Mensagem recebida sem `mediaUrl` no payload do webhook.
2. Mensagem antiga sem campos novos (`messageType`/`mediaUrl`).

Correcao:

1. Validar mensagem em `GET /conversations/:id/messages`:
   - `messageType` deve vir como `IMAGE|AUDIO|VIDEO|DOCUMENT`.
   - `mediaUrl` deve estar preenchido para renderizar preview.
2. Reenviar a mensagem de teste apos update de backend/webhook.
3. Para inbound WhatsApp, o parser agora prioriza `base64` do webhook para persistencia de `mediaUrl`.
   - evita preview quebrado por URL temporaria/criptografada (`.enc`).

## 10.2) Midia so aparece apos recarregar a pagina

Causa comum:

1. Evento realtime (`message.created`) chega com `mediaUrl` sanitizado (`null`) para evitar trafegar base64 gigante.
2. Front nao hidratou a mensagem pelo `id` logo apos receber o evento.
3. `message.updated` chegava apenas com status sem snapshot completo da mensagem, impedindo atualizar midia em tempo real.

Correcao:

1. Front passa a buscar `GET /conversations/:conversationId/messages/:messageId` quando detectar mensagem de midia sem `mediaUrl` no realtime.
2. A bolha mostra estado "Carregando preview..." enquanto hidrata.
3. Backend passa a emitir `message.updated` com payload completo (sanitizando somente `data:`), permitindo merge no front sem reload.
4. Validar no navegador sem reload: imagem/audio/documento devem aparecer apos alguns milissegundos.

## 10.1) Webhook de midia retorna `413 Request body is too large`

Causa comum:

1. Payload do webhook com base64 excede limite da API.

Correcao:

1. Ajustar `.env`:
   - `API_BODY_LIMIT_MB=80` (ou maior conforme necessidade)
2. Reiniciar API:
   - `docker compose restart api`
3. Repetir teste de envio/recebimento de midia.

## 10.3) Imagem especifica aparece como enviada no painel, mas nao chega no WhatsApp

Causa comum:

1. Arquivo com MIME/extensao limitrofe para pipeline de conversao da Evolution.
2. Resposta de API aceita upload, mas entrega final nao ocorre para aquele binario especifico.

Correcao:

1. Repetir envio da mesma imagem como `Documento (sem compressao)` para validar bypass da pipeline de imagem.
2. Registrar no checklist da matriz de regressao:
   - nome do arquivo
   - tamanho
   - MIME detectado no browser
   - tipo selecionado no composer (IMAGE vs DOCUMENT)
3. Se reproduzir somente em `IMAGE`, tratar como caso de codec/MIME e manter fallback de envio como `DOCUMENT`.
4. Ver log do worker `Dispatch outbound media` para confirmar `messageType`, `mimeType`, `fileName` e `fileSizeBytes` do arquivo problematico.

## 10.4) Arquivo inbound de grupo aparece como `file (x).enc`

Causa comum:

1. Provider retornou midia ainda criptografada (`.enc`) sem decrypt aplicado no pipeline inbound.
2. URL temporaria expirada/indisponivel e fallback nao conseguiu hidratar midia decodificada.

Status atual:

1. Caso em andamento no backlog (`A2-011`).
2. Parser inbound prioriza base64 antes de URL para reduzir chance de persistir `.enc` quando houver fonte decodificada.
3. Nome de arquivo `.enc` e sanitizado (backend + front) para exibicao/download coerente com MIME.
4. Metadata da mensagem registra `mediaSourceKind` e `requiresMediaDecrypt` para diagnostico.
5. Download/abertura no painel usa proxy autenticado `GET /conversations/:conversationId/messages/:messageId/media`, forcando `Content-Disposition` coerente para mensagens antigas.
6. O proxy tenta reidratacao automatica via Evolution (`chat/getBase64FromMediaMessage`) quando detectar `url_encrypted`, `.enc` ou URL de midia expiravel.
7. Em sucesso, a API persiste base64 decodificado na mensagem e publica `message.updated` para o front reidratar sem reload.

Mitigacao imediata:

1. Exibir placeholder e manter a mensagem visivel no chat quando nao houver `mediaUrl` valido.
2. Permitir `Abrir/Baixar` quando houver `mediaUrl` utilizavel.
3. Validar no banco `metadataJson.mediaSourceKind` para identificar se o caso veio como `url_encrypted`.

Proximo ajuste tecnico:

1. Cobrir com teste de regressao de midia para nao quebrar texto/audio/video ja estaveis.
2. Se ainda houver payload sem base64 e sem sucesso no endpoint de reidratacao, avaliar fallback dedicado de decrypt fora da Evolution.

## 10.5) Bateria automatica de midia (encerrar loop de teste manual)

Objetivo:

1. Validar rapidamente pipeline de envio por tipo (`TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`) sem ficar em ciclo manual infinito.
2. Detectar se existe regressao de `PENDING` infinito.

Comando:

1. `cd apps/api`
2. `npm run test:media:battery`

Parametros opcionais:

1. `BATTERY_DESTINATION_EXTERNAL_ID`: destino de homologacao real (numero/JID de teste).
2. `BATTERY_POLL_TIMEOUT_MS`: timeout maximo por mensagem (default `75000`).
3. `BATTERY_POLL_INTERVAL_MS`: intervalo de polling de status (default `2000`).

Interpretacao:

1. Rodando sem `BATTERY_DESTINATION_EXTERNAL_ID`, o script usa destino invalido controlado e deve retornar `FAILED` rapido para todos os tipos (isso valida pipeline e elimina `PENDING` infinito sem disparo real).
2. Com destino real de homologacao, o esperado e `SENT` para os tipos suportados.
3. Se qualquer item ficar `PENDING` no final, tratar como regressao de fila/worker/realtime.

## 11) Mensagem outbound aparece duplicada no chat

Causa comum:

1. Webhook tratando `MESSAGES_UPDATE` como criacao de mensagem (em vez de atualizar estado/delecao/reacao).
2. Dedupe outbound dependendo de `mediaUrl` identica (pode mudar entre upload local e retorno da Evolution).

Correcao:

1. Processar criacao apenas para evento `MESSAGES_UPSERT`.
2. Em `MESSAGES_UPDATE`, processar somente atualizacoes suportadas (reacao e delecao) e ignorar o resto com `202`.
3. No fallback de dedupe outbound (`fromMe`), usar janela curta por `messageType` e conversa, sem exigir `mediaUrl` identica.

## 12) Foto/video enviados como documento saem como midia normal

Causa comum:

1. Front inferindo tipo somente por MIME, ignorando o modo do picker.

Correcao:

1. Quando o picker e `Documento`, forcar `type = DOCUMENT` mesmo para `image/*` e `video/*`.
2. Usar opcao `Documento (sem compressao)` no menu do composer para manter o comportamento tipo WhatsApp.

## 13) Mencoes `@` em grupo nao funcionam

Causa comum:

1. Payload de outbound sem campos de mencao esperados pela Evolution (`mentionsEveryOne` e `mentioned[]`).
2. Inbound com `@numero` sem mapeamento de nome para renderizacao.
3. Grupo usando identificadores `@lid` e sem resolucao de contato.

Correcao:

1. Garantir que o `sendText` envie mencoes no root do payload (`mentionsEveryOne` e `mentioned`).
2. Persistir `metadataJson.mentions` no webhook a partir de `contextInfo.mentionedJid`.
3. Em conversa de grupo, validar endpoint `GET /conversations/:conversationId/group-participants`.
4. A API agora cruza `group/findGroupInfos` + `chat/findContacts` para resolver `@lid` em:
   - nome do participante (quando disponivel no provedor)
   - avatar do participante
5. Se a Evolution nao retornar nome para um `@lid` especifico, o fallback continua numerico ate haver dado de contato/historico.

## 14) Retencao nao esta apagando historico antigo

Causa comum:

1. Servico `retention-worker` nao iniciado no compose.
2. Variaveis de ambiente de retencao ausentes/invalidas.
3. `retentionDays` muito alto para o tenant de teste.

Correcao:

1. Validar servico:
   - `docker compose ps retention-worker`
2. Ver logs:
   - `docker compose logs -f retention-worker`
3. Conferir variaveis:
   - `RETENTION_SWEEP_ON_BOOT=true`
   - `RETENTION_SWEEP_INTERVAL_MINUTES=1440`
4. Conferir `retentionDays` do tenant no `/admin` e ajustar para um valor curto durante teste.

## 15) Front quebra com `users.value.map/filter/sort is not a function`

Causa comum:

1. Resposta JSON do BFF truncada/fora de formato.
2. Front recebendo string/objeto ao inves de array em `/users` ou `/conversations`.

Correcao:

1. No BFF (`apps/omni-nuxt-ui/server/api/bff/[...path].ts`), nao repassar `content-length` de upstream para respostas JSON reserializadas.
2. Repassar `content-length` apenas para payload binario (midia/download).
3. No composable (`apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`), validar resposta e aplicar fallback para array vazio.

Validacao rapida:

1. `curl -i http://localhost:3000/api/bff/users` deve retornar JSON completo parseavel.
2. Se vier corpo truncado, rebuild do container `web`:
   - `docker compose up -d --build web`

## 16) Validar isolamento por tenant (seguranca)

Objetivo:

1. Garantir que usuario de um tenant nao consiga ler/alterar recursos de outro tenant.

Comando:

1. `cd apps/api`
2. `npm run test:tenant:isolation`

Resultado esperado:

1. Saida JSON com `summary.failed = 0`.
2. Checks de acesso cruzado retornando `404`.
3. Check sem token retornando `401`.

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
2. Verificar o alerta do card `Conexao WhatsApp`:
   - `WhatsApp conectado`
   - `WhatsApp desconectado (aguardando QR)`
   - `WhatsApp desconectado (QR pronto para leitura)`
3. Se necessario, clicar `Atualizar status` e depois `Atualizar QR`.
4. Na `/` (Inbox), validar alerta operacional no topo quando o canal estiver desconectado/nao configurado.

## Ponto de depuracao por arquivo

1. Erro de auth/JWT: `apps/api/src/plugins/auth.ts`
2. Erro em tenant/admin: `apps/api/src/routes/tenant.ts`
3. Erro em usuarios: `apps/api/src/routes/users.ts`
4. Erro de envio outbound: `apps/api/src/workers/outbound-worker.ts`
5. Envio outbound por tipo:
   - `apps/api/src/workers/senders/send-text.ts`
   - `apps/api/src/workers/senders/send-media.ts`
   - `apps/api/src/workers/senders/common.ts`
5. Erro webhook inbound: `apps/api/src/routes/webhooks.ts`
6. Erro realtime: `apps/api/src/event-bus.ts` e `apps/api/src/main.ts`
7. Erro de UI inbox (container): `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelInboxModule.vue`
8. Erro de dominio inbox (estado/socket/paginacao): `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`
9. Erro de UI inbox (sidebar conversas): `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxConversationsSidebar.vue`
10. Erro de UI inbox (chat): `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxChatPanel.vue`
11. Erro de UI inbox (detalhes): `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxDetailsSidebar.vue`
12. Tipos inbox: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/types.ts`
13. Erro de UI admin (container): `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelAdminModule.vue`
14. Erro de dominio admin (estado/polling): `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelAdmin.ts`

