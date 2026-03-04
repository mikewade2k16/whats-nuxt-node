# Plano de Sprints (Execucao)

Objetivo: acompanhar metas por sprint com checklist rastreavel para facilitar previsao e priorizacao.

Legenda:

- [x] Concluido
- [-] Em andamento
- [ ] Nao iniciado

## Sprint 1 (P0) - Estabilidade de envio e midia base

- [x] [P0] Ativar endpoint de reprocessamento para falhas outbound.
- [x] [P0] Envio "como documento" (foto/video/audio como arquivo) estavel.
- [x] [P0] Implementar fallback para mensagem de tipo nao suportado.
- [x] [P0] Renderizar midia inbound em tempo real sem precisar recarregar.
- [x] [P0] Encerrar sprint com carryover tecnico consolidado no Sprint 4 (confiabilidade de release).

## Sprint 2 (P1) - Comercializacao inicial do produto

- [x] [P0] Criar modelagem de plano por tenant (`maxChannels`, `maxUsers`, `retentionDays`, `maxUploadMb`).
- [x] [P0] Aplicar bloqueio de limite por plano (usuarios e numeros).
- [x] [P1] Exibir consumo de plano no admin.
- [x] [P1] Configurar retencao por tenant.
- [x] [P1] Implementar job de expurgo por politica.
- [x] [P0] Habilitar modo sandbox (allowlist de homologacao) no backend.
  - entregue: validacao de allowlist em outbound/reprocessamento + endpoint `GET /conversations/sandbox/test`.
  - observacao: para uso efetivo em homologacao, ativar `SANDBOX_ENABLED=true` no ambiente.
- [x] [P0] Disponibilizar conversa de teste de sandbox no front (`/conversations/sandbox/test`).

## Sprint 3 (P1/P2) - Operacao e governanca

- [x] [P0] Persistir `senderUserId` em outbound.
- [x] [P0] Exibir no historico interno qual atendente enviou cada mensagem outbound.
- [x] [P1] Implementar permissoes por papel (admin/supervisor/atendente/viewer).
  - entregue: novos papeis `SUPERVISOR` e `VIEWER`, guards de rota por papel e inbox em modo somente leitura para `VIEWER`.
- [x] [P1] Criar trilha de auditoria de eventos criticos.
  - entregue: persistencia em `AuditEvent` + consulta admin em `/tenant/audit-events`.
  - eventos cobertos: envio enfileirado, envio concluido, falha de envio, mudanca de status e atribuicao.
- [x] [P1] Subir testes de integracao para fluxo de midia.
  - entregue: `npm run test:media:integration` + gate `media-integration-audit` no GitHub Actions.
- [x] [P1] Criar dashboard de falhas por tenant/tipo de mensagem.
  - entregue: endpoint `GET /tenant/metrics/failures` + card no Admin (`OmnichannelAdminModule`).
- [x] [P2] Planejar chat interno e suporte tenant -> admin.
  - entregue: `docs/planejamento-chat-interno-suporte.md`.
- [x] [P0] Subir pipeline CI minima (API build + Web tests/build) no GitHub Actions.
- [x] [P0] Revisar isolamento por tenant nas rotas protegidas.
  - entregue: script `npm run test:tenant:isolation` com 10 checks de acesso cruzado.
  - resultado 2026-02-26: 10/10 checks aprovados.
  - reforco: check automatizado no GitHub Actions (`tenant-isolation-audit`).

## Sprint 4 (P0/P1) - Confiabilidade de release cliente (concluida por escopo tecnico)

- [x] [P0] Tornar estado de conexao do canal explicito na UI (Admin + Inbox).
  - entregue 2026-02-26: Inbox ganhou alerta superior com CTA para Admin quando o WhatsApp nao esta conectado/configurado; banner lateral encurtado para evitar sobreposicao visual.
  - entregue 2026-02-26: Admin ganhou alerta dedicado dentro do card "Conexao WhatsApp" e labels mais claros para estados desconectado/aguardando QR/QR pronto.
- [x] [P0] Concluir A1-002 para eliminar `PENDING` infinito em texto/midia.
  - entregue 2026-02-26: fallback de enfileiramento (`outboundQueue.add`) nas rotas de envio/reprocessamento; em falha de fila a mensagem e marcada como `FAILED` imediatamente (sem ficar `PENDING`), com evento realtime e auditoria.
- [x] [P0] Concluir A1-003 para deduplicacao de eco (texto e midia).
  - entregue 2026-02-26: dedupe de eco outbound em webhook reforcado para midia (fingerprint por `mediaFileName`, `mediaFileSizeBytes`, `mediaMimeType`, `mediaCaption` e fallback de `content` quando aplicavel), com janela adaptativa para reduzir falso positivo.
- [x] [P0] Concluir A2-010 (base tecnica + automacao).
  - base pronta: runner `test:media:battery` e proxy de midia validado em 2026-02-26.
  - reteste 2026-02-26: `test:media:battery` e `test:media:integration` executados novamente com sucesso tecnico (finalizacao terminal sem `PENDING` e auditoria presente).
  - observacao: homologacao manual em destino real foi movida para a onda final `H0-001`.
- [x] [P0] Concluir A2-011 (base tecnica + regressao automatizada).
  - base pronta: reidratacao automatica via Evolution para legado `.enc`.
  - status 2026-02-26: sem regressao automatica detectada.
  - observacao: validacao manual final em grupo real foi movida para `H0-001`.
- [x] [P0] Concluir A2-007 para limite operacional por anexo com erro claro no front.
  - entregue: limite por tenant (`maxUploadMb`, default `500MB`) na API + retorno estruturado de erro + parse amigavel no front.
  - entregue: campo editavel no Admin para ajustar limite por cliente sem alterar codigo.
- [x] [P1] Concluir E1-003 (teste E2E da jornada principal).
  - entregue: `npm run test:journey:e2e` com checks de login, inbox, envio e recebimento.
- [x] [P1] Concluir E2-001 (correlation id ponta a ponta: API -> queue -> worker -> webhook).
  - entregue: `x-correlation-id` opcional, persistido por mensagem e propagado em fila/worker/auditoria/webhook/realtime.

## Sprint 5 (P0/P1) - Paridade avancada WhatsApp (encerrada por escopo MVP)

- [x] [P0] Melhorar reply visual para padrao WhatsApp Web.
  - entregue 2026-02-26: citacao agora mostra tipo com icone, e permite clicar para navegar para a mensagem original (com destaque visual temporario).
  - melhoria 2026-02-27: reply no balao agora renderiza snippet real do conteudo e o composer mostra o autor real da mensagem respondida, inclusive em grupos.
- [x] [P0] Exibir avatar real de participante em grupos (incluindo audio) em todos os cenarios.
  - entregue parcial 2026-02-26: resolucao de avatar no chat reforcada com lookup por `jid`, telefone e nome (inclui fallback por historico da conversa e metadado legado).
  - entregue parcial 2026-02-26: refresh automatico de participantes de grupo no realtime inbound (com cooldown) para reduzir casos sem foto em mensagens recem-chegadas.
  - consolidado 2026-02-27: o mesmo resolvedor de avatar passou a cobrir o player de audio e o cabecalho de autor no chat; reteste manual final foi movido para `H0`.
- [x] [P0] Integrar emojis completos no composer.
  - entregue 2026-02-26: painel no composer com abas `Emoji/GIF/Figurinhas`, busca de emoji, categorias e historico de recentes.
  - melhoria 2026-02-27: picker passou a carregar dataset amplo de emojis sob demanda (lazy load), com categorias reais e busca mais completa sem penalizar o bundle inicial.
- [x] [P0] Links clicaveis e card de preview no chat.
  - entregue 2026-02-27: mensagens com URL passaram a renderizar link clicavel no corpo.
  - entregue 2026-02-27: card de preview de link no chat com metadados do webhook (`metadataJson.linkPreview`) e fallback por dominio.
  - entregue 2026-02-27: outbound texto agora envia `linkPreview=true` automaticamente quando houver URL (respeitando flag em metadata).
- [x] [P0] Receber/renderizar figurinhas.
  - entregue 2026-02-26: webhook passou a tratar `stickerMessage` como midia inbound, com placeholder `[figurinha]` e metadado `metadataJson.mediaKind=sticker`.
  - entregue 2026-02-26: chat renderiza preview de figurinha com estilo dedicado e card/lista exibem `[figurinha]`.
  - validado 2026-02-27: fluxo operacional confirmado em testes de uso no painel.
- [x] [P1] Implementar reacoes em mensagens (render + envio + sincronizacao realtime).
  - entregue 2026-02-26: badges de reacao por mensagem + menu rapido no balao.
  - entregue 2026-02-26: endpoint de reacao no backend e reconcile realtime via webhook para `reactionMessage`.
  - validado 2026-02-27: envio de reacao homologado em ambiente local.
- [x] [P0] Garantir card de conversa sempre com nome correto de grupo/contato.
  - entregue 2026-02-27: backend passou a bloquear overwrite do nome do contato por nome de usuario interno (echo inconsistente do provedor) em conversas diretas.
  - entregue 2026-02-27: card da sidebar ganhou heuristica de protecao para nao exibir nome de operador como nome do contato, com fallback seguro para telefone.
- [x] [P1] Resolver mencoes recebidas com nome humano.
  - entregue 2026-02-27: enriquecimento de mencoes no webhook agora forca leitura de `groupInfo` quando `mentions` estiver presente, melhorando render de `@nome` na inbox.
  - entregue 2026-02-27: aliases de mencao agora cobrem `@lid` e JIDs relacionados do grupo, reduzindo fallback para numero bruto.
- [x] [P1] Enviar mencoes `@` com `mentions[]`.
  - melhoria 2026-02-27: composer de grupo envia `metadataJson.mentions` com merge de mencoes por texto + mencoes explicitas selecionadas no picker.
  - melhoria 2026-02-27: outbound passou a salvar `displayByJid/displayByPhone` quando o picker conhece o participante, preservando render de nome humano.
  - melhoria 2026-02-27: cobertura automatizada adicionada em `apps/web/tests/composables/useOmnichannelInbox.spec.ts` para validar payload outbound de mencao.
  - pendencia resolvida: homologacao local finalizada suportando JIDs finais `@lid`.
- [x] [P1] Tornar mencoes clicaveis com acao de abrir conversa do contato mencionado.
  - entregue 2026-02-26: clique em mencao no chat tenta abrir conversa WhatsApp existente; se nao existir, cria conversa 1:1 por numero/JID (perfis com escrita).
  - entregue 2026-02-27: renderer passou a reconhecer mencoes com nome completo e aliases `@lid`, inclusive quando o nome contem espacos.
  - entregue 2026-02-27: ao criar conversa a partir da mencao, a inbox prioriza JID por telefone quando o numero estiver disponivel.
- [x] [P1] Implementar sinalizacao/notificacao diferenciada para mensagens com mencao ao atendente.
  - entregue 2026-02-27: inbox passou a sinalizar conversa com badge de mencao por conversa e contador acumulado (`@N Mencao`) quando chega mensagem inbound de grupo com `metadataJson.mentions`.
  - entregue 2026-02-27: historico do chat ganhou indicador visual `Mencao` no meta da mensagem quando o inbound de grupo contem mencao.
  - entregue 2026-02-27: alerta de mencao e limpo ao marcar conversa como lida.
  - observacao: match por identidade WhatsApp do agente pode evoluir em etapa futura sem bloquear o escopo atual.
- [x] [P1] Enviar figurinhas pelo painel.
  - entregue 2026-02-26: envio de figurinha via composer (menu + aba dedicada), com `sendSticker` no worker e fallback seguro para `sendMedia`.
  - melhoria 2026-02-27: aba de figurinhas salva itens no backend por tenant para reuso rapido (biblioteca compartilhada com remover/selecionar).
  - validado 2026-02-27: fluxo de envio/selecionar/remover figurinhas confirmado no painel.
- [x] [P1] Decisao de escopo: GIF (`B2-010`) movido para Fase 2.
  - entregue parcial 2026-02-26: provider Tenor via rotas server-side (`/api/gif/search`, `/api/gif/media`) e aba GIF funcional no composer.
  - melhoria 2026-02-27: fallback amigavel sem 500 quando `NUXT_TENOR_API_KEY` nao estiver configurado.
  - decisao 2026-03-02: item retirado do escopo do MVP atual; volta como backlog da Fase 2 apos homologacao H0.
- [x] [P1] Enviar contato (vCard) pelo composer.
  - entregue parcial 2026-02-27: menu de anexo recebeu acao `Contato` (nome/telefone) com envio imediato.
  - entregue parcial 2026-02-27: chat renderiza card de contato com nome/telefone para mensagens com `metadataJson.contact`.
  - entregue parcial 2026-02-27: webhook trata `contactMessage/contactsArrayMessage` e persiste metadata de contato em inbound.
  - melhoria 2026-02-27: worker passou a exigir endpoint nativo `EVOLUTION_SEND_CONTACT_PATH` (sem fallback para texto).
  - melhoria 2026-02-27: admin ganhou validacao endpoint-a-endpoint (`POST /tenant/whatsapp/validate-endpoints`) para detectar rotas ausentes/invalidas antes de homologar.
  - consolidado 2026-02-27: escopo tecnico concluido; homologacao manual expandida em provedores/versoes alternativos foi movida para `H0`.

## H0 - Homologacao geral final (apos concluir todas as funcionalidades)

- [ ] [P0] H0-001 Rodar matriz de homologacao manual fim a fim (texto, audio, imagem, video, documento, grupo, mencoes, avatar, status).
- [ ] [P0] H0-002 Validar comportamento em destino real para A2-010/A2-011 e anexar evidencias (prints/logs).
- [ ] [P1] H0-003 Executar smoke de release com dois atendentes simultaneos + reconexao de sessao WhatsApp.

## Gate de liberacao cliente (MVP P0)

- [x] [P0] Texto inbound/outbound estavel sem regressao.
  - entregue: auditoria automatizada `npm run test:gate:mvp` cobrindo outbound terminal, inbound via webhook e dedupe de eco outbound.
- [x] [P0] Midia essencial estavel (imagem, documento, audio).
  - entregue: `test:gate:mvp` + `test:media:integration` validando status terminal sem `PENDING` infinito e trilha de auditoria final.
- [x] [P0] Fallback para conteudo nao suportado ativo.
- [x] [P0] Sandbox de homologacao ativo.
  - entregue: atalho de UI ("Teste") na inbox para abrir conversa dedicada via `/conversations/sandbox/test`.
  - observacao: comportamento depende de `SANDBOX_ENABLED=true`.
- [x] [P0] Limites de plano basicos ativos.

## Backlog post-MVP (paridade extra + CRM)

- [ ] [P1] Mencoes de grupo funcionais (receber + enviar) (postergado para etapa final).

- [x] [P2] Criar acao "Salvar contato" e "Novo contato" para numero nao salvo na conversa.
- [x] [P2] Persistir `contactId` na conversa apos salvar contato e permitir abrir conversa 1:1 pelo contato salvo.
- [x] [P2] Implementar lista de contatos (CRM basico) por tenant, com busca e adicao manual.

## Fase 2 (pos-MVP, apos H0)

- Midia robusta: priorizar `A2-008` e retomar `B2-010` (GIF) apenas quando o ambiente tiver provider configurado.
- Navegacao de historico: base MVP foi encerrada; novas evolucoes entram como melhoria incremental, nao como bloqueio comercial.
- Testes e seguranca: manter a onda `H0` como gate final e abrir novos ciclos de reforco somente apos a liberacao inicial.
- CRM e contatos: base `C3-001` a `C3-004` entregue; manter `C3-005` como evolucao de CRM da Fase 2.
- Chat interno e operacao: consolidar `D2-001` a `D2-003` como segunda frente da Fase 2.
- Paridade extra futura: `B1-004`, enquetes/eventos, calls/links e status/canais permanecem fora do escopo inicial.
- Front futuro: componentizacao total por dominio, componentes menores, composables reaproveitaveis e corte de duplicacao. Etapa atual: `InboxChatPanel` ja separado em `Header/Body/Footer`, com extracao adicional de `useInboxChatPresentation`, `useInboxChatMessageContact`, `useInboxChatComposerDom`, `useInboxChatUtilities`, `useInboxChatReplyMeta`, `useInboxChatComposerControls`, `useInboxChatEmojiAssets`, `useInboxChatReactions`, `useInboxChatMessageIdentity`, `useInboxChatMentions`, `useInboxChatAudioRecorder`, `useInboxChatMessageHelpers`, `useInboxChatSelection`, `InboxMessageContactCard`, `InboxChatMessageRow`, `InboxMessageActionMenu`, `InboxChatSelectionToolbar` e `InboxForwardMessagesModal`; o `InboxChatBody` ficou focado em lista/separadores e o `InboxChatFooter` foi quebrado em `InboxChatFooterStatus`, `InboxChatComposerAttachmentMenu`, `InboxChatComposerEmojiMenu`, `InboxChatComposerInput` e `InboxChatComposerActions`. O bloco de anexos/contato/link-preview do composer ja saiu do pai; nesta rodada, mencoes, gravacao de audio e helpers residuais de midia/render tambem sairam do `InboxChatPanel`. Na camada seguinte, os composables grandes tambem foram quebrados: `useInboxChatMentions` agora orquestra `useInboxChatComposerMentions` + `useInboxChatMentionRouting`, `useInboxChatMessageHelpers` agora orquestra `useInboxChatMessageRendering` + `useInboxChatMediaActions`, `useInboxChatEmojiAssets` agora orquestra `useInboxChatEmojiCatalog` + `useInboxChatGifAssets` + `useInboxChatStickerAssets`, e o estado visual do picker foi isolado em `useInboxChatEmojiPanel`. Nesta rodada, os composables macro do modulo tambem foram reduzidos: `useOmnichannelInbox` passou a delegar para `useOmnichannelInboxShared`, `useOmnichannelInboxState`, `useOmnichannelInboxDerivedState`, `useOmnichannelInboxStateMutators`, `useOmnichannelInboxBootstrapLoaders`, `useOmnichannelInboxContactActions`, `useOmnichannelInboxConversationActions`, `useOmnichannelInboxPendingStatus`, `useOmnichannelInboxScroll`, `useOmnichannelInboxReadState`, `useOmnichannelInboxMentionAlerts`, `useOmnichannelInboxMessageReactions`, `useOmnichannelInboxHistory`, `useOmnichannelInboxOutboundPipeline`, `useOmnichannelInboxRealtime` e `useOmnichannelInboxMessageActions`, enquanto `useOmnichannelAdmin` passou a delegar para `useOmnichannelAdminShared`, `useOmnichannelAdminConnectionState`, `useOmnichannelAdminQrPolling`, `useOmnichannelAdminOperationalOps` e `useOmnichannelAdminTenantOps`. O mapa operacional da inbox agora fica documentado em `docs/inbox.md`. Proxima iteracao continua reduzindo apenas os dominios que voltarem a crescer demais, sem retransformar as facades em monolitos.
- Back futuro: refinar services/use-cases por responsabilidade unica, reduzir tamanho de arquivos e separar cada fluxo por funcionalidade.
- Integracao futura: introduzir camada agnostica de provider para desacoplar o dominio do painel da API especifica (`Evolution`, oficial Meta e futuros conectores).
