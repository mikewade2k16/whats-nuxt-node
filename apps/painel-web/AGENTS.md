# AGENTS.md - apps/painel-web

Frontend principal do painel em Nuxt 4.

## Papel atual

- entregar a UI administrativa principal
- embutir o modulo omnichannel como modulo plugavel do painel
- atuar como BFF fino para `apps/atendimento-online-api` e `plataforma-api`
- aplicar gates server-side e client-side coerentes com auth/modulos

## Mapa minimo

```text
app/pages/admin/login.vue        -> login unico do painel via `plataforma-api`
app/stores/core-auth.ts          -> sessao canonica do core (`core:*`)
app/stores/session-simulation.ts -> simulacao de contexto admin/root
server/api/bff/[...path].ts      -> proxy para `apps/atendimento-online-api`
server/api/core-bff/[...path].ts -> proxy para `plataforma-api`
server/api/admin/*               -> BFF administrativo do painel
app/components/omnichannel/      -> UI do modulo omnichannel
app/composables/omnichannel/     -> dominio e estado do modulo
server/api/admin/modules/fila-atendimento/bootstrap.get.ts -> host inicial do modulo `fila-atendimento`
server/api/admin/modules/fila-atendimento/launch-url.get.ts -> resolve a URL assinada do modulo por fetch autenticado
server/api/admin/modules/fila-atendimento/launch.get.ts -> redirect assinado para abrir o modulo com sessao do shell
app/pages/admin/fila-atendimento/index.vue -> entrada principal do modulo no painel
```

## Contrato atual de auth

- o login do painel autentica somente no `plataforma-api`
- o `apps/atendimento-online-api` reutiliza esse mesmo token do core como sessao principal
- quando o usuario root/super-root simular outro cliente, o shell deve propagar esse contexto para o `atendimento-online` por header do shell (`x-client-id`) alem do token do core
- a sessao administrativa do browser deve viver em `app/stores/core-auth.ts` como fonte unica de verdade
- a persistencia de sessao do shell deve privilegiar cookie `HttpOnly`; token em memoria do front so pode existir para necessidades transitórias como realtime
- nenhum fluxo novo deve recriar shadow local de token/usuario para compatibilidade
- `/api/bff/*` nao pode mais ser usado para login do painel nem para gestao de sessao administrativa

## Regras obrigatorias

- componente Vue nao chama backend externo diretamente; usar composable/store/BFF
- `/api/bff/*` fala com `apps/atendimento-online-api`
- `/api/core-bff/*` fala com `plataforma-api`
- controles de acesso precisam ter validacao equivalente no server route/BFF
- `session-simulation` e ferramenta de contexto administrativo, nao permissao real de negocio
- acesso a modulo no shell admin deve usar o conjunto efetivo de modulos do cliente selecionado em `session-simulation`; root continua podendo trocar o cliente, mas nao pode bypassar menu/rota/pagina de modulo quando o cliente ativo nao possui esse modulo
- `app/stores/session-simulation.ts` deve preservar `coreTenantId` por cliente e refletir apenas modulos efetivamente ativos; perfil sem cliente nao pode ganhar acesso a modulo por fallback local
- `server/utils/admin-route-auth.ts` e `app/utils/admin-access.ts` devem manter a mesma regra de gate: modulo do cliente selecionado primeiro, depois nivel/perfil da rota
- usuario do shell sem cliente deve permanecer explicitamente em estado pendente/inativo; o painel nao pode inventar `clientId` fallback para "destravar" login ou escopo.
- redirect pos-login do admin deve cair em rota acessivel ao usuario; quando nao houver destino explicito, priorizar `/admin/fila-atendimento` e depois a primeira area acessivel.
- `/ws/tenant` agora e ponte realtime oficial do painel para `/core/ws`; a conexao deve usar o cookie `omni_core_session`, entrar na sala do `coreTenantId` selecionado e servir refresh sem reload para alteracoes de clientes/modulos
- telas de financas no painel devem operar por padrao no cliente selecionado; quando `billingMode = per_store`, o valor mensal fica bloqueado para edicao manual e a UI deve mostrar a composicao por lojas

## Estado real que precisa ficar documentado

- `apps/painel-web` e o front ativo do projeto
- `apps/painel-web` ja possui `test:composables` e concentra o harness ativo de composables do omnichannel
- `fila-atendimento` agora roda hospedado na stack principal; o painel hospeda a entrada em `/admin/fila-atendimento` e fala com o backend do modulo via `plataforma-api`
- o painel agora tambem emite o bridge efemero de sessao para o `fila-atendimento`, evitando login paralelo quando a entrada acontece pelo host principal
- o host do modulo usa `useBffFetch` para chamar `bootstrap` e `launch-url`, porque as rotas do shell dependem de `x-core-token` e nao funcionam com navegacao crua
- `admin/manage/users` pode cadastrar usuario sem cliente apenas em escopo root, mas esse cadastro deve aparecer como pendente/inativo ate receber cliente.
- build local em Windows pode divergir do container por binding nativo opcional; validar regressao real preferencialmente no container `web`
- o compose local do painel deve manter `.nuxt`, `.output` e `.nitro` em volumes isolados do bind mount; rodar `npm run build` no host nao pode contaminar o `nuxt dev` em Docker

## Checks minimos ao mexer aqui

- `npm run build`
- validar login `/admin/login`
- validar BFF `/api/bff/*` e `/api/core-bff/*`
- se mexer em acesso admin: rodar `node scripts/security-access-audit.mjs` na raiz

## Direcao arquitetural

- manter BFF fino
- manter uma unica sessao canonica no front
- isolar modulos plugaveis por contracts/composables/paginas wrapper
- quando um modulo externo precisar de SSO, preferir bridge efemero + sessao propria do modulo em vez de compartilhar token bruto ou tabelas do shell
