# Frontend UI e Design System

## Objetivo

Padronizar a interface do MVP com Nuxt UI e classes semanticas, mantendo evolucao rapida sem perder organizacao.

## Stack de UI

1. Nuxt 4
2. Nuxt UI (v4+)
3. Tailwind (via Nuxt UI)
4. Tokens CSS customizados

Observacao:
- Componentes `UDashboardGroup`, `UDashboardPanel` e `UDashboardSidebar` exigem `@nuxt/ui` v4 ou superior.

## Arquivos chave

1. Entrada de estilos globais: `apps/web/assets/css/main.css`
2. Tokens e estilos globais: `apps/web/assets/css/tokens.css`
3. Tema Nuxt UI global: `apps/web/app.config.ts`
4. Modulo Inbox: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`
5. Modulo Admin canal WhatsApp: `apps/web/components/omnichannel/OmnichannelAdminModule.vue`
6. Wrappers de rota:
- `apps/web/pages/index.vue`
- `apps/web/pages/admin.vue`
7. Login: `apps/web/pages/login.vue`

## Convencao de classes

1. Use classes semanticas por bloco de tela (`chat-page__*`, `conversation-card__*`, `admin-console__*`).
2. Evite classes utilitarias soltas no markup quando existir papel de layout/componente claro.
3. Estados visuais devem usar modificadores (`--active`, `--out`, `--head`).

## Regra de importacao de componentes

1. Todo componente usado no template deve ter import explicito no `<script setup>`.
2. Componentes do Nuxt UI devem ser importados de `#components`.
3. Nao depender de auto-import para componentes de tela/modulo (`pages` e `components/omnichannel`).

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

## Comportamento de chat implementado no modulo inbox

Arquivo: `apps/web/components/omnichannel/OmnichannelInboxModule.vue`

1. Carregamento inicial traz sempre bloco mais recente de mensagens.
2. Scroll para cima carrega historico com paginacao (`beforeId`) sem perder posicao de scroll.
3. Conversa abre no ponto de nao lidas quando existir estado de leitura local.
4. Marcador `Nao lidas` aparece entre mensagens lidas e nao lidas.
5. Separadores de data por dia no historico.
6. Data fixa no topo durante scroll da conversa.
7. Destaque visual de mencoes (`@usuario`/`@numero`) no corpo da mensagem.

## Ajustes rapidos comuns

1. Trocar visual global:
- edite variaveis em `apps/web/assets/css/tokens.css`
- edite overrides do Nuxt UI em `apps/web/app.config.ts`

2. Alterar layout da inbox:
- edite blocos `chat-page__*` em `apps/web/components/omnichannel/OmnichannelInboxModule.vue`

3. Alterar fluxo de conexao WhatsApp no admin:
- edite `apps/web/components/omnichannel/OmnichannelAdminModule.vue`

4. Alterar endpoint consumido no front:
- `apps/web/composables/useApi.ts`
- base URL em `NUXT_PUBLIC_API_BASE`

## Diretriz para modulo plugavel

Para plugar este front em outro projeto no futuro:

1. Isolar a inbox e admin em componentes de dominio dentro de `apps/web/components/omnichannel/`.
2. Manter contratos HTTP no `useApi.ts` e tipos em `apps/web/types/index.ts`.
3. Exportar configuracao por variaveis (`NUXT_PUBLIC_API_BASE`, tema via tokens).
4. Evitar dependencia de estado global fora de `useAuth` e composables de dominio.
