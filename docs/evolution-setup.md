# Setup Evolution API (WhatsApp nao oficial)

## Objetivo

Configurar o canal WhatsApp para:

1. Receber mensagens inbound na plataforma.
2. Enviar mensagens outbound via worker.
3. Isolar instancia por tenant.

## Onde obter a "API key" da Evolution

Neste projeto self-hosted, a chave **nao e comprada** nem emitida por painel externo.
Voce define a chave no `.env` e ela vira a credencial do header `apikey`.

1. Defina um valor forte para `EVOLUTION_API_KEY`.
2. O `docker-compose.yml` ja injeta essa mesma chave no container Evolution em:
   `AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}`.
3. A API interna usa o mesmo valor para autenticar requests na Evolution.

## Fontes oficiais

1. Env `AUTHENTICATION_API_KEY` na Evolution:
   https://doc.evolution-api.com/v2/pt/get-started/introduction
2. Endpoint de criar instancia:
   https://doc.evolution-api.com/v2/api-reference/instance/create-instance
3. Endpoint de conectar instancia:
   https://doc.evolution-api.com/v2/api-reference/instance/connect-instance
4. Endpoint de estado de conexao:
   https://doc.evolution-api.com/v2/api-reference/instance/connection-state
5. Endpoints de webhook:
   https://doc.evolution-api.com/v2/api-reference/webhook/set
   https://doc.evolution-api.com/v2/api-reference/webhook/find
6. Repositorio oficial:
   https://github.com/EvolutionAPI/evolution-api

## Configuracao necessaria no `.env`

Exemplo funcional para o seu compose atual:

```env
EVOLUTION_BASE_URL=http://evolution:8080
EVOLUTION_API_KEY=troque-por-chave-forte
EVOLUTION_IMAGE=evoapicloud/evolution-api:v2.3.7
EVOLUTION_CONFIG_SESSION_PHONE_VERSION=2,3000,1025205472
EVOLUTION_DATABASE_URL=postgresql://omnichannel:omnichannel@postgres:5432/omnichannel?schema=evolution
EVOLUTION_SEND_PATH=/message/sendText/:instance
EVOLUTION_DEFAULT_INSTANCE=demo-instance
EVOLUTION_WEBHOOK_TOKEN=troque-token-webhook
WEBHOOK_RECEIVER_BASE_URL=http://api:4000
```

Explicacao:

1. `EVOLUTION_BASE_URL`:
   URL interna no Docker network.
2. `EVOLUTION_API_KEY`:
   chave usada tanto pela API quanto pela Evolution.
3. `EVOLUTION_SEND_PATH`:
   rota de envio usada no worker.
4. `EVOLUTION_IMAGE`:
   imagem recomendada da Evolution para evitar problemas de QR em builds antigas.
5. `EVOLUTION_CONFIG_SESSION_PHONE_VERSION`:
   versao de sessao do WhatsApp (ajuda quando aparece `statusReason: 405`).
6. `EVOLUTION_DATABASE_URL`:
   conexao da Evolution no Postgres (schema separado `evolution`).
7. `EVOLUTION_DEFAULT_INSTANCE`:
   fallback se tenant nao tiver instancia definida.
8. `EVOLUTION_WEBHOOK_TOKEN`:
   token validado na rota de webhook inbound.
9. `WEBHOOK_RECEIVER_BASE_URL`:
   base usada para montar URL de webhook por tenant.

## Passo a passo operacional

1. Ajustar `.env` com variaveis acima.
2. Reiniciar stack:
   `docker compose --profile channels up -d --build`
3. Login como admin em `http://localhost:3000/login`.
4. Acessar `http://localhost:3000/admin`.
5. Em "Canal WhatsApp (Evolution)", clicar `Bootstrap`.
6. Clicar `Conectar por QR` e escanear o QR no WhatsApp.
7. Clicar `Status` para confirmar conexao.

## QR sem numero

Sim, no fluxo principal nao precisa numero.

1. `POST /tenant/whatsapp/connect` sem `number` => modo QR.
2. `GET /tenant/whatsapp/qrcode` retorna imagem do QR para exibir na UI.
3. Campo `number` e apenas opcional para fluxo de pairing code.

## Erro: "Database provider invalid"

Causa:

1. Evolution sem `DATABASE_PROVIDER` valido.

Correcao neste projeto:

1. O `docker-compose.yml` ja foi ajustado para usar:
   - `DATABASE_ENABLED=true`
   - `DATABASE_PROVIDER=postgresql`
   - `DATABASE_CONNECTION_URI=${EVOLUTION_DATABASE_URL}`
2. Reinicie o profile channels:
   `docker compose --profile channels up -d --build`

## Erro: `statusReason: 405` e QR nao aparece

Causa comum:

1. Imagem antiga da Evolution (ex.: `atendai/evolution-api:v2.1.1`) sem compatibilidade com sessao atual.

Correcao:

1. Usar imagem mais recente (`evoapicloud/evolution-api:v2.3.7` ou `latest`).
2. Definir `EVOLUTION_CONFIG_SESSION_PHONE_VERSION` no `.env`.
3. Reiniciar a stack de canais e recriar a instancia:
   - `docker compose --profile channels up -d evolution`
   - `POST /tenant/whatsapp/bootstrap`

## Observacao importante sobre webhook em producao

Em ambiente fora do docker local, `WEBHOOK_RECEIVER_BASE_URL` deve ser URL publica HTTPS da sua API, por exemplo:

`https://api.seudominio.com`

Sem isso, a Evolution nao consegue chamar o webhook inbound.

## Onde essa configuracao e usada no codigo

1. Parse de env:
   `apps/api/src/config.ts`
2. Cliente Evolution:
   `apps/api/src/services/evolution-client.ts`
3. Bootstrap/connect/status do tenant:
   `apps/api/src/routes/tenant.ts`
4. Recebimento de webhook:
   `apps/api/src/routes/webhooks.ts`
5. Envio outbound no worker:
   `apps/api/src/workers/outbound-worker.ts`
