# Checklist de Deploy em Produção

> Este arquivo nao e mais mantido como playbook separado.
> O documento canonico de deploy/producao agora e `docs/deploy-vps.md`.

## Fonte unica de verdade

Use sempre `docs/deploy-vps.md` para:

- acesso rapido a VPS, credenciais, containers e comandos
- preparacao inicial da VPS
- configuracao do `.env.prod`
- envio de codigo e subida dos servicos
- verificacao pos-deploy
- atualizacoes futuras
- troubleshooting real do ambiente atual
- incidentes e correcoes historicas ja validadas em producao
- checklist de go-live e proximos passos de endurecimento

## Onde olhar no documento canonico

- setup inicial da VPS: `docs/deploy-vps.md` secoes `1` a `3`
- subir e validar o ambiente: `docs/deploy-vps.md` secoes `4` a `7`
- WhatsApp / Evolution / inbox / QR / login / deploy incidents: `docs/deploy-vps.md` secao `7` e secao `9`
- checklist operacional atual: `docs/deploy-vps.md` secao `8.1`
- pendencias para producao mais endurecida: `docs/deploy-vps.md` secao `8.2`
- estado atual da infraestrutura: `docs/deploy-vps.md` secao `10`

## Checklist enxuto de liberacao

Antes de declarar o ambiente pronto, validar no documento canonico:

- health da API `200`
- login do painel `200`
- containers criticos `Up`
- WhatsApp conectado
- inbox criando conversas via `sync-open`
- historico sincronizando via `sync-history` quando houver backfill
- teste inbound e outbound reais
- worker sem mensagens presas
- backup/firewall/operacao basica definidos

## Regra daqui para frente

- nao duplicar instrucoes de deploy aqui
- qualquer ajuste novo de deploy, VPS, Evolution, Caddy, login ou troubleshooting deve ser documentado somente em `docs/deploy-vps.md`
