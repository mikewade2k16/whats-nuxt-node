# Frontend UI e Design System

## Objetivo

Padronizar a interface do MVP com Nuxt UI e classes semanticas, mantendo evolucao rapida sem perder organizacao.

## Atualizacao de caminho (2026-03-04)

1. Front principal consolidado em `apps/omni-nuxt-ui`.
2. O modulo Whats/omnichannel agora roda em `apps/omni-nuxt-ui/app/components/omnichannel`.
3. O front legado permanece em `apps/web` apenas como referencia ate desativacao completa.
4. Rotas do modulo no front principal:
- `/admin/login` (auth unico do painel)
- `/admin/omnichannel/inbox`
- `/admin/omnichannel/operacao`
- `/admin/omnichannel/docs`
5. Rotas legadas de login do atendimento (`/admin/omnichannel/login`, `/auth/*`) foram removidas fisicamente.
6. Para detalhes da fusao, consultar `docs/omni-nuxt-ui-merge.md`.

## Stack de UI

1. Nuxt 4
2. Nuxt UI (v4+)
3. Tailwind (via Nuxt UI)
4. Pinia (`@pinia/nuxt`) para estado de sessao
5. BFF Nuxt (`/api/bff/*`) para proxy HTTP ao backend
6. Tokens CSS customizados

## Testes de composable

1. Configuracao de testes:
- `apps/omni-nuxt-ui/vitest.config.ts`
- `apps/omni-nuxt-ui/tests/setup.ts`
2. Testes atuais:
- `apps/omni-nuxt-ui/tests/composables/useOmnichannelInbox.spec.ts`
- `apps/omni-nuxt-ui/tests/composables/useOmnichannelAdmin.spec.ts`
3. Scripts:
- `npm run test` (suite completa em modo run)
- `npm run test:watch` (modo observacao durante desenvolvimento)
- `npm run test:composables` (apenas testes dos composables)
4. Comportamento de execucao:
- `test` e `test:composables` rodam uma vez e encerram (ideal para CI).
- `test:watch` fica em modo continuo ate voce encerrar (ideal para desenvolvimento local).
5. Em Docker:
- `docker compose exec web npm run test:composables`
6. Pipeline CI:
- `docs/ci-github-actions.md`

Observacao:
- Componentes `UDashboardGroup`, `UDashboardPanel` e `UDashboardSidebar` exigem `@nuxt/ui` v4 ou superior.

## Arquivos chave

1. Entrada de estilos globais: `apps/omni-nuxt-ui/app/assets/css/main.css`
2. Tokens e estilos globais: `apps/omni-nuxt-ui/app/assets/css/tokens.css`
3. Configuracao global Nuxt UI: `apps/omni-nuxt-ui/nuxt.config.ts`
4. Orquestrador da Inbox: `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelInboxModule.vue`
5. Sidebar de conversas da Inbox: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxConversationsSidebar.vue`
6. Painel central de chat da Inbox: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxChatPanel.vue`
7. Sidebar de detalhes da Inbox: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxDetailsSidebar.vue`
8. Tipos compartilhados da Inbox: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/types.ts`
9. Composable da Inbox (estado/socket/paginacao): `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`
10. Modulo Admin canal WhatsApp: `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelAdminModule.vue`
11. Composable Admin (estado/polling/acoes): `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelAdmin.ts`
12. Wrappers de rota:
- `apps/omni-nuxt-ui/app/pages/admin/omnichannel/index.vue`
- `apps/omni-nuxt-ui/app/pages/admin/omnichannel/inbox.vue`
- `apps/omni-nuxt-ui/app/pages/admin/omnichannel/operacao.vue`
- `apps/omni-nuxt-ui/app/pages/admin/omnichannel/docs.vue`
13. Login do painel: `apps/omni-nuxt-ui/app/pages/admin/login.vue`
14. Store de autenticacao: `apps/omni-nuxt-ui/app/stores/auth.ts`
15. Composable de auth: `apps/omni-nuxt-ui/app/composables/useAuth.ts`
16. Guard global de painel: `apps/omni-nuxt-ui/app/middleware/admin-auth.global.ts`
17. Cliente HTTP do front: `apps/omni-nuxt-ui/app/composables/useApi.ts`
18. Proxy BFF: `apps/omni-nuxt-ui/server/api/bff/[...path].ts`
19. Portal de docs (API Nuxt server):
- `apps/omni-nuxt-ui/server/api/docs/index.get.ts`
- `apps/omni-nuxt-ui/server/api/docs/[slug].get.ts`
- `apps/omni-nuxt-ui/server/utils/project-docs.ts`
20. Composable do portal de docs:
- `apps/omni-nuxt-ui/app/composables/docs/useProjectDocs.ts`
21. Modulo visual do portal de docs:
- `apps/omni-nuxt-ui/app/components/docs/ProjectDocsModule.vue`

## Convencao de classes

1. Use classes semanticas por bloco de tela (`chat-page__*`, `conversation-card__*`, `admin-console__*`).
2. Evite classes utilitarias soltas no markup quando existir papel de layout/componente claro.
3. Estados visuais devem usar modificadores (`--active`, `--out`, `--head`).

## Regra de importacao de componentes

1. Todo componente usado no template deve ter import explicito no `<script setup>`.
2. Componentes do Nuxt UI devem ser importados de `#components`.
3. Nao depender de auto-import para componentes de tela/modulo (`pages` e `components/omnichannel`).

## Estado e seguranca no front

1. Estado de sessao (token/user/hydration) deve viver em Pinia: `apps/omni-nuxt-ui/app/stores/auth.ts`.
2. O composable `useAuth` e a unica API de acesso ao estado de sessao para componentes/paginas.
3. Chamadas HTTP do front devem passar por `useApi`.
4. `useApi` chama somente o BFF local (`/api/bff/*`) e nao chama backend externo diretamente.
5. O BFF encaminha para `NUXT_API_INTERNAL_BASE` e preserva cabecalho `Authorization`.
6. `NUXT_PUBLIC_API_BASE` fica reservado para WebSocket/realtime no browser.
7. `admin-auth.global` protege todo namespace `/admin/**` (exceto `/admin/login`).

## Componentes Nuxt UI usados

1. `UApp`
2. `UCard`
3. `UAlert`
4. `UButton`
5. `UFormField`
6. `UInput`
7. `UTextarea`
8. `USelect`
9. `UBadge`
10. `USeparator`
11. `UDashboardGroup`
12. `UDashboardSidebar`
13. `UDashboardPanel`
14. `UDashboardSidebarToggle`
15. `UDashboardSidebarCollapse`
16. `UAvatar`

## Regras de exibicao de conversa em grupo

1. Card da conversa deve mostrar nome do grupo (`contactName` da conversa).
2. Card da conversa pode exibir foto do grupo/contato (`contactAvatarUrl`).
3. No corpo do chat de grupo, cada mensagem deve exibir autor (`senderName`) e foto quando disponivel (`senderAvatarUrl`).
   - regra adicional 2026-02-26: quando `senderAvatarUrl` nao vier no payload da mensagem, a UI resolve avatar por indice de participantes (`jid`/telefone/nome) + historico local da conversa.
4. Mensagem enviada pelo atendente nao deve duplicar quando webhook retornar eco (`fromMe`).

## Regras de layout da inbox

1. Tela ocupa `100dvh` e nao deve crescer alem da viewport.
2. Quando o WhatsApp do tenant estiver desconectado/nao configurado, a Inbox deve exibir alerta operacional no topo orientando conexao via `/admin`.
   - O alerta lateral da sidebar deve permanecer curto para nao sobrepor header/paineis.
3. Areas com scroll interno obrigatorio:
- `chat-page__panel-body`
- `chat-page__chat-body`
- `chat-page__panel-body.chat-page__details-body`
4. Coluna esquerda e direita sao colapsaveis e redimensionaveis com `UDashboardSidebar` (min/default/max/collapsed).
5. Coluna central usa `UDashboardPanel` e cresce automaticamente quando sidebars colapsam.

## Portal de docs no front

1. Rota principal: `/docs`.
2. Objetivo: dar visibilidade para nao-dev sobre o que foi feito, em andamento e pendente.
3. O portal lista todos os `.md` do diretorio `docs/` e abre o conteudo.
4. O status de cada documento e calculado automaticamente por checklist:
- `[x]` concluido
- `[-]` ou `[~]` em andamento
- `[ ]` pendente
5. O portal tambem exibe BI de execucao:
- progresso geral
- progresso do backlog funcional
- progresso por prioridade (`P0`, `P1`, `P2`)
- progresso por sprint via `docs/sprints-execucao.md`
- nota de arquitetura via `docs/scorecard-arquitetura.md`
6. Requisito em Docker: montar `./docs` no container `web` e definir `PROJECT_DOCS_DIR=/project-docs`.

## Arquitetura modular da inbox

1. `OmnichannelInboxModule.vue` atua como container de composicao (wiring de componentes e binds).
2. `InboxConversationsSidebar.vue` renderiza filtros e lista de conversas.
3. `InboxChatPanel.vue` renderiza header de conversa, historico, marcador de nao lidas e composer.
4. `InboxDetailsSidebar.vue` renderiza contato, status, responsavel e notas internas.
5. `inbox/types.ts` concentra contratos de item de select e itens renderizados do historico.
6. `useOmnichannelInbox.ts` concentra estado, chamadas de API, socket, leitura/nao lidas, scroll e paginacao.
7. Toda comunicacao entre componentes filhos e orquestrador deve ocorrer via `props` e `emit` tipados.

## Arquitetura modular do admin

1. `OmnichannelAdminModule.vue` atua como container de composicao da tela admin.
2. `useOmnichannelAdmin.ts` concentra estado da tela, polling de QR, chamadas da API e regras de permissao.
3. Template deve consumir somente estado/metodos retornados pelo composable.
4. Perfis:
- `ADMIN`: leitura + escrita (tenant, usuarios, canal WhatsApp, dashboard de falhas).
- `SUPERVISOR`: leitura operacional (inclui dashboard de falhas) sem escrita administrativa.
- `AGENT` e `VIEWER`: redirecionados para inbox.
5. Fluxo de reconexao WhatsApp:
- se estado estiver `open`, o painel de QR mostra orientacao de sessao ativa e nao exibe QR.
- use a acao `Desconectar sessao` e depois `Conectar por QR` para gerar novo codigo.
6. Validacao endpoint-a-endpoint da Evolution:
- acao `Validar endpoints` no card administrativo para checar `sendText/sendMedia/sendWhatsAppAudio/sendContact/sendSticker/sendReaction`.
- resultado com status por rota (`Disponivel`, `Disponivel (validacao)`, `Rota ausente`, etc.) para diagnostico rapido de path/key/versionamento.

## Contratos dos componentes da inbox

1. `InboxConversationsSidebar.vue`
- Props: colapso, filtros, loading de lista, conversas filtradas, conversa ativa, ids nao lidos, itens de select.
- Emits: `update:collapsed`, `update:showFilters`, `update:search`, `update:channel`, `update:status`, `selectConversation`, `logout`.
2. `InboxChatPanel.vue`
- Props: conversa ativa, label da conversa, role do usuario, loading de mensagens, itens renderizados do historico, estado do composer e reply.
- Emits: `body-mounted`, `chat-scroll`, `send`, `send-contact`, `open-mention`, `close-conversation`, `set-reply`, `clear-reply`, `set-reaction`, `update:draft`, `pick-attachment`, `clear-attachment`.
3. `InboxDetailsSidebar.vue`
- Props: colapso, conversa ativa, label, itens de status/assignee, estado de loading/update, notas internas.
- Emits: `update:collapsed`, `update:internalNotes`, `update:assigneeModel`, `update-status`, `update-assignee`.

## Comportamento de chat implementado no modulo inbox

Arquivos:
1. `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelInboxModule.vue`
2. `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`
3. `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxChatPanel.vue`

1. Carregamento inicial traz sempre bloco mais recente de mensagens.
2. Scroll para cima carrega historico com paginacao (`beforeId`) sem perder posicao de scroll.
3. Conversa abre no ponto de nao lidas quando existir estado de leitura local.
4. Marcador `Nao lidas` aparece entre mensagens lidas e nao lidas.
5. Separadores de data por dia no historico.
6. Data fixa no topo durante scroll da conversa.
7. Destaque visual de mencoes (`@usuario`/`@numero`) no corpo da mensagem.
8. Reply no padrao WhatsApp Web:
- preview da mensagem respondida no composer
- bloco de citacao dentro do balão enviado/recebido via `metadataJson.reply`
- citacao clicavel no balao para navegar para a mensagem original quando `metadataJson.reply.messageId` existir
9. Composer com anexo local:
- botao `Arquivo` no painel de chat
- preview local de imagem/video/audio/documento antes de enviar
- envio de anexo como mensagem de midia para o backend
 - estrategia de envio: tenta `fetch` direto para API (com timeout), e faz fallback automatico para BFF em erro de rede/CORS
 - timeout do envio direto e dinamico por tamanho do arquivo (ate 300s)
 - limite de anexo no front vem de `GET /tenant -> maxUploadMb` (fallback `500MB`)
 - limite efetivo e validado no backend por tenant (`tenant.maxUploadMb`) com erro estruturado (`UPLOAD_*`)
 - reconciliacao de `PENDING` por polling curto quando realtime/socket atrasa
 - montagem de payload outbound separada por bloco/tipo (`TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT`, `AUDIO`) no composable
10. Barra de envio estilo WhatsApp:
- botao `+` com menu dropdown de anexos abrindo para cima
- botao de emoji com painel no composer (abas `Emoji/GIF/Figurinhas`)
- opcoes operacionais atuais: Documento (sem compressao), Fotos e videos, Camera, Audio
- aba `GIF` funcional com busca via provider configuravel (server-side) e anexo para envio
- aba `Figurinhas` permite selecionar arquivo local (WEBP/PNG/JPG) para envio como figurinha
- aba `Figurinhas` mantem biblioteca reutilizavel persistida no backend (`GET/POST/DELETE /stickers`) com acao de remover item salvo
- regra de tipagem: quando selecionado `Documento`, o front envia `type=DOCUMENT` mesmo para foto/video
- botao de microfone grava audio via `MediaRecorder` e anexa automaticamente como `AUDIO` ao parar
- acoes de midia no balao: Abrir e Baixar
 - durante gravacao de audio, o composer troca para barra de gravacao com waveform em tempo real (volume/onda)
 - mensagens de audio no chat usam player customizado com botao play/pause, waveform e tempo (sem controle nativo do browser)
 - avatar do player de audio usa `senderAvatarUrl` e fallback para `contactAvatarUrl` em conversa direta inbound
 - envio e upload de anexo nao bloqueiam o campo de digitacao; a mensagem entra no chat como `PENDING` enquanto envia
11. Fallback de conteudo nao suportado:
- backend identifica payloads nao suportados e persiste placeholder (`[conteudo nao suportado: ...]`) com `metadataJson.unsupported`
- chat renderiza helper visual com tipo detectado e acao `Abrir no WhatsApp`
12. Mencoes outbound em texto:
- front abre autocomplete ao digitar `@` em grupo usando `GET /conversations/:conversationId/group-participants`
- ao selecionar item, envia `metadataJson.mentions` com `mentionedJids` explicitos
- worker transforma metadado em `mentionsEveryOne` e `mentioned[]` no payload do `sendText` da Evolution
13. Mencoes inbound no chat:
- webhook persiste `metadataJson.mentions.mentioned` com JIDs mencionados quando `contextInfo.mentionedJid` estiver presente
- webhook tenta enriquecer `displayByJid` e `displayByPhone` para resolver nome humano no front
- chat renderiza `@nome` quando existir mapeamento; sem mapeamento mantem `@numero`
- mencoes no corpo da mensagem sao clicaveis; o clique tenta abrir conversa 1:1 existente e, sem match, cria conversa por numero/JID (somente perfis com escrita)
14. Figurinhas inbound:
- webhook trata `stickerMessage` como midia inbound (com metadado `mediaKind=sticker`)
- chat renderiza preview de figurinha com estilo proprio e placeholder textual `[figurinha]` para lista/card
15. Reacoes em mensagem:
- balao renderiza contador agregado por emoji com destaque para a reacao do usuario atual
- menu rapido de reacao no balao envia para `POST /conversations/:conversationId/messages/:messageId/reaction`
- click em badge existente alterna/remocao da reacao do operador atual
16. Links no chat:
- URLs no corpo da mensagem sao transformadas em links clicaveis
- mensagens com `metadataJson.linkPreview` exibem card de preview (titulo/descricao/thumb)
- fallback visual por dominio quando preview completo nao vier no payload
17. Envio de contato no composer:
- menu `+` passou a ter acao `Contato` (prompt de nome + telefone)
- envio outbound inclui `metadataJson.contact` e renderiza card no historico
- inbound com `metadataJson.contact` tambem renderiza card de contato no balao
18. Permissoes por papel na inbox:
- `ADMIN`, `SUPERVISOR` e `AGENT`: leitura + escrita.
- `VIEWER`: modo somente leitura (composer, status e atribuicao bloqueados no front e no backend).

## Fluxo de refactor sem perda de codigo

1. Criar componente novo sem apagar o bloco original.
2. Copiar somente uma secao por vez (esquerda, centro, direita).
3. Ligar o novo componente no orquestrador e validar build antes do proximo bloco.
4. Somente remover markup antigo depois que o novo bloco estiver funcional.
5. Registrar no documento:
- arquivo criado/alterado
- props e emits adicionados
- dependencias de componente Nuxt UI usadas
6. Sempre manter import explicito de todo componente utilizado no template.
7. Ao finalizar, rodar:
- `docker compose exec web npm run build`
- `docker compose restart web` (se necessario)

## Ajustes rapidos comuns

1. Trocar visual global:
- edite variaveis em `apps/omni-nuxt-ui/app/assets/css/tokens.css`
- edite overrides do Nuxt UI em `apps/omni-nuxt-ui/app.config.ts`

2. Alterar layout da inbox:
- estrutura e fluxo: `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelInboxModule.vue`
- coluna esquerda: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxConversationsSidebar.vue`
- coluna central: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxChatPanel.vue`
- coluna direita: `apps/omni-nuxt-ui/app/components/omnichannel/inbox/InboxDetailsSidebar.vue`

3. Alterar regras de estado/socket/paginacao da inbox:
- `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts`

4. Alterar fluxo de conexao WhatsApp no admin:
- edite `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelAdminModule.vue`
- regras/estado/polling em `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelAdmin.ts`

5. Alterar endpoint consumido no front:
- `apps/omni-nuxt-ui/app/composables/useApi.ts`
- proxy server em `apps/omni-nuxt-ui/server/api/bff/[...path].ts`
- backend interno em `NUXT_API_INTERNAL_BASE`
- realtime/browser em `NUXT_PUBLIC_API_BASE`

6. Alterar limite de upload por cliente (tenant):
- UI: `apps/omni-nuxt-ui/app/components/omnichannel/OmnichannelAdminModule.vue` (campo `Limite upload por arquivo (MB)`).
- estado/submit: `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelAdmin.ts` (`tenantForm.maxUploadMb`).
- consumo no composer da inbox: `apps/omni-nuxt-ui/app/composables/omnichannel/useOmnichannelInbox.ts` (`GET /tenant`, fallback `500MB`).

## Diretriz para modulo plugavel

Para plugar este front em outro projeto no futuro:

1. Isolar a inbox e admin em componentes de dominio dentro de `apps/omni-nuxt-ui/app/components/omnichannel/`.
2. Manter contratos HTTP no `useApi.ts` e tipos em `apps/omni-nuxt-ui/app/types/index.ts`.
3. Exportar configuracao por variaveis (`NUXT_PUBLIC_API_BASE`, `NUXT_API_INTERNAL_BASE`, tema via tokens).
4. Evitar dependencia de estado global fora de stores Pinia e composables de dominio.
