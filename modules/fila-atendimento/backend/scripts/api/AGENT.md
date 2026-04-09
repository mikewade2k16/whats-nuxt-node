# AGENT

## Escopo

Estas instrucoes valem para `back/scripts/api`.

## Objetivo

Os scripts desta pasta existem para subir, parar e inspecionar a API local no Windows sem depender de Docker.

## Regras

- a porta padrao da API local e `8080`
- os scripts assumem o Postgres local do projeto por padrao
- os logs da API local ficam em `back/.logs/`
- se houver processo antigo escutando na mesma porta, o start local deve derrubar essa instancia para evitar falso positivo de build velha
- `start-local.ps1` deve aplicar migrations antes de subir a API local
- `start-local.ps1` deve expor defaults do shell bridge local para permitir smoke do modulo sem configuracao manual extra

## Scripts

- `start-local.ps1`
  - sobe a API atual do projeto em background
  - aplica `go run ./cmd/migrate up` por padrao antes do boot
  - aguarda `GET /healthz`
  - injeta defaults locais de `AUTH_SHELL_BRIDGE_SECRET` e `AUTH_SHELL_BRIDGE_TENANT_SLUG`
  - grava logs em `.logs/api-local.*.log`
- `stop-local.ps1`
  - encerra processos que estiverem escutando a porta da API local
- `status-local.ps1`
  - mostra listeners, processo e resposta atual do `/healthz`

## Troubleshooting

Se `GET /healthz` responder `200`, mas uma rota nova como `/v1/operations/snapshot` voltar `404`, quase sempre existe uma instancia antiga da API rodando em segundo plano.

Fluxo recomendado:

1. `.\scripts\api\stop-local.ps1`
2. `.\scripts\api\start-local.ps1`
3. validar `http://localhost:8080/healthz`
4. quando o smoke for de SSO, abrir o frontend do modulo com `shellBridgeToken` fresco e validar a entrada em `/operacao`
