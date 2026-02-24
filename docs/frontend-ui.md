# Frontend UI e Design System

## Objetivo

Padronizar a interface do MVP com Nuxt UI e classes semanticas, mantendo evolucao rapida sem perder organizacao.

## Stack de UI

1. Nuxt 4
2. Nuxt UI (v4+)
3. Tailwind (via Nuxt UI)
4. Pinia (`@pinia/nuxt`) para estado de sessao
5. BFF Nuxt (`/api/bff/*`) para proxy HTTP ao backend
6. Tokens CSS customizados

## Testes de composable

1. Configuracao de testes:
- `apps/web/vitest.config.ts`
- `apps/web/tests/setup.ts`
2. Testes atuais:
- `apps/web/tests/composables/useOmnichannelInbox.spec.ts`
- `apps/web/tests/composables/useOmnichannelAdmin.spec.ts`
3. Scripts:
- `npm run test` (suite completa em modo run)
- `npm run test:watch` (modo observacao durante desenvolvimento)
- `npm run test:composables` (apenas testes dos composables)
4. Em Docker:
- `docker compose exec web npm run test:composables`

Observacao:
- Componentes `UDashboardGroup`, `UDashboardPanel` e `UDashboardSidebar` exigem `@nuxt/ui` v4 ou superior.

## Arquivos chave

1. Entrada de estilos globais: `apps/web/assets/css/main.css`
2. Tokens e estilos globais: `apps/web/assets/css/tokens.css`
3. Tema Nuxt UI global: `apps/web/app.config.ts`
4. Orquestrador da Inbox: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
5. Sidebar de conversas da Inbox: `apps/web/components/omnichannel/inbox/InboxConversationsSidebar.vue`
6. Painel central de chat da Inbox: `apps/web/components/omnichannel/inbox/InboxChatPanel.vue`
7. Sidebar de detalhes da Inbox: `apps/web/components/omnichannel/inbox/InboxDetailsSidebar.vue`
8. Tipos compartilhados da Inbox: `apps/web/components/omnichannel/inbox/types.ts`
9. Composable da Inbox (estado/socket/paginacao): `apps/web/composables/omnichannel/useOmnichannelInbox.ts`
10. Modulo Admin canal WhatsApp: `apps/web/components/omnichannel/OmnichannelAdminModule.vue`
11. Composable Admin (estado/polling/acoes): `apps/web/composables/omnichannel/useOmnichannelAdmin.ts`
12. Wrappers de rota:
- `apps/web/pages/index.vue`
- `apps/web/pages/admin.vue`
13. Login: `apps/web/pages/login.vue`
14. Store de autenticacao: `apps/web/stores/auth.ts`
15. Composable de auth: `apps/web/composables/useAuth.ts`
16. Cliente HTTP do front: `apps/web/composables/useApi.ts`
17. Proxy BFF: `apps/web/server/api/bff/[...path].ts`

## Convencao de classes

1. Use classes semanticas por bloco de tela (`chat-page__*`, `conversation-card__*`, `admin-console__*`).
2. Evite classes utilitarias soltas no markup quando existir papel de layout/componente claro.
3. Estados visuais devem usar modificadores (`--active`, `--out`, `--head`).

## Regra de importacao de componentes

1. Todo componente usado no template deve ter import explicito no `<script setup>`.
2. Componentes do Nuxt UI devem ser importados de `#components`.
3. Nao depender de auto-import para componentes de tela/modulo (`pages` e `components/omnichannel`).

## Estado e seguranca no front

1. Estado de sessao (token/user/hydration) deve viver em Pinia: `apps/web/stores/auth.ts`.
2. O composable `useAuth` e a unica API de acesso ao estado de sessao para componentes/paginas.
3. Chamadas HTTP do front devem passar por `useApi`.
4. `useApi` chama somente o BFF local (`/api/bff/*`) e nao chama backend externo diretamente.
5. O BFF encaminha para `NUXT_API_INTERNAL_BASE` e preserva cabecalho `Authorization`.
6. `NUXT_PUBLIC_API_BASE` fica reservado para WebSocket/realtime no browser.

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
4. Mensagem enviada pelo atendente nao deve duplicar quando webhook retornar eco (`fromMe`).

## Regras de layout da inbox

1. Tela ocupa `100dvh` e nao deve crescer alem da viewport.
2. Areas com scroll interno obrigatorio:
- `chat-page__panel-body`
- `chat-page__chat-body`
- `chat-page__panel-body.chat-page__details-body`
3. Coluna esquerda e direita sao colapsaveis e redimensionaveis com `UDashboardSidebar` (min/default/max/collapsed).
4. Coluna central usa `UDashboardPanel` e cresce automaticamente quando sidebars colapsam.

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

## Contratos dos componentes da inbox

1. `InboxConversationsSidebar.vue`
- Props: colapso, filtros, loading de lista, conversas filtradas, conversa ativa, ids nao lidos, itens de select.
- Emits: `update:collapsed`, `update:showFilters`, `update:search`, `update:channel`, `update:status`, `selectConversation`, `logout`.
2. `InboxChatPanel.vue`
- Props: conversa ativa, label da conversa, role do usuario, loading de mensagens, itens renderizados do historico, estado do composer e reply.
- Emits: `body-mounted`, `chat-scroll`, `send`, `close-conversation`, `set-reply`, `clear-reply`, `update:draft`.
3. `InboxDetailsSidebar.vue`
- Props: colapso, conversa ativa, label, itens de status/assignee, estado de loading/update, notas internas.
- Emits: `update:collapsed`, `update:internalNotes`, `update:assigneeModel`, `update-status`, `update-assignee`.

## Comportamento de chat implementado no modulo inbox

Arquivos:
1. `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
2. `apps/web/composables/omnichannel/useOmnichannelInbox.ts`
3. `apps/web/components/omnichannel/inbox/InboxChatPanel.vue`

1. Carregamento inicial traz sempre bloco mais recente de mensagens.
2. Scroll para cima carrega historico com paginacao (`beforeId`) sem perder posicao de scroll.
3. Conversa abre no ponto de nao lidas quando existir estado de leitura local.
4. Marcador `Nao lidas` aparece entre mensagens lidas e nao lidas.
5. Separadores de data por dia no historico.
6. Data fixa no topo durante scroll da conversa.
7. Destaque visual de mencoes (`@usuario`/`@numero`) no corpo da mensagem.

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
- edite variaveis em `apps/web/assets/css/tokens.css`
- edite overrides do Nuxt UI em `apps/web/app.config.ts`

2. Alterar layout da inbox:
- estrutura e fluxo: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
- coluna esquerda: `apps/web/components/omnichannel/inbox/InboxConversationsSidebar.vue`
- coluna central: `apps/web/components/omnichannel/inbox/InboxChatPanel.vue`
- coluna direita: `apps/web/components/omnichannel/inbox/InboxDetailsSidebar.vue`

3. Alterar regras de estado/socket/paginacao da inbox:
- `apps/web/composables/omnichannel/useOmnichannelInbox.ts`

4. Alterar fluxo de conexao WhatsApp no admin:
- edite `apps/web/components/omnichannel/OmnichannelAdminModule.vue`
- regras/estado/polling em `apps/web/composables/omnichannel/useOmnichannelAdmin.ts`

5. Alterar endpoint consumido no front:
- `apps/web/composables/useApi.ts`
- proxy server em `apps/web/server/api/bff/[...path].ts`
- backend interno em `NUXT_API_INTERNAL_BASE`
- realtime/browser em `NUXT_PUBLIC_API_BASE`

## Diretriz para modulo plugavel

Para plugar este front em outro projeto no futuro:

1. Isolar a inbox e admin em componentes de dominio dentro de `apps/web/components/omnichannel/`.
2. Manter contratos HTTP no `useApi.ts` e tipos em `apps/web/types/index.ts`.
3. Exportar configuracao por variaveis (`NUXT_PUBLIC_API_BASE`, `NUXT_API_INTERNAL_BASE`, tema via tokens).
4. Evitar dependencia de estado global fora de stores Pinia e composables de dominio.
