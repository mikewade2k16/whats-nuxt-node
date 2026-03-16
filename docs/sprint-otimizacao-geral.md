# Sprint de Otimizacao Geral (Infra + App)

Data base: 2026-03-05
Escopo: estabilidade local, consumo de recursos e latencia percebida no uso diario do painel.

## Objetivo

1. Reduzir travamentos em ambiente de desenvolvimento.
2. Melhorar responsividade da inbox e do admin.
3. Diminuir risco de falha operacional apos reboot (com foco em Redis).
4. Criar trilha de otimizacao continua com metas mensuraveis.

## Sintomas observados

1. Container `redis-1` falhando para subir apos reboot.
2. Uso alto de CPU/RAM no host durante `docker compose up`.
3. Sensacao de UI pesada e carregamento lento na inbox.
4. Requisicoes repetidas em excesso em algumas telas operacionais.

## Causas provaveis

1. Redis com AOF em ambiente local (maior chance de problema com desligamento abrupto).
2. `npm install` rodando em todo restart de containers de app.
3. `prisma:push` + `prisma:seed` executando sempre no boot da API.
4. Nuxt dev + HMR + bundle grande aberto em varias abas ao mesmo tempo.
5. Polling redundante e sem backoff em fluxos operacionais.
6. Falta de budget formal de performance por rota e por servico.

## Acoes imediatas aplicadas

1. Redis dev sem AOF (`--appendonly no --save ""`) com limite de memoria (`REDIS_MAXMEMORY`).
2. Redis sem porta exposta no host (acesso interno via rede Docker).
3. `npm install` condicional em `api`, `worker`, `retention-worker` e `web`.
4. Bootstrap de banco da API apenas no primeiro boot do volume, com override por `API_DB_BOOTSTRAP_ALWAYS=true`.
5. Limites de heap por servico via `NODE_OPTIONS` no `.env`.
6. Inbox: removido auto-foco agressivo no corpo do chat para melhorar UX de digitacao.
7. Inbox: `Esc` no composer passou a cancelar reply ativo, e `Responder` em outra mensagem troca imediatamente o alvo do reply.
8. Inbox: historico paginado com carga de 50 mensagens por lote e botao manual para carregar mais no topo.
9. Inbox/Admin: dedupe de requests concorrentes + cache curto em chamadas silenciosas de status/QR.
10. Inbox realtime: cooldown de refresh de conversas e polling de status menos frequente.

## Ajustes de regressao (2026-03-06)

1. Blindagem de labels na UI para nao exibir IDs tecnicos (`@lid`, `@s.whatsapp.net`, `@g.us`).
2. Fallback de nome para telefone quando nao existir nome humano valido (cards, autor de mensagem e mencoes).
3. Nome outbound do operador unificado para reduzir inconsistencias (`Voce` x nome real), com controle admin para exibir/ocultar.
4. Reply jump reforcado com busca por ID interno, externo e match flexivel, incluindo tentativa apos carregar lote antigo.
5. Regressao de avatar da inbox tratada com regra de fonte por tipo: conversa direta usa apenas avatar do contato; grupo usa apenas avatar do grupo (sem misturar avatar de participante no card do grupo).
6. Persistencia do avatar resolvido em conversa sem foto mantida para reduzir reincidencia em recarregamentos.
7. Em caso de avatar de grupo suspeito (mesma URL de avatar de remetente), a UI passa a ocultar a foto ate validacao de avatar real do grupo.
8. Blindagem de autoria no chat: outbound direto nao reaproveita avatar inbound, e reply de inbound nao deve cair no nome do operador por eco do provider.
9. Render de reply legado em conversa direta passa a corrigir autor contaminado (igual ao operador) para `Contato`.

## Solucoes recomendadas (proximas ondas)

1. Front: reduzir polling, consolidar requests duplicadas, usar cache e virtualizacao em listas longas.
2. Backend: revisar endpoints mais chamados, paginar respostas grandes e instrumentar tempo de query.
3. Infra: definir profiles por tarefa, limites por servico e padrao de restart/healthcheck.
4. Operacao: padrao de cold start e runbook de incidentes de fila/realtime.

## Boas praticas de performance

1. Evitar loops de polling sem intervalo progressivo.
2. Evitar refetch de dados identicos em hooks/watchers concorrentes.
3. Priorizar render progressivo para midia e listas longas.
4. Rodar jobs de manutencao fora do caminho critico de UX.
5. Medir antes e depois de cada otimizacao.

## Metricas alvo (Sprint 6)

1. Tempo de subida da stack local (servicos principais): menor que 90s apos cache quente.
2. Tempo de primeira interacao na inbox: menor que 2.5s em ambiente local.
3. Tempo medio de resposta dos endpoints mais usados (`conversations`, `messages`, `status`): menor que 400ms local.
4. Erro de boot do Redis apos reboot: 0 ocorrencias na janela de homologacao.

## Medicoes registradas (antes/depois)

1. Baseline inicial: `docs/metrics/sprint6-baseline-2026-03-05T23-11-59-098Z.json` e `.md`.
2. After (apos dashboard tecnico + ajustes desta rodada): `docs/metrics/sprint6-after-dashboard-2026-03-06T01-47-02-503Z.json` e `.md`.
3. Observacao: o baseline inicial foi coletado antes da correcao da rota de admin para `/admin/omnichannel/operacao`, entao o comparativo direto de pagina considera principalmente `docs` e `inbox`.

## Budget front (rotas criticas)

1. `/admin/omnichannel/inbox`
   - JS por rota (gzip): ate `350KB`.
   - CSS por rota (gzip): ate `35KB`.
   - TTI local (cache quente): ate `2.5s`.
   - Requests no boot da rota: ate `8` (sem abrir conversa).
2. `/admin/omnichannel/operacao`
   - JS por rota (gzip): ate `280KB`.
   - CSS por rota (gzip): ate `25KB`.
   - TTI local (cache quente): ate `2.0s`.
   - Requests no boot da rota: ate `6`.

## Budget infra (servicos)

Ambiente dev local:
1. `api`: alvo `<= 550MB` RAM, pico de CPU curto em bootstrap.
2. `worker`: alvo `<= 350MB` RAM.
3. `retention-worker`: alvo `<= 220MB` RAM.
4. `web`: alvo `<= 700MB` RAM em dev com HMR.
5. `postgres`: alvo `<= 450MB` RAM.
6. `redis`: alvo `<= 220MB` RAM (com `REDIS_MAXMEMORY`).

Ambiente de producao (base por tenant pequeno):
1. `api`: reservar `0.5 vCPU` / `512MB`.
2. `worker`: reservar `0.5 vCPU` / `384MB`.
3. `web`: reservar `0.5 vCPU` / `384MB`.
4. `postgres`: reservar `1 vCPU` / `1GB` (ajustar por volume).
5. `redis`: reservar `0.25 vCPU` / `256MB`.

## Runbook observabilidade basica

1. Medir latencia API:
   - `docker compose logs api --since=10m | rg \"responseTime|statusCode|/conversations|/tenant/whatsapp/status\"`
2. Medir saude de fila/outbound:
   - `docker compose logs worker --since=10m | rg \"outbound|failed|retry|correlation\"`
3. Medir reconexao websocket/realtime:
   - `docker compose logs api --since=10m | rg \"socket|connect|disconnect|conversation.updated|message.created\"`
4. Medir consumo de recursos por servico:
   - `docker stats --no-stream`
5. Rotina de incidente (5 minutos):
   - validar `status` do WhatsApp.
   - confirmar backlog de fila.
   - conferir erro 5xx em endpoints criticos.
   - confirmar latencia de `conversations` e `messages`.
   - registrar timestamp e correlation id para analise.

## Checklist de execucao

1. [x] Estabilizar Redis no compose.
2. [x] Cortar bootstrap desnecessario em containers de app.
3. [x] Ajustar UX de foco no input da inbox.
4. [x] Limitar historico da conversa em lotes de 50 com "carregar mais" sob demanda.
5. [x] Auditar requests repetidas da inbox/admin e cortar redundancia.
6. [x] Criar dashboard basico de latencia e erros por endpoint.
7. [x] Definir e validar budget por rota/servico.
   - validacao registrada em `docs/metrics/sprint6-baseline-2026-03-05T23-11-59-098Z.*` e `docs/metrics/sprint6-after-dashboard-2026-03-06T01-47-02-503Z.*`.
