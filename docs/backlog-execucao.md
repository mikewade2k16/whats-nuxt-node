# Backlog Tecnico Executavel (Omnichannel WhatsApp)

Objetivo: transformar o roadmap em tarefas pequenas e executaveis, com prioridade, dependencia e status rastreavel.

## Legenda de status

- [x] Concluido
- [-] Em andamento
- [ ] Nao iniciado

## Premissas desta fase

- [x] [P0] Canal WhatsApp atual via Evolution/Baileys (nao oficial).
- [x] [P0] Front principal em Nuxt 4 + Nuxt UI.
- [x] [P0] API/worker em Node stateless.
- [ ] [P1] Multi-tenant com trilha de crescimento para planos e limites.

## Macro backlog por epico

- [x] [P0] EPIC-A: Estabilidade de mensagens e midia.
- [x] [P0] EPIC-B: Paridade de experiencia com WhatsApp Web.
- [ ] [P1] EPIC-C: Multi-tenant comercial (planos, limites, retencao).
- [ ] [P1] EPIC-D: Colaboracao interna e operacao.
- [ ] [P1] EPIC-E: Qualidade, observabilidade e seguranca.

## EPIC-A: Estabilidade de mensagens e midia

### A1. Confiabilidade de envio

- [x] [P0] A1-001 Fluxo base de envio/recebimento de texto operacional.
- [x] [P0] A1-002 Corrigir casos de `PENDING` infinito em outbound.
  - entregue 2026-02-26: falha de `outboundQueue.add` agora converte mensagem para `FAILED` imediatamente (envio, reprocesso unitario e reprocesso em lote), com auditoria e evento realtime, eliminando `PENDING` infinito por erro de fila.
- [x] [P0] A1-003 Garantir deduplicacao de eco para texto e midia.
  - entregue 2026-02-26: heuristica de dedupe em webhook expandida para midia (`mediaFileName`, `mediaFileSizeBytes`, `mediaMimeType`, `mediaCaption`, fallback de `content`) + janela curta quando fingerprint e fraco.
- [x] [P0] A1-004 Criar endpoint de reprocessamento de mensagens com falha.
- [ ] [P1] A1-005 Implementar retries com backoff e limite por tipo de erro.

### A2. Midia (imagem, video, audio, documento)

- [-] [P0] A2-001 Envio de imagem/video/documento/audio sem bloquear input.
- [-] [P0] A2-002 Preview local robusto antes do envio (imagem/video/audio/doc).
- [-] [P0] A2-003 Recebimento de midia com fallback quando URL expirar.
- [ ] [P1] A2-004 Download de midia inbound com decrypt quando necessario.
- [x] [P0] A2-005 Diferenciar envio "como documento" sem compressao.
- [-] [P0] A2-006 Player custom de audio no chat (onda, tempo, play/pause).
- [x] [P1] A2-007 Limites de upload por plano/tipo + mensagens de erro claras.
  - entregue 2026-02-26: backend valida limite por tenant (`maxUploadMb`) para `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT` e retorna erro estruturado (`UPLOAD_LIMIT_EXCEEDED`, `UPLOAD_MIME_INVALID`, `UPLOAD_SIZE_REQUIRED`).
  - entregue 2026-02-26: front interpreta `code/details` da API e exibe mensagem clara com tipo e tamanho limite.
  - entregue 2026-02-26: limite passou a ser configuravel no painel Admin por cliente (default `500MB`).
- [ ] [P1] A2-008 Telemetria de tempo de upload por tamanho e MIME.
- [x] [P0] A2-009 Hidratar midia inbound via realtime sem precisar recarregar a pagina.
- [x] [P0] A2-010 Rodar matriz de regressao automatizada de imagem/video por MIME e registrar falhas especificas.
  - execucao 2026-02-26: bateria automatica `npm run test:media:battery` executada (TEXT/IMAGE/VIDEO/AUDIO/DOCUMENT) em destino controlado invalido; todos os casos finalizaram rapido em `FAILED` (sem `PENDING` infinito).
  - validacao complementar 2026-02-26: proxy inbound `GET /conversations/:conversationId/messages/:messageId/media` retornou `200` para IMAGE/VIDEO/AUDIO/DOCUMENT com `content-type` e `content-disposition` coerentes.
  - reteste 2026-02-26: `npm run test:media:battery` + `npm run test:media:integration` repetidos com sucesso tecnico (terminal + auditoria).
  - observacao: homologacao manual real ficou centralizada em `H0-001/H0-002`.
- [x] [P0] A2-011 Corrigir inbound de arquivo em grupo chegando como `file (x).enc` (base tecnica + regressao automatizada).
  - andamento: proxy de midia agora tenta reidratacao automatica via Evolution (`getBase64FromMediaMessage`) e persiste base64 com nome normalizado.
  - status 2026-02-26: sem regressao automatica observada na bateria atual.
  - observacao: homologacao manual final em grupos reais ficou centralizada em `H0-001/H0-002`.

### A3. Fallback de conteudo nao suportado

- [x] [P0] A3-001 Criar helper de tipo desconhecido (`UNSUPPORTED`) no backend.
- [x] [P0] A3-002 Exibir placeholder visivel no chat para payload nao suportado.
- [ ] [P1] A3-003 Exibir acao de contorno (`Abrir no WhatsApp`) quando aplicavel.

## EPIC-B: Paridade de experiencia com WhatsApp Web

### B1. Conversa e composicao

- [-] [P0] B1-001 Reply visual no padrao WhatsApp Web (composer + balao).
- [ ] [P1] B1-002 Encaminhar mensagem no painel.
- [x] [P1] B1-003 Reacoes em mensagens.
  - escopo: picker de reacao no hover/long-press, persistencia por usuario, contador agregado e update realtime.
  - entregue 2026-02-26: UI com badges de reacao por mensagem, menu rapido de emojis no balao e endpoint `POST /conversations/:conversationId/messages/:messageId/reaction`.
  - entregue 2026-02-26: webhook passou a reconciliar `reactionMessage` (upsert/update) e emitir `message.updated` em tempo real.
  - validado 2026-02-27: reacoes homologadas no ambiente local.
- [ ] [P2] B1-004 Editar mensagem (quando conector suportar).
- [ ] [P2] B1-005 Apagar para todos (quando conector suportar).
- [x] [P0] B1-006 Links clicaveis + card de preview no historico.
  - melhoria 2026-02-27: links no corpo da mensagem agora sao renderizados como ancora clicavel.
  - melhoria 2026-02-27: card de preview de link no chat (com fallback por dominio quando preview completo nao vier no payload).
  - melhoria 2026-02-27: envio outbound de texto habilita `linkPreview` automaticamente quando houver URL (ou quando metadata explicito permitir).

### B2. Emojis, stickers e mencoes

- [-] [P0] B2-001 Integrar picker completo de emojis no composer.
  - entregue parcial 2026-02-26: painel no composer com abas `Emoji/GIF/Figurinhas`, busca, categorias e historico de recentes.
- [ ] [P0] B2-002 Renderizar corretamente emojis recebidos em todos os tipos de mensagem.
- [x] [P0] B2-003 Receber e renderizar figurinhas (estaticas/animadas).
  - entregue 2026-02-26: webhook classifica `stickerMessage` como midia inbound (`IMAGE`) com metadado `metadataJson.mediaKind=sticker`.
  - entregue 2026-02-26: chat renderiza figurinha com preview e estilo dedicado; lista de conversas usa placeholder `[figurinha]`.
  - validado 2026-02-27: renderizacao confirmada em uso do painel.
- [x] [P1] B2-004 Enviar figurinhas pelo painel.
  - entregue 2026-02-26: composer permite anexar figurinha (WEBP/PNG/JPG) via menu e aba de figurinhas; backend envia com endpoint dedicado `sendSticker` com fallback para `sendMedia`.
  - melhoria 2026-02-27: aba de figurinhas passou a salvar biblioteca reutilizavel no backend por tenant (`/stickers`), com selecao rapida e remocao de itens salvos.
  - validado 2026-02-27: envio confirmado em homologacao local.
- [-] [P1] B2-005 Resolver nome humano em mencoes recebidas em grupos.
  - melhoria 2026-02-27: webhook passou a forcar `groupInfo` quando houver mencoes na mensagem, enriquecendo `metadataJson.mentions.displayByJid/displayByPhone` para render de nome humano no front.
  - pendencia: validar cenarios com JID `@lid` sem correspondencia nominal na API do provedor.
- [-] [P1] B2-006 Enviar mensagem com `@` mention (payload com `mentions[]`).
  - melhoria 2026-02-27: composer passou a montar `metadataJson.mentions` combinando mencoes detectadas no texto + mencoes explicitas selecionadas no picker.
  - melhoria 2026-02-27: teste automatizado no composable (`apps/web/tests/composables/useOmnichannelInbox.spec.ts`) valida envio de `mentioned[]` para grupo.
  - pendencia: homologacao manual final em grupos reais (incluindo identificadores `@lid`).
- [-] [P0] B2-007 Exibir avatar real do participante em grupos (incluindo mensagem de audio) (parcial; reteste pendente).
  - melhoria 2026-02-26: front passou a resolver avatar por indice de `jid`/telefone/nome e fallback por historico de mensagens (cobrindo cenarios sem `participantJid` no payload atual).
  - melhoria 2026-02-26: inbox agenda refresh de participantes no realtime inbound de grupo (cooldown) para reduzir atrasos de foto apos novas mensagens.
- [-] [P1] B2-008 Mencao clicavel no chat (abrir conversa do contato mencionado com fallback para criar/abrir conversa por numero).
  - entregue parcial 2026-02-26: mencao no corpo da mensagem virou link clicavel e aciona abertura/criacao da conversa 1:1 por JID/numero.
- [x] [P1] B2-009 Sinalizacao de mencao para atendente (badge/alerta diferenciado por conversa + indicador no historico).
  - entregue 2026-02-27: sidebar da inbox ganhou badge por conversa com contador acumulado (`@N Mencao`) para mensagens inbound de grupo com `metadataJson.mentions`.
  - entregue 2026-02-27: historico da conversa exibe indicador `Mencao` no meta da mensagem quando houver mencao inbound em grupo.
  - entregue 2026-02-27: alerta e limpo automaticamente ao abrir/ler a conversa.
  - observacao: alerta por identidade WhatsApp especifica do agente pode evoluir em etapa futura sem bloquear o escopo do item atual.
- [-] [P1] B2-010 Suporte a GIF no painel (busca, preview e envio) com provider configuravel.
  - entregue parcial 2026-02-26: provider configuravel via env (`NUXT_GIF_PROVIDER`, `NUXT_TENOR_API_KEY`) com rotas server-side `/api/gif/search` e `/api/gif/media`.
  - entregue parcial 2026-02-26: aba GIF no composer com busca, preview e anexo para envio como midia.
  - melhoria 2026-02-27: quando `NUXT_TENOR_API_KEY` nao estiver definido, a API de GIF retorna aviso amigavel (sem erro 500) para a UI.
  - pendencia 2026-02-27: manter como incompleto ate configurar `NUXT_TENOR_API_KEY` no ambiente de execucao.
- [-] [P1] B2-011 Envio de contato (vCard) no composer + renderizacao no historico.
  - melhoria 2026-02-27: composer ganhou acao `Contato` no menu de anexo para envio rapido (nome + telefone).
  - melhoria 2026-02-27: chat agora renderiza card de contato via `metadataJson.contact` (inbound/outbound).
  - melhoria 2026-02-27: webhook passou a mapear `contactMessage/contactsArrayMessage` para `metadataJson.contact`.
  - melhoria 2026-02-27: envio outbound de contato agora exige endpoint nativo `EVOLUTION_SEND_CONTACT_PATH` e falha explicitamente quando indisponivel (sem fallback para texto).
  - melhoria 2026-02-27: validacao endpoint-a-endpoint no Admin (`POST /tenant/whatsapp/validate-endpoints`) para checar `sendText/sendMedia/sendWhatsAppAudio/sendContact/sendSticker/sendReaction`.
  - tarefa operacional 2026-02-27: no Admin, executar `Validar endpoints` antes de homologar envio de contato.
  - tarefa operacional 2026-02-27: se `sendContact` retornar `Rota ausente` ou `Erro autenticacao`, ajustar `EVOLUTION_SEND_CONTACT_PATH` e/ou API key (tenant/ambiente) e validar novamente.
  - criterio de aceite 2026-02-27: `sendContact` deve ficar `Disponivel` ou `Disponivel (validacao)`; envio de contato permanece nativo e consistente (sem fallback mascarado para texto).
  - pendencia: homologar comportamento em matriz de provedores/versoes alternativos.
- [x] [P0] B2-012 Garantir nome correto de grupo/contato no card da conversa.
  - entregue 2026-02-27: backend bloqueia overwrite de nome do contato por nome de usuario interno em webhook direto (echo inconsistente do provedor).
  - entregue 2026-02-27: sidebar aplica fallback seguro (telefone/grupo) quando o nome recebido aparenta ser nome de operador.

### B3. Navegacao e leitura

- [-] [P0] B3-001 Scroll de historico com paginacao incremental.
- [-] [P0] B3-002 Marcador de nao lidas ao abrir conversa.
- [-] [P0] B3-003 Separador de data fixo durante scroll.
- [ ] [P1] B3-004 Busca por conteudo em historico com destaque.

## EPIC-C: Multi-tenant comercial (planos, limites, retencao)

### C1. Planos e limites

- [x] [P0] C1-001 Modelar plano por tenant (`maxChannels`, `maxUsers`, `retentionDays`, `maxUploadMb`).
- [x] [P0] C1-002 Bloquear criacao de usuario/instancia acima do limite.
- [x] [P1] C1-003 Painel admin com consumo atual x limite contratado.
- [ ] [P2] C1-004 Regras de upgrade/downgrade de plano.

### C2. Retencao e ciclo de dados

- [x] [P1] C2-001 Configurar retencao por tenant (ex: 15 dias).
- [x] [P1] C2-002 Job diario de expurgo por politica de retencao.
- [x] [P1] C2-003 Auditoria de eventos criticos (envio, falha, status, atribuicao).
  - entregue: tabela `AuditEvent` no Prisma + endpoint `GET /tenant/audit-events` (admin) para consulta com filtros.
  - cobertura atual: `MESSAGE_OUTBOUND_QUEUED`, `MESSAGE_OUTBOUND_SENT`, `MESSAGE_OUTBOUND_FAILED`, `CONVERSATION_STATUS_CHANGED`, `CONVERSATION_ASSIGNED`.

### C3. Contatos e CRM basico (postergado; fora do MVP atual)

- [ ] [P2] C3-001 Criar entidade `Contact` por tenant (nome, telefone, avatar, origem, timestamps).
- [ ] [P2] C3-002 Adicionar acao "Salvar contato" em conversa inbound de numero nao salvo.
- [ ] [P2] C3-003 Vincular conversa a `contactId` apos salvar, sem perder historico atual.
- [ ] [P2] C3-004 Criar lista de contatos com busca e edicao basica.
- [ ] [P2] C3-005 Preparar conversao de contato para lead/cliente (base CRM).

## EPIC-D: Colaboracao interna e operacao

### D1. Usuarios e autoria

- [x] [P0] D1-001 Persistir `senderUserId` em outbound para identificar operador.
- [x] [P0] D1-002 Exibir no historico interno qual atendente enviou cada mensagem.
- [x] [P1] D1-003 Permissoes por papel (admin, supervisor, atendente, viewer).
  - entregue: enum de papel expandida (`ADMIN`, `SUPERVISOR`, `AGENT`, `VIEWER`) + guards de escrita na inbox.
  - comportamento: `VIEWER` fica somente leitura (API retorna `403` em rotas de escrita).

### D2. Canais internos e suporte

- [ ] [P1] D2-001 Chat interno entre atendentes do tenant.
- [ ] [P1] D2-002 Chat cliente (tenant) com admin da plataforma.
- [ ] [P2] D2-003 Inbox de suporte operacional com SLA interno.

### D3. Modo seguro de testes

- [x] [P0] D3-001 Allowlist de contatos/grupos para ambiente de homologacao.
- [x] [P0] D3-002 Conversa de teste dedicada para validar envio sem risco real.
- [x] [P0] D3-003 Flag de bloqueio global de outbound fora da allowlist.

## EPIC-E: Qualidade, observabilidade e seguranca

### E1. Qualidade de software

- [-] [P0] E1-001 Cobertura de testes dos composables principais.
- [x] [P1] E1-002 Testes de integracao API para fluxo outbound por tipo de midia.
  - entregue: script `apps/api/src/scripts/media-integration.ts` (`npm run test:media:integration`) com validacao de status terminal e auditoria por mensagem.
  - reforco: gate CI `media-integration-audit` adicionada em `.github/workflows/ci.yml`.
- [x] [P1] E1-003 Testes E2E de jornada principal (login, inbox, envio, recebimento).
  - entregue 2026-02-26: script `apps/api/src/scripts/journey-e2e.ts` (`npm run test:journey:e2e`) cobrindo login, inbox, outbound e inbound via webhook.
- [x] [P0] E1-004 Pipeline CI com gates por testes/lint/build.
  - entregue: `.github/workflows/ci.yml` com gates de build API + testes/build do web.

### E2. Observabilidade

- [x] [P1] E2-001 Correlation id por mensagem (API -> queue -> worker -> webhook).
  - entregue 2026-02-26: `x-correlation-id` opcional por request, persistencia em `message.metadataJson.correlationId`, propagacao para `outboundQueue`, worker, auditoria e eventos realtime/webhook.
- [x] [P1] E2-002 Dashboard de falhas por tipo de mensagem e tenant.
  - entregue: endpoint `GET /tenant/metrics/failures` + painel no Admin com KPI, serie diaria, por tipo e falhas recentes.
- [x] [P0] E2-003 Sinalizacao de estado do canal na UI (Inbox/Admin) para reduzir erro operacional.
  - entregue 2026-02-26: alerta explicito na Inbox quando WhatsApp nao conectado/configurado com CTA para `/admin`; banner lateral encurtado para evitar sobreposicao no layout.
  - entregue 2026-02-26: alerta dedicado no card de conexao do Admin e refinamento de rotulos (`desconectado`, `aguardando QR`, `QR pronto para leitura`).
- [ ] [P1] E2-004 Alertas para aumento de `FAILED` e backlog de fila.

### E3. Seguranca e compliance

- [-] [P0] E3-001 Revisar controle de acesso por tenant em todos os endpoints.
  - andamento: auditoria automatizada criada em `apps/api/src/scripts/tenant-isolation-audit.ts` (`npm run test:tenant:isolation`).
  - execucao 2026-02-26: 10/10 checks de isolamento passaram (usuarios, conversas, mensagens, update cruzado e acesso sem token).
  - reforco: gate de CI `tenant-isolation-audit` adicionada em `.github/workflows/ci.yml`.
- [ ] [P1] E3-002 Hardening de upload (MIME real, size, antivirus opcional).
- [ ] [P1] E3-003 Mascaramento de dados sensiveis em logs e debug.

## Entrega cliente (gate comercial)

- [x] [P0] G1-001 Zero regressao em envio/recebimento de texto.
  - entregue: auditoria `npm run test:gate:mvp` cobrindo outbound terminal, inbound webhook e dedupe de eco outbound.
- [x] [P0] G1-002 Midia essencial confiavel (imagem, documento e audio).
  - entregue: `test:gate:mvp` + `test:media:integration` sem `PENDING` infinito e com auditoria final por mensagem.
- [x] [P0] G1-004 Modo sandbox para homologacao segura.
  - entregue: bloqueio por allowlist no backend + conversa de teste no front (`/conversations/sandbox/test`).
  - observacao: requer `SANDBOX_ENABLED=true` para ativacao.
- [x] [P0] G1-005 Limites de plano (usuarios e numeros) ativos.
- [x] [P0] G1-006 Politica de retencao configuravel ativa.

## Itens de paridade post-MVP (nao bloqueantes para liberacao inicial)

- [ ] [P1] G2-001 Mencoes em grupo (receber e enviar).

## Sprint sugerida (ordem imediata)

- [x] [P0] Sprint 1 encerrada (carryover para Sprint 4: A1-002, A1-003, A2-010, A2-011, A2-007).
- [x] [P1] Sprint 2: C1-003, C2-001, C2-002, C2-003, D3-001, D3-002, D3-003.
- [x] [P1] Sprint 3: D1-003, C2-003, E1-002, E2-002, D2-003 (planejamento).
- [x] [P0/P1] Sprint 4: A1-002, A1-003, A2-007, A2-010, A2-011, E1-003, E2-001.
- [-] [P0/P1] Sprint 5 (atual): B1-001, B1-003, B2-001, B2-003, B2-004, B2-005, B2-006, B2-007, B2-008, B2-009, B2-010, B2-011, B3-002, B3-003.
- [ ] [P0] H0 (homologacao final): H0-001, H0-002, H0-003.

## Onda final de homologacao (apos backlog funcional)

- [ ] [P0] H0-001 Rodar matriz manual fim a fim em destino real (texto/audio/imagem/video/documento/grupo/mencoes/avatar/status).
- [ ] [P0] H0-002 Validar definitivamente A2-010 e A2-011 em homologacao real e anexar evidencias.
- [ ] [P1] H0-003 Rodar smoke com dois atendentes simultaneos e reconexao completa da sessao WhatsApp.

## Backlog post-MVP (nao bloquear liberacao inicial)

- [ ] [P2] C3-001, C3-002, C3-003, C3-004, C3-005 (contatos/CRM).

## Definicao de pronto (DoD)

- [ ] [P0] Fluxo validado em ambiente local com Docker.
- [ ] [P0] Sem regressao no envio de texto.
- [ ] [P1] Documentacao atualizada (`api-reference`, `architecture`, `frontend-ui` quando aplicavel).
- [ ] [P1] Checklist deste arquivo atualizado no mesmo PR/commit.

