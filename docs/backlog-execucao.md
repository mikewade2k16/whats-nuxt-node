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
- [x] [P1] A1-005 Implementar retries com backoff e limite por tipo de erro.
  - entregue: fila centralizada com backoff exponencial e teto global; worker aplica limite efetivo por categoria (`unrecoverable`, `rate_limit`, `provider`, `network`, `internal`) para evitar marcar `FAILED` antes da ultima tentativa util.

### A2. Midia (imagem, video, audio, documento)

- [x] [P0] A2-001 Envio de imagem/video/documento/audio sem bloquear input.
- [x] [P0] A2-002 Preview local robusto antes do envio (imagem/video/audio/doc).
- [x] [P0] A2-003 Recebimento de midia com fallback quando URL expirar.
- [x] [P1] A2-004 Download de midia inbound com decrypt quando necessario.
- [x] [P0] A2-005 Diferenciar envio "como documento" sem compressao.
- [x] [P0] A2-006 Player custom de audio no chat (onda, tempo, play/pause).
- [x] [P1] A2-007 Limites de upload por plano/tipo + mensagens de erro claras.
  - entregue 2026-02-26: backend valida limite por tenant (`maxUploadMb`) para `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT` e retorna erro estruturado (`UPLOAD_LIMIT_EXCEEDED`, `UPLOAD_MIME_INVALID`, `UPLOAD_SIZE_REQUIRED`).
  - entregue 2026-02-26: front interpreta `code/details` da API e exibe mensagem clara com tipo e tamanho limite.
  - entregue 2026-02-26: limite passou a ser configuravel no painel Admin por cliente (default `500MB`).
- [ ] [P1] A2-008 Telemetria de tempo de upload por tamanho e MIME.
  - observacao atual: pipeline de audio agora prioriza endpoint nativo para MIME/extensao de audio e cai para documento apenas como fallback; o item restante aqui fica restrito a telemetria/medicao, nao mais a correcao base do envio.
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
- [x] [P1] A3-003 Exibir acao de contorno (`Abrir no WhatsApp`) quando aplicavel.
  - entregue: mensagens `UNSUPPORTED` exibem CTA visivel para abrir no WhatsApp diretamente pelo painel.

## EPIC-B: Paridade de experiencia com WhatsApp Web

### B1. Conversa e composicao

- [x] [P0] B1-001 Reply visual no padrao WhatsApp Web (composer + balao).
  - entregue 2026-02-27: preview de reply no balao passou a exibir autor, tipo de midia quando aplicavel e snippet real do conteudo (sem cair sempre em "Mensagem").
  - entregue 2026-02-27: composer agora mostra bloco de resposta com autor real da mensagem respondida (incluindo grupos) e layout alinhado ao padrao visual do WhatsApp Web.
- [x] [P1] B1-002 Encaminhar mensagem no painel (agora com fluxo real via backend, criando novo outbound na conversa destino).
- [x] [P1] B1-003 Reacoes em mensagens.
  - escopo: picker de reacao no hover/long-press, persistencia por usuario, contador agregado e update realtime.
  - entregue 2026-02-26: UI com badges de reacao por mensagem, menu rapido de emojis no balao e endpoint `POST /conversations/:conversationId/messages/:messageId/reaction`.
  - entregue 2026-02-26: webhook passou a reconciliar `reactionMessage` (upsert/update) e emitir `message.updated` em tempo real.
  - validado 2026-02-27: reacoes homologadas no ambiente local.
- [ ] [P2] B1-004 Editar mensagem (quando conector suportar).
- [x] [P2] B1-005 Apagar para todos (fluxo real via provider, usando `EVOLUTION_DELETE_FOR_ALL_PATH`).
- [x] [P0] B1-006 Links clicaveis + card de preview no historico.
  - melhoria 2026-02-27: links no corpo da mensagem agora sao renderizados como ancora clicavel.
  - melhoria 2026-02-27: card de preview de link no chat (com fallback por dominio quando preview completo nao vier no payload).
  - melhoria 2026-02-27: envio outbound de texto habilita `linkPreview` automaticamente quando houver URL (ou quando metadata explicito permitir).

### B2. Emojis, stickers e mencoes

- [x] [P0] B2-001 Integrar picker completo de emojis no composer.
  - entregue 2026-02-26: painel no composer com abas `Emoji/GIF/Figurinhas`, busca, categorias e historico de recentes.
  - melhoria 2026-02-27: picker passou a carregar dataset amplo de emojis via lazy load, com categorias reais, busca por nome/keyword e sem inflar o bundle inicial do app.
- [x] [P0] B2-002 Renderizar corretamente emojis recebidos em todos os tipos de mensagem.
- [x] [P0] B2-003 Receber e renderizar figurinhas (estaticas/animadas).
  - entregue 2026-02-26: webhook classifica `stickerMessage` como midia inbound (`IMAGE`) com metadado `metadataJson.mediaKind=sticker`.
  - entregue 2026-02-26: chat renderiza figurinha com preview e estilo dedicado; lista de conversas usa placeholder `[figurinha]`.
  - validado 2026-02-27: renderizacao confirmada em uso do painel.
- [x] [P1] B2-004 Enviar figurinhas pelo painel.
  - entregue 2026-02-26: composer permite anexar figurinha (WEBP/PNG/JPG) via menu e aba de figurinhas; backend envia com endpoint dedicado `sendSticker` com fallback para `sendMedia`.
  - melhoria 2026-02-27: aba de figurinhas passou a salvar biblioteca reutilizavel no backend por tenant (`/stickers`), com selecao rapida e remocao de itens salvos.
  - validado 2026-02-27: envio confirmado em homologacao local.
- [x] [P1] B2-005 Resolver nome humano em mencoes recebidas em grupos.
  - entregue 2026-02-27: webhook passou a forcar `groupInfo` quando houver mencoes na mensagem, enriquecendo `metadataJson.mentions.displayByJid/displayByPhone` para render de nome humano no front.
  - entregue 2026-02-27: resolucao de aliases agora cobre `@lid` e JIDs relacionados do grupo, reduzindo casos onde a UI caia para numero bruto.
- [x] [P1] B2-006 Enviar mensagem com `@` mention (payload com `mentions[]`).
  - melhoria 2026-02-27: composer passou a montar `metadataJson.mentions` combinando mencoes detectadas no texto + mencoes explicitas selecionadas no picker.
  - melhoria 2026-02-27: outbound agora persiste `displayByJid/displayByPhone` quando o picker conhece o participante, preservando o nome humano no render posterior.
  - melhoria 2026-02-27: teste automatizado no composable (`apps/omni-nuxt-ui/tests/composables/useOmnichannelInbox.spec.ts`) valida envio de `mentioned[]` para grupo.
  - pendencia resolvida: suporte integral ao JID final via picker (`@lid` e `@s.whatsapp.net`).
- [x] [P0] B2-007 Exibir avatar real do participante em grupos (incluindo mensagem de audio).
  - melhoria 2026-02-26: front passou a resolver avatar por indice de `jid`/telefone/nome e fallback por historico de mensagens (cobrindo cenarios sem `participantJid` no payload atual).
  - melhoria 2026-02-26: inbox agenda refresh de participantes no realtime inbound de grupo (cooldown) para reduzir atrasos de foto apos novas mensagens.
  - consolidado 2026-02-27: o mesmo resolvedor passou a cobrir render do autor no chat e o player custom de audio, fechando o escopo tecnico do item; reteste manual final segue em `H0`.
- [x] [P1] B2-008 Mencao clicavel no chat (abrir conversa do contato mencionado com fallback para criar/abrir conversa por numero).
  - entregue 2026-02-26: mencao no corpo da mensagem virou link clicavel e aciona abertura/criacao da conversa 1:1 por JID/numero.
  - entregue 2026-02-27: renderer passou a reconhecer mencoes com nome completo e aliases `@lid`, inclusive quando o nome contem espacos.
  - entregue 2026-02-27: ao abrir conversa nova a inbox agora prioriza JID por telefone quando houver numero conhecido, reduzindo erros ao sair de `@lid`.
- [x] [P1] B2-009 Sinalizacao de mencao para atendente (badge/alerta diferenciado por conversa + indicador no historico).
  - entregue 2026-02-27: sidebar da inbox ganhou badge por conversa com contador acumulado (`@N Mencao`) para mensagens inbound de grupo com `metadataJson.mentions`.
  - entregue 2026-02-27: historico da conversa exibe indicador `Mencao` no meta da mensagem quando houver mencao inbound em grupo.
  - entregue 2026-02-27: alerta e limpo automaticamente ao abrir/ler a conversa.
  - observacao: alerta por identidade WhatsApp especifica do agente pode evoluir em etapa futura sem bloquear o escopo do item atual.
- [ ] [P1] B2-010 Suporte a GIF no painel (busca, preview e envio) com provider configuravel.
  - entregue parcial 2026-02-26: provider configuravel via env (`NUXT_GIF_PROVIDER`, `NUXT_TENOR_API_KEY`) com rotas server-side `/api/gif/search` e `/api/gif/media`.
  - entregue parcial 2026-02-26: aba GIF no composer com busca, preview e anexo para envio como midia.
  - melhoria 2026-02-27: quando `NUXT_TENOR_API_KEY` nao estiver definido, a API de GIF retorna aviso amigavel (sem erro 500) para a UI.
  - decisao 2026-03-02: item movido para Fase 2; nao bloqueia mais o encerramento do MVP/Sprint 5.
- [x] [P1] B2-011 Envio de contato (vCard) no composer + renderizacao no historico.
  - melhoria 2026-02-27: composer ganhou acao `Contato` no menu de anexo para envio rapido (nome + telefone).
  - melhoria 2026-02-27: chat agora renderiza card de contato via `metadataJson.contact` (inbound/outbound).
  - melhoria 2026-02-27: webhook passou a mapear `contactMessage/contactsArrayMessage` para `metadataJson.contact`.
  - melhoria 2026-02-27: envio outbound de contato agora exige endpoint nativo `EVOLUTION_SEND_CONTACT_PATH` e falha explicitamente quando indisponivel (sem fallback para texto).
  - melhoria 2026-02-27: validacao endpoint-a-endpoint no Admin (`POST /tenant/whatsapp/validate-endpoints`) para checar `sendText/sendMedia/sendWhatsAppAudio/sendContact/sendSticker/sendReaction`.
  - tarefa operacional 2026-02-27: no Admin, executar `Validar endpoints` antes de homologar envio de contato.
  - tarefa operacional 2026-02-27: se `sendContact` retornar `Rota ausente` ou `Erro autenticacao`, ajustar `EVOLUTION_SEND_CONTACT_PATH` e/ou API key (tenant/ambiente) e validar novamente.
  - criterio de aceite 2026-02-27: `sendContact` deve ficar `Disponivel` ou `Disponivel (validacao)`; envio de contato permanece nativo e consistente (sem fallback mascarado para texto).
  - consolidado 2026-02-27: escopo tecnico concluido; homologacao expandida em matriz de provedores/versoes alternativos foi movida para `H0`.
- [x] [P0] B2-012 Garantir nome correto de grupo/contato no card da conversa.
  - entregue 2026-02-27: backend bloqueia overwrite de nome do contato por nome de usuario interno em webhook direto (echo inconsistente do provedor).
  - entregue 2026-02-27: sidebar aplica fallback seguro (telefone/grupo) quando o nome recebido aparenta ser nome de operador.

### B3. Navegacao e leitura

- [x] [P0] B3-001 Scroll de historico com paginacao incremental.
- [x] [P0] B3-002 Marcador de nao lidas ao abrir conversa.
- [x] [P0] B3-003 Separador de data fixo durante scroll.
- [x] [P1] B3-004 Busca por conteudo em historico com destaque.

## EPIC-C: Multi-tenant comercial (planos, limites, retencao)

### C1. Planos e limites

- [x] [P0] C1-001 Modelar plano por tenant (`maxChannels`, `maxUsers`, `retentionDays`, `maxUploadMb`).
- [x] [P0] C1-002 Bloquear criacao de usuario/instancia acima do limite.
- [x] [P1] C1-003 Painel admin com consumo atual x limite contratado.
- [x] [P2] C1-004 Regras de upgrade/downgrade de plano.
  - entregue: `PATCH /tenant` bloqueia downgrade abaixo do uso atual de usuarios/canais e aceita upgrade sem intervencao manual.

### C2. Retencao e ciclo de dados

- [x] [P1] C2-001 Configurar retencao por tenant (ex: 15 dias).
- [x] [P1] C2-002 Job diario de expurgo por politica de retencao.
- [x] [P1] C2-003 Auditoria de eventos criticos (envio, falha, status, atribuicao).
  - entregue: tabela `AuditEvent` no Prisma + endpoint `GET /tenant/audit-events` (admin) para consulta com filtros.
  - cobertura atual: `MESSAGE_OUTBOUND_QUEUED`, `MESSAGE_OUTBOUND_SENT`, `MESSAGE_OUTBOUND_FAILED`, `CONVERSATION_STATUS_CHANGED`, `CONVERSATION_ASSIGNED`.

### C3. Contatos e CRM basico (postergado; fora do MVP atual)

- [x] [P2] C3-001 Criar entidade `Contact` por tenant (nome, telefone, avatar, origem, timestamps).
- [x] [P2] C3-002 Adicionar acao "Salvar contato" e botao "Novo contato" em conversa inbound de numero nao salvo.
- [x] [P2] C3-002A Padronizar cadastro de contato com Brasil como default (sem exigir `55`) e abrir DDI apenas para numero internacional.
- [x] [P2] C3-003 Vincular conversa a `contactId` apos salvar, sem perder historico atual, e permitir abrir conversa 1:1 a partir do contato salvo.
- [x] [P2] C3-004 Criar lista de contatos com busca, adicao manual e edicao basica.
  - entregue: o composer da inbox passou a listar contatos salvos para envio de card de contato, substituindo o fluxo manual por prompt.
  - entregue: cards de contato nas mensagens agora exibem acoes de `Conversar` e `Salvar contato`, inclusive em grupos.
  - melhoria 2026-03-03: `Salvar contato` a partir de card agora abre modal em Nuxt UI com validacao de duplicidade por telefone e opcao de abrir a conversa do contato ja existente.
- [ ] [P2] C3-005 Preparar conversao de contato para lead/cliente (base CRM).
- [x] [P2] C3-006 Importar contatos salvos no WhatsApp para `Contact` do tenant com dedupe por telefone/JID e opcao de revisao antes do merge.
  - entregue 2026-03-06: endpoint `POST /contacts/import-whatsapp` com modo `dryRun` para preview (acao `create/update/skip`) e aplicacao por lote.
  - entregue 2026-03-06: importacao vincula conversas diretas ao `contactId` e sincroniza `contactName/contactPhone/contactAvatarUrl`.
  - entregue 2026-03-06: inbox ganhou acao de `Importar WA` na aba de contatos, com preview antes de aplicar merge.

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

- [x] [P0] E1-001 Cobertura de testes dos composables principais.
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
- [x] [P1] E2-004 Alertas para aumento de `FAILED` e backlog de fila.

### E3. Seguranca e compliance

- [x] [P0] E3-001 Revisar controle de acesso por tenant em todos os endpoints.
  - andamento: auditoria automatizada criada em `apps/api/src/scripts/tenant-isolation-audit.ts` (`npm run test:tenant:isolation`).
  - execucao 2026-02-26: 10/10 checks de isolamento passaram (usuarios, conversas, mensagens, update cruzado e acesso sem token).
  - reforco: gate de CI `tenant-isolation-audit` adicionada em `.github/workflows/ci.yml`.
- [x] [P1] E3-002 Hardening de upload (MIME real, size, antivirus opcional).
- [x] [P1] E3-003 Mascaramento de dados sensiveis em logs e debug.

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
- [x] [P0/P1] Sprint 5 encerrada por escopo MVP: B1-001, B1-002, B1-003, B2-001, B2-002, B2-003, B2-004, B2-005, B2-006, B2-007, B2-008, B2-009, B2-011, B3-001, B3-002, B3-003, B3-004.
  - observacao: `B2-010` (GIF) foi movido para Fase 2 e nao bloqueia mais o encerramento do sprint.
- [ ] [P0] H0 (homologacao final): H0-001, H0-002, H0-003.

## Onda final de homologacao (apos backlog funcional)

- [ ] [P0] H0-001 Rodar matriz manual fim a fim em destino real (texto/audio/imagem/video/documento/grupo/mencoes/avatar/status).
- [ ] [P0] H0-002 Validar definitivamente A2-010 e A2-011 em homologacao real e anexar evidencias.
- [ ] [P1] H0-003 Rodar smoke com dois atendentes simultaneos e reconexao completa da sessao WhatsApp.

## Fase 2 (pos-MVP / nao bloquear liberacao inicial)

- Midia robusta: A2-008 e B2-010 (GIF com provider externo) seguem para a proxima fase.
- Navegacao de historico: base MVP foi consolidada neste ciclo; evolucoes incrementais futuras entram como melhoria continua, nao como bloqueio de liberacao.
- Testes/seguranca: homologacao real final segue centralizada em `H0-001/H0-002/H0-003`; reforcos incrementais entram em ciclos especificos apos a liberacao.
- CRM/contatos: C3-001, C3-002, C3-003, C3-004, C3-005.
- Chat interno/operacao: D2-001, D2-002, D2-003.
- Paridade extra futura: B1-004 e G2-001 permanecem fora do MVP inicial.
- Arquitetura de front (futuro): componentizacao total por dominio, componentes semanticos menores, composables reutilizaveis e eliminacao de logica duplicada. Etapa atual concluida: `InboxChatPanel` quebrado em `InboxChatHeader`, `InboxChatBody` e `InboxChatFooter`; nesta iteracao tambem foram extraidos os composables `useInboxChatPresentation`, `useInboxChatMessageContact`, `useInboxChatComposerDom`, `useInboxChatUtilities`, `useInboxChatReplyMeta`, `useInboxChatComposerControls`, `useInboxChatEmojiAssets`, `useInboxChatReactions`, `useInboxChatMessageIdentity`, `useInboxChatMentions`, `useInboxChatAudioRecorder`, `useInboxChatMessageHelpers` e `useInboxChatSelection`, alem dos subcomponentes `InboxMessageContactCard`, `InboxChatMessageRow`, `InboxMessageActionMenu`, `InboxChatSelectionToolbar` e `InboxForwardMessagesModal`. `InboxChatBody` agora ficou focado em lista/separadores, a mensagem individual foi isolada, e o `InboxChatFooter` foi subdividido em `InboxChatFooterStatus`, `InboxChatComposerAttachmentMenu`, `InboxChatComposerEmojiMenu`, `InboxChatComposerInput` e `InboxChatComposerActions`. O bloco de anexos/contato/link-preview do composer tambem saiu do pai; nesta rodada tambem sairam do painel as regras de mencao, a gravacao de audio e os helpers residuais de midia/render. A camada seguinte tambem foi quebrada por subdominio: `useInboxChatMentions` agora virou facade sobre `useInboxChatComposerMentions` e `useInboxChatMentionRouting`, enquanto `useInboxChatMessageHelpers` virou facade sobre `useInboxChatMessageRendering` e `useInboxChatMediaActions`. Agora `useInboxChatEmojiAssets` tambem virou facade sobre `useInboxChatEmojiCatalog`, `useInboxChatGifAssets` e `useInboxChatStickerAssets`, e o estado visual do picker saiu do pai para `useInboxChatEmojiPanel`. Nesta rodada, os composables macro tambem foram quebrados: `useOmnichannelInbox` passou a delegar para `useOmnichannelInboxShared`, `useOmnichannelInboxState`, `useOmnichannelInboxDerivedState`, `useOmnichannelInboxStateMutators`, `useOmnichannelInboxBootstrapLoaders`, `useOmnichannelInboxContactActions`, `useOmnichannelInboxConversationActions`, `useOmnichannelInboxPendingStatus`, `useOmnichannelInboxScroll`, `useOmnichannelInboxReadState`, `useOmnichannelInboxMentionAlerts`, `useOmnichannelInboxMessageReactions`, `useOmnichannelInboxHistory`, `useOmnichannelInboxOutboundPipeline`, `useOmnichannelInboxRealtime` e `useOmnichannelInboxMessageActions`; `useOmnichannelAdmin` passou a delegar para `useOmnichannelAdminShared`, `useOmnichannelAdminConnectionState`, `useOmnichannelAdminQrPolling`, `useOmnichannelAdminOperationalOps` e `useOmnichannelAdminTenantOps`. A referencia operacional detalhada desses arquivos agora fica em `docs/inbox.md`. Proximo corte: manter `InboxChatPanel` em orquestracao e continuar quebrando apenas os dominios que voltarem a crescer demais.
- Arquitetura de back (futuro): rotas finas, services/use-cases por responsabilidade unica, classes/arquivos menores e isolamento por funcionalidade.
- Plataforma modular (futuro): o modulo Omnichannel mantera apenas API/WebSocket/webhooks de atendimento; auth, clientes, usuarios e billing ficarao no core/plataforma principal (BFF de composicao + contratos entre modulos).
- Abstracao de provider WhatsApp (futuro): criar camada agnostica no front e no back para operacoes canonicas (contato, conversa, mensagem, midia, grupo), deixando implementacoes especificas por provider (`Evolution`, oficial Meta, futuros conectores) em adapters separados.

## Definicao de pronto (DoD)

- [ ] [P0] Fluxo validado em ambiente local com Docker.
- [ ] [P0] Sem regressao no envio de texto.
- [ ] [P1] Documentacao atualizada (`api-reference`, `architecture`, `frontend-ui` quando aplicavel).
- [ ] [P1] Checklist deste arquivo atualizado no mesmo PR/commit.
