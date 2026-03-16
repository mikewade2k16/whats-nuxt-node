# Inbox Module

## Objetivo

Este documento centraliza a arquitetura funcional da inbox omnichannel do front, com foco em:

- mapear onde cada componente/composable da inbox vive;
- explicar o papel de cada arquivo;
- registrar onde as principais funcoes estao hoje;
- reduzir risco de regressao durante novas extracoes do `InboxChatPanel.vue`.

## Regra de manutencao obrigatoria

Qualquer alteracao em arquivos da inbox listados neste documento deve ser refletida aqui no mesmo ciclo de entrega.

Regras:

- toda nova extracao de componente/composable deve ser adicionada neste arquivo;
- toda mudanca de responsabilidade entre arquivos deve ser registrada aqui;
- se a alteracao impactar comportamento funcional, tambem atualizar `docs/backlog-execucao.md` e/ou `docs/sprints-execucao.md`;
- este arquivo deve continuar sendo a referencia operacional para localizar rapidamente onde corrigir bugs e onde evoluir funcionalidades.
- antes de codar na inbox, ler este arquivo e os docs vinculados no `docs/README.md` para evitar regressao de contrato.
- nunca expor identificadores tecnicos no front (`@lid`, `@s.whatsapp.net`, `@g.us`, ids internos); quando nao houver nome humano, usar telefone.
- nunca misturar avatar de fontes diferentes: card de grupo usa somente avatar do grupo; card de conversa direta usa somente avatar do contato.

## Ponto de entrada do modulo

### `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelInboxModule.vue`

Responsabilidade:

- composicao da tela principal da inbox;
- integra estado global do modulo com sidebar, painel central e painel de detalhes;
- injeta props/handlers nos componentes filhos;
- concentra a orquestracao de layout entre conversas, contatos, chat e detalhes.

Uso:

- este e o ponto de montagem do modulo dentro das paginas (`index`/`admin`).
- alteracoes de contrato entre os paineis normalmente passam por este arquivo.

## Componentes da pasta `apps/omni-nuxt-ui/app/components/omnichannel/inbox`

### `InboxChatPanel.vue`

Responsabilidade atual:

- orquestrador do painel central do chat;
- integra os composables da inbox;
- monta `headerBindings`, `bodyBindings` e `footerBindings`;
- faz a ponte entre props do modulo e eventos emitidos para o pai.

Deve conter:

- apenas o minimo de estado/orquestracao;
- binds para subcomponentes;
- fluxo principal do painel.

Nao deve voltar a concentrar:

- markup pesado de mensagem;
- UI detalhada do composer;
- helpers puros;
- regras de apresentacao simples que possam morar em composables.

### `InboxChatHeader.vue`

Responsabilidade:

- cabecalho visual do chat;
- avatar, nome do contato, status/canal e acoes de topo;
- renderizacao do estado vazio quando nenhuma conversa estiver ativa.

### `InboxChatBody.vue`

Responsabilidade:

- container de scroll do historico;
- estados vazios/carregamento;
- separadores de data e divisor de nao lidas;
- iteracao da lista de `messageRenderItems`.

Observacao:

- a linha individual da mensagem foi removida deste arquivo e isolada em `InboxChatMessageRow.vue`.

### `InboxChatMessageRow.vue`

Responsabilidade:

- renderizacao completa de uma mensagem individual;
- avatar e autor;
- preview de resposta;
- fallback de conteudo nao suportado;
- blocos de midia (imagem, video, audio, documento);
- card de contato;
- link preview;
- corpo textual;
- reacoes e metadados da mensagem.

Observacao:

- este e hoje o principal componente visual da mensagem;
- futuras subdivisoes naturais: media, meta e bubble.

### `InboxMessageActionMenu.vue`

Responsabilidade:

- encapsula o bloco de acoes da mensagem;
- separa reacoes, reply e menu operacional de selecionar/encaminhar/apagar;
- evita reabrir markup operacional dentro de `InboxChatMessageRow.vue`.

### `InboxChatSelectionToolbar.vue`

Responsabilidade:

- toolbar de selecao multipla no corpo do chat;
- expoe acoes em lote (encaminhar, apagar para mim, apagar para todos, limpar);
- mostra status local das acoes de selecao.

### `InboxForwardMessagesModal.vue`

Responsabilidade:

- modal de escolha da conversa destino para encaminhamento;
- busca por nome/telefone/externalId;
- isola a UI de encaminhamento real para nao reengordar `InboxChatPanel.vue`.

### `InboxMessageContactCard.vue`

Responsabilidade:

- card visual de contato enviado/recebido;
- exibe avatar, nome e telefone;
- dispara acoes `Conversar` e `Salvar contato`;
- usa `contactId` no proprio card para trocar o estado local para `Atualizar contato` apos persistencia.

### `InboxSaveContactModal.vue`

Responsabilidade:

- modal de confirmacao em Nuxt UI para salvar/atualizar contato vindo de card de mensagem;
- valida duplicidade por telefone antes do envio;
- permite abrir a conversa do contato ja existente sem duplicar cadastro.

### `InboxAudioMessagePlayer.vue`

Responsabilidade:

- player visual de audio dentro do chat;
- exibe waveform simplificada/tempo;
- suporta avatar do autor quando aplicavel;
- cobre voice note (`AUDIO`) e tambem arquivo de audio enviado como `DOCUMENT` com MIME `audio/*`.

### `InboxChatFooter.vue`

Responsabilidade:

- composicao visual do rodape do chat;
- organiza status, menus, input e acoes do composer.

Observacao:

- nao deve concentrar regras pesadas de negocio;
- recebe estado/handlers do painel pai.

### `InboxChatFooterStatus.vue`

Responsabilidade:

- estados auxiliares do rodape;
- erro de envio;
- status de gravacao;
- sinais auxiliares do composer.

### `InboxChatComposerAttachmentMenu.vue`

Responsabilidade:

- menu de anexos do botao `+`;
- atalho visual para documento, foto/video, camera, audio, figurinha, contato e futuras entradas;
- regra atual: `Audio` do menu envia arquivo de audio como documento (para manter sem compressao), enquanto o microfone segue no fluxo de voice note;
- regra de render: mesmo em `DOCUMENT`, quando MIME for `audio/*` a inbox renderiza player inline + acoes de abrir/baixar.

### `InboxChatComposerEmojiMenu.vue`

Responsabilidade:

- painel visual de emoji/GIF/figurinhas;
- busca, tabs e listagem;
- nao decide negocio, so renderiza e dispara eventos.

### `InboxChatComposerInput.vue`

Responsabilidade:

- textarea do composer;
- area de digitacao, menções e barra de resposta;
- integra refs expostas para foco/controle de cursor.
- regra UX: Esc no composer cancela o reply ativo (quando houver), sem enviar mensagem.
- regra UX: clicar em Responder em outra mensagem substitui imediatamente o alvo atual do reply.

### `InboxChatComposerActions.vue`

Responsabilidade:

- acoes finais do composer;
- enviar, gravar audio, cancelar gravacao e toggles relacionados.

### `InboxConversationsSidebar.vue`

Responsabilidade:

- coluna esquerda;
- alterna entre lista de conversas e lista de contatos;
- busca, filtros, cards da sidebar e acao de novo contato;
- acao `Importar WA` com preview (`create/update/skip`) antes de aplicar merge de contatos.

### `InboxDetailsSidebar.vue`

Responsabilidade:

- coluna direita;
- dados do contato, canal/status, atribuicao, notas e acoes de detalhe;
- ponto natural para futuras configuracoes por conversa.

### `types.ts`

Responsabilidade:

- tipos locais de renderizacao da inbox;
- hoje usado principalmente para itens derivados de historico (`InboxRenderItem`) e contratos internos de UI.

## Composables da pasta `apps/omni-nuxt-ui/app/composables/omnichannel`

### `useInboxChatPresentation.ts`

Responsabilidade:

- helpers puros de apresentacao;
- iniciais, formatacao de horario e labels visuais de canal/status.

### `useInboxChatMessageContact.ts`

Responsabilidade:

- normalizacao de card de contato enviado/recebido;
- formata telefone para exibicao;
- monta payload de acoes ligadas ao card;
- aceita `metadataJson.contact`, `metadataJson.contacts[0]` e fallback pelo conteudo legado `Contato: Nome (telefone)`.

### `useInboxChatComposerDom.ts`

Responsabilidade:

- refs de DOM do composer;
- controle de foco;
- deteccao de clique fora de paineis (emoji/contato);
- exposicao de elementos reais para o painel pai.

### `useInboxChatComposerControls.ts`

Responsabilidade:

- estado funcional do composer ligado a anexos/contatos/link preview;
- `pickerMode`, `pickerAccept`, `pickerCapture`;
- abrir/fechar picker de contato;
- busca de contatos salvos;
- menu de anexos e envio de contato salvo.

### `useInboxChatEmojiAssets.ts`

Responsabilidade:

- facade fina de assets de emoji/GIF/figurinhas;
- agrega catalogo de emojis, busca de GIF e persistencia de figurinhas;
- preserva o contrato usado por `InboxChatPanel.vue`.

### `useInboxChatEmojiCatalog.ts`

Responsabilidade:

- catalogo de emojis;
- `recentes`;
- lazy load do dataset;
- categorias e indice de busca do picker.

### `useInboxChatGifAssets.ts`

Responsabilidade:

- busca de GIF;
- debounce/timer da busca;
- anexar GIF selecionado via BFF.

### `useInboxChatStickerAssets.ts`

Responsabilidade:

- figurinhas salvas;
- leitura/conversao `dataUrl` <-> `File`;
- salvar, listar, remover e anexar figurinha.

### `useInboxChatEmojiPanel.ts`

Responsabilidade:

- estado visual e interacoes do painel de emoji;
- tab ativa, busca, categoria e aberto/fechado;
- derivacao de categorias filtradas;
- toggle/close do painel;
- insercao de emoji no composer;
- listeners de clique externo do painel de emoji.

### `useInboxChatMentions.ts`

Responsabilidade:

- facade fina de mencoes;
- compoe os subdominios de mencao do composer e de navegacao/render do historico;
- preserva o contrato usado por `InboxChatPanel.vue`.

### `useInboxChatComposerMentions.ts`

Responsabilidade:

- estado de mencoes no composer;
- ancora de `@`, query, indice selecionado e lista de candidatos;
- navegacao por teclado do picker de mencoes;
- montagem de `mentionedJids` no envio;
- limpeza de estado de mencoes por rascunho/conversa.

### `useInboxChatMentionRouting.ts`

Responsabilidade:

- resolucao de display humano de mencoes vindas do historico;
- coleta de labels via `metadataJson`;
- resolucao de rota/alvo ao clicar numa mencao;
- tratamento do clique em links de mencao renderizados no corpo da mensagem.

### `useInboxChatAudioRecorder.ts`

Responsabilidade:

- gravacao de audio do composer;
- `MediaRecorder`, cronometro e waveform;
- controle de iniciar/parar/cancelar/enviar audio gravado;
- limpeza segura de recursos (`MediaStream`, `AudioContext`, timers);
- envia o anexo como modo interno `voice`, separado do fluxo de arquivo de audio selecionado pelo menu.

### `useInboxChatMessageHelpers.ts`

Responsabilidade:

- facade fina de renderizacao e midia;
- agrega os subdominios de render textual e acoes de midia;
- preserva o contrato usado por `InboxChatPanel.vue`.

### `useInboxChatMessageRendering.ts`

Responsabilidade:

- renderizacao residual de mensagem;
- reply preview, link preview, conteudo nao suportado e labels de tipo;
- render HTML de texto com links e mencoes;
- regras de preview textual e foco de jump no reply.

### `useInboxChatMediaActions.ts`

Responsabilidade:

- estado de falha de imagem;
- estado de loading de acoes de midia;
- abrir/baixar midia;
- nome de arquivo, fallback `.enc` e extensao por MIME.

### `useInboxChatUtilities.ts`

Responsabilidade:

- utilitarios puros compartilhados;
- escape HTML, regex, normalizacoes, links, tamanho de arquivo, parse auxiliar e helpers de menções.

### `useInboxChatReplyMeta.ts`

Responsabilidade:

- regras de exibicao do preview de resposta;
- texto, tipo de midia e icone do reply snippet.

### `useInboxChatMessageIdentity.ts`

Responsabilidade:

- identidade visual/logica da mensagem;
- resolucao de `participantJid`;
- match com participante de grupo;
- nome do autor;
- avatar do autor;
- label do operador outbound;
- `messageRowId`.

### `useInboxChatReactions.ts`

Responsabilidade:

- parse das reacoes em `metadataJson`;
- agregacao de badges por emoji;
- resolucao da reacao do usuario atual;
- montagem do menu de reacao rapida;
- toggle de reacao via callback para o pai;
- regra de consistencia: reacao do proprio numero WhatsApp usa `actorKey = wa:self` para evitar duplicidade entre origem painel e webhook.

### `useInboxChatSelection.ts`

Responsabilidade:

- estado local de selecao multipla do painel;
- controla selecao simples e em lote;
- abre/fecha o modal de encaminhamento;
- chama os callbacks reais de `apagar para mim`, `apagar para todos` e `encaminhar`;
- concentra apenas estado/UX do fluxo, sem falar direto com a API.

## Composables macro do modulo (estado/orquestracao)

### `useOmnichannelInbox.ts`

Responsabilidade:

- facade principal do estado da inbox;
- mantem a API publica consumida por `OmnichannelInboxModule.vue`;
- integra os composables de estado, derivados, loaders, scroll, contatos, conversa, historico, outbound e realtime.

Nao deve crescer novamente com:

- helpers puros;
- setters simples;
- loaders basicos;
- fluxos isolados de contatos/conversa/scroll.

### `useOmnichannelInboxShared.ts`

Responsabilidade:

- tipos compartilhados da inbox (`MessagesPageResponse`, `SendMessageOptions`, `OutboundAttachment` e correlatos);
- constantes canonicas (`UNASSIGNED_VALUE`, `MESSAGE_PAGE_SIZE`, `DEFAULT_MAX_UPLOAD_MB`);
- helpers puros compartilhados entre composables macro.

### `useOmnichannelInboxState.ts`

Responsabilidade:

- estado bruto do modulo;
- `refs` e objetos reativos centrais (conversas, contatos, mensagens, filtros, flags de loading e estados auxiliares).

### `useOmnichannelInboxDerivedState.ts`

Responsabilidade:

- computeds derivados do modulo;
- conversa ativa, filtros, unread markers, banner de conexao, anexos e `messageRenderItems`.
- observacao: `readStateStorageKey` foi externalizado do facade para evitar dependencia circular com o dominio de leitura.

### `useOmnichannelInboxStateMutators.ts`

Responsabilidade:

- setters simples e mutacoes de UI;
- rascunho, filtros, collapse, notes, troca de sidebar e reply target.

### `useOmnichannelInboxBootstrapLoaders.ts`

Responsabilidade:

- loaders basicos do bootstrap da inbox;
- tenant upload limit, status do WhatsApp, usuarios e contatos.

### `useOmnichannelInboxContactActions.ts`

Responsabilidade:

- salvar contato da conversa;
- criar contato manual e abrir conversa;
- salvar contato a partir de card de mensagem;
- abrir conversa 1:1 a partir de contato salvo;
- gerar preview da importacao de contatos do WhatsApp (`dryRun`);
- aplicar importacao por lote e recarregar contatos/conversas apos merge.
- sincronizar o `contactId` salvo de volta nas mensagens locais para refletir o novo estado do card sem recarregar a conversa.

### `useOmnichannelInboxConversationActions.ts`

Responsabilidade:

- status da conversa;
- atribuicao de responsavel;
- encerramento da conversa;
- abertura da conversa sandbox de teste.

### `useOmnichannelInboxPendingStatus.ts`

Responsabilidade:

- reconcile de mensagens outbound em `PENDING`;
- polling defensivo quando realtime/webhook atrasam.

### `useOmnichannelInboxScroll.ts`

Responsabilidade:

- sticky date;
- scroll para ultima/nao lida;
- carregamento incremental ao subir;
- selecao de conversa com posicionamento inicial do historico.

### `useOmnichannelInboxReadState.ts`

Responsabilidade:

- persistencia local do estado de leitura;
- bootstrap da ancora de leitura por conversa;
- marcacao de conversa como lida;
- sincronizacao com a limpeza de alerta de mencao.

### `useOmnichannelInboxMentionAlerts.ts`

Responsabilidade:

- contagem de alertas de mencao por conversa;
- limpeza incremental do alerta;
- regra de negocio para decidir se uma mensagem deve gerar badge de mencao.

### `useOmnichannelInboxMessageReactions.ts`

Responsabilidade:

- reconcile otimista de reacoes no estado da inbox;
- envio da reacao para a API;
- reload defensivo da conversa quando a sincronizacao falha.

### `useOmnichannelInboxHistory.ts`

Responsabilidade:

- carga da lista de conversas;
- carga inicial e incremental de mensagens;
- carga de participantes de grupo;
- hidratacao tardia de midia em payloads realtime sanitizados.
- sync de historico em background e refresh da pagina ativa quando houver processamento real (`processedCount > 0`), reduzindo abertura desatualizada.

### `useOmnichannelInboxOutboundPipeline.ts`

Responsabilidade:

- montagem de payload outbound;
- envio de texto, midia e contato;
- fallback BFF/fetch direto para anexos;
- reconcile otimista de mensagens outbound;
- metadata de reply outbound preserva `messageId` interno para jump local e `externalMessageId` para quote valido no WhatsApp;
- envio de contato com metadata canonica (`contact` + `contacts[]`) para manter compatibilidade entre UI e worker;
- voice note gravado segue como `AUDIO`;
- arquivo de audio escolhido pelo menu passa como `DOCUMENT`;
- no render, documento de audio (`audio/*`) tem playback inline e continua com baixar/abrir.

### `useOmnichannelInboxRealtime.ts`

Responsabilidade:

- conexao Socket.IO da inbox;
- conciliacao de `conversation.updated`, `message.created` e `message.updated`;
- polling do status do WhatsApp;
- sincronizacao de unread/mention/scroll no fluxo realtime.
- ao conectar/reconectar socket, forca refresh de conversas e da conversa ativa para reduzir abertura com historico defasado.
- quando socket entra em `disconnect/connect_error`, ativa fallback de refresh leve (polling controlado) ate reconectar, para evitar inbox "congelada" sem eventos.

### `useOmnichannelInboxMessageActions.ts`

Responsabilidade:

- fluxo real de `apagar para mim`;
- fluxo real de `apagar para todos`;
- fluxo real de `encaminhar` para outra conversa;
- sincroniza o resultado no estado local da inbox sem deixar essa logica no painel visual.

## Fluxo de responsabilidade atual

### Header

- UI: `InboxChatHeader.vue`
- helpers visuais: `useInboxChatPresentation.ts`
- orquestracao: `InboxChatPanel.vue`

### Body

- container/lista: `InboxChatBody.vue`
- linha de mensagem: `InboxChatMessageRow.vue`
- toolbar de selecao: `InboxChatSelectionToolbar.vue`
- modal de encaminhamento: `InboxForwardMessagesModal.vue`
- acoes da mensagem: `InboxMessageActionMenu.vue`
- card de contato: `InboxMessageContactCard.vue`
- modal de salvar contato: `InboxSaveContactModal.vue`
- player de audio: `InboxAudioMessagePlayer.vue`
- identidade de autor/avatar: `useInboxChatMessageIdentity.ts`
- reacoes: `useInboxChatReactions.ts`
- selecao multipla + UX das acoes: `useInboxChatSelection.ts`
- mencoes (facade): `useInboxChatMentions.ts`
- mencoes do composer: `useInboxChatComposerMentions.ts`
- mencoes no historico: `useInboxChatMentionRouting.ts`
- renderizacao/midia residual (facade): `useInboxChatMessageHelpers.ts`
- renderizacao textual/reply/link: `useInboxChatMessageRendering.ts`
- acoes de midia/download: `useInboxChatMediaActions.ts`
- reply meta: `useInboxChatReplyMeta.ts`
- helpers gerais: `useInboxChatUtilities.ts`

### Footer / Composer

- composicao visual: `InboxChatFooter.vue`
- status: `InboxChatFooterStatus.vue`
- anexos: `InboxChatComposerAttachmentMenu.vue`
- emoji/GIF/figurinhas: `InboxChatComposerEmojiMenu.vue`
- input: `InboxChatComposerInput.vue`
- acoes: `InboxChatComposerActions.vue`
- DOM/refs: `useInboxChatComposerDom.ts`
- controles funcionais: `useInboxChatComposerControls.ts`
- assets de emoji/GIF/figurinhas: `useInboxChatEmojiAssets.ts`
- catalogo de emoji: `useInboxChatEmojiCatalog.ts`
- GIFs: `useInboxChatGifAssets.ts`
- figurinhas: `useInboxChatStickerAssets.ts`
- estado visual do painel de emoji: `useInboxChatEmojiPanel.ts`
- gravacao de audio: `useInboxChatAudioRecorder.ts`
- mencoes no composer: `useInboxChatComposerMentions.ts` (via facade `useInboxChatMentions.ts`)

## Estado da refatoracao

Situacao atual:

- `InboxChatPanel.vue` ainda e o orquestrador principal, mas ja nao concentra o markup pesado de body/footer;
- `InboxChatPanel.vue` caiu para um papel de orquestracao muito menor e agora delega tambem mencoes, gravacao e helpers residuais para composables dedicados;
- `InboxChatBody.vue` ficou focado em scroll/separadores/lista;
- `InboxChatFooter.vue` virou composicao visual do composer;
- `useOmnichannelInbox.ts` deixou de concentrar helpers puros, setters basicos, loaders simples, scroll e acoes isoladas de contatos/conversa;
- `useOmnichannelInbox.ts` agora tambem delega o fluxo real de encaminhar/apagar para `useOmnichannelInboxMessageActions.ts`;
- `useOmnichannelAdmin.ts` tambem saiu do formato monolitico e hoje delega conexao/QR/operacao para composables especificos;
- `InboxChatPanel.vue` ainda possui logica residual relevante de:
  - coordenacao entre composables;
  - binds finais de `header/body/footer`;
  - controle do painel de emoji e integracao do composer.

Proximos cortes esperados:

- continuar quebrando `useOmnichannelInbox.ts` por dominio sempre que um bloco voltar a crescer demais (realtime, outbound e carga de historico sao os candidatos naturais);
- continuar quebrando `useOmnichannelAdmin.ts` quando um fluxo novo aumentar a parte operacional (novos providers, auditoria, dashboards);
- se `useInboxChatMessageHelpers.ts` ou `useInboxChatMentions.ts` crescerem demais, subdividir por responsabilidade (render/texto, media download, mention-routing);
- se `InboxChatMessageRow.vue` crescer demais, quebrar em subcomponentes por tipo de conteudo.

## Regra para futuras alteracoes

Ao editar qualquer arquivo listado aqui:

1. atualizar este `docs/inbox.md`;
2. registrar a extracao/mudanca de responsabilidade;
3. se houver impacto funcional, atualizar o backlog/roadmap correspondente;
4. evitar recolocar logica pesada de UI de volta no `InboxChatPanel.vue`.
