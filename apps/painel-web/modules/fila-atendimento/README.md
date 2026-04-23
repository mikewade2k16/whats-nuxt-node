# Módulo frontend plugável `fila-atendimento`

## Objetivo

Este diretório passa a ser a raiz canônica do módulo `fila-atendimento` dentro do frontend.

O objetivo não é apenas guardar documentação. A intenção é transformar o `fila-atendimento` em um módulo realmente plugável, que possa ser levado para outro projeto Nuxt com o menor acoplamento possível ao shell atual.

Regra prática a partir deste ponto:

- tudo que for propriedade funcional do módulo deve convergir para `apps/painel-web/modules/fila-atendimento/`;
- tudo que for infraestrutura do shell administrativo deve ficar fora do módulo;
- o frontend do módulo e o backend do módulo devem conversar por contrato explícito;
- este arquivo deve explicar tanto o estado atual quanto a estrutura alvo.

## Decisão de organização

Agora existe uma raiz real de módulo no frontend separando o `fila-atendimento` do resto do `apps/painel-web`.

O código hospedado do módulo passou a ficar concentrado em:

- `apps/painel-web/modules/fila-atendimento/runtime/app/pages/admin/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/components/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/stores/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/composables/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/utils/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/types/fila-atendimento.ts`
- `apps/painel-web/modules/fila-atendimento/runtime/assets/css/fila-atendimento-operation.css`
- `apps/painel-web/modules/fila-atendimento/server/api/admin/modules/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/server/utils/fila-atendimento-*`
- `apps/painel-web/modules/fila-atendimento/server/routes/ws/fila-atendimento/*`

A integração com o host acontece por duas costuras explícitas:

- `extends: ['./modules/fila-atendimento/runtime']` para o frontend do módulo;
- `nitro.scanDirs` apontando para `apps/painel-web/modules/fila-atendimento/server` para BFF e websocket.

Resposta direta para a dúvida de organização:

- páginas e componentes do módulo devem migrar para dentro do módulo também;
- durante a transição, podemos manter wrappers finos nas pastas padrão do Nuxt para não quebrar rota nem import imediatamente;
- no estado final, o módulo deve ser dono de suas páginas, componentes, stores, composables, utils, types, assets e camada server-side específica;
- o shell deve ficar dono apenas da autenticação administrativa canônica, da simulação de contexto e dos gates globais do painel.

## Estrutura canônica atual

Estrutura adotada após a extração inicial:

```text
apps/painel-web/modules/fila-atendimento/
  README.md
  runtime/
    nuxt.config.ts
    assets/
      css/
    app/
      components/
        fila-atendimento/
      composables/
        fila-atendimento/
      pages/
        admin/
          fila-atendimento/
      stores/
        fila-atendimento/
      types/
      utils/
        fila-atendimento/
  server/
    api/
      admin/
        modules/
          fila-atendimento/
    routes/
      ws/
        fila-atendimento/
    utils/
      fila-atendimento-*.ts
```

Leitura da estrutura:

- `runtime/nuxt.config.ts`: publica a layer do frontend, os aliases do módulo e o `scanDirs` do Nitro.
- `runtime/app/pages`: páginas próprias do módulo.
- `runtime/app/components`: componentes visuais do módulo.
- `runtime/app/stores`: stores Pinia do módulo.
- `runtime/app/composables`: composables do módulo.
- `runtime/app/types`: contratos TypeScript públicos do módulo.
- `runtime/app/utils`: helpers internos do módulo.
- `server/api`: BFF HTTP específico do módulo, agora fora da árvore global `server/api` do shell.
- `server/routes/ws`: bridge websocket do módulo.
- `server/utils`: bridge shell, bridge realtime, client API e helpers server-side do módulo.

## O que deve ficar fora do módulo

Algumas peças pertencem ao shell administrativo, não ao módulo `fila-atendimento`.

Essas dependências devem continuar fora do módulo, ou serem acessadas por adapter explícito:

- `app/middleware/admin-auth.global.ts`
- `app/middleware/admin-feature-access.global.ts`
- `app/stores/core-auth.ts`
- `app/stores/session-simulation.ts`
- `app/composables/useAdminSession.ts`
- `server/utils/admin-route-auth.ts`
- `server/utils/admin-profile.ts`
- `server/utils/core-admin-fetch.ts`
- `server/utils/access-context.ts`

Motivo:

- isso é infraestrutura do shell;
- outro projeto Nuxt pode autenticar de forma diferente;
- um módulo plugável não deve nascer acoplado ao modelo concreto de sessão do host.

## Estado atual do módulo no frontend

### Frontend hospedado hoje

O frontend hospedado real do módulo agora fica nestes caminhos:

- páginas: `apps/painel-web/modules/fila-atendimento/runtime/app/pages/admin/fila-atendimento/*`
- componentes: `apps/painel-web/modules/fila-atendimento/runtime/app/components/fila-atendimento/*`
- stores: `apps/painel-web/modules/fila-atendimento/runtime/app/stores/fila-atendimento/*`
- composables: `apps/painel-web/modules/fila-atendimento/runtime/app/composables/fila-atendimento/*`
- utils: `apps/painel-web/modules/fila-atendimento/runtime/app/utils/fila-atendimento/*`
- tipos: `apps/painel-web/modules/fila-atendimento/runtime/app/types/fila-atendimento.ts`
- CSS: `apps/painel-web/modules/fila-atendimento/runtime/assets/css/fila-atendimento-operation.css`

### BFF e realtime hoje

O módulo hoje depende destas áreas server-side do frontend:

- BFF HTTP: `apps/painel-web/modules/fila-atendimento/server/api/admin/modules/fila-atendimento/*`
- utilitários server-side: `apps/painel-web/modules/fila-atendimento/server/utils/fila-atendimento-*`
- websocket bridge: `apps/painel-web/modules/fila-atendimento/server/routes/ws/fila-atendimento/*`

No shell, ficaram apenas diretórios vazios transitórios do caminho antigo enquanto a árvore do módulo é absorvida pelo build via `extends` e `nitro.scanDirs`.

### Middleware próprio do módulo

Hoje o módulo não possui middleware próprio em `app/middleware`.

Ele depende apenas dos middlewares globais do shell admin:

- `admin-auth.global.ts`
- `admin-feature-access.global.ts`

Isso confirma uma fronteira importante: o módulo ainda está acoplado ao shell para autenticação e gate de rota.

## O que o módulo faz

O `fila-atendimento` é um módulo operacional e analítico para gestão de fila e atendimento por loja.

Responsabilidades principais no frontend:

- abrir sessão própria do módulo a partir do shell;
- resolver contexto ativo de tenant e loja;
- operar fila, pausa, retomada, início e fechamento de atendimento;
- administrar consultores;
- administrar catálogos operacionais, produtos e campanhas;
- exibir relatórios por loja;
- exibir analytics de ranking, dados e inteligência;
- exibir governança multiloja;
- consumir realtime hospedado pelo host.

## Fronteira do shell que o módulo consome

Para o módulo funcionar hospedado, o shell precisa fornecer alguns contratos mínimos.

### 1. Sessão administrativa autenticada

O módulo não autentica usuário por conta própria quando roda dentro do painel. Ele depende de uma sessão administrativa do shell já resolvida.

### 2. Gate de acesso ao módulo

O shell precisa validar que o usuário tem acesso à rota `/admin/fila-atendimento` e ao módulo `fila-atendimento` antes de:

- abrir a sessão do módulo;
- emitir bridge token;
- emitir ticket realtime.

### 3. Contexto administrativo resolvido

O shell precisa conseguir montar os campos abaixo para assinar o bridge do módulo:

- `coreUserId`
- `email`
- `userType`
- `userLevel`
- `isPlatformAdmin`
- `tenantId`
- `clientId`
- `profileModuleCodes`
- `name`
- `businessRole`
- `storeId`
- `storeName`
- `clientName`
- `registrationNumber`

### 4. Diretório administrativo para escopo do módulo

Hoje o shell usa o `plataforma-api` para montar o escopo inicial do módulo. Na prática, ele depende destes contratos do core:

- `GET /core/admin/clients?page=1&limit=300`
- `GET /core/admin/clients/{coreTenantId}`
- `GET /core/admin/users?page=1&limit=200&coreTenantId={coreTenantId}`
- `GET /core/tenants/{coreTenantId}`

Esses endpoints alimentam o bridge com:

- tenant ativo;
- slug do tenant;
- nome do tenant;
- lista de lojas disponíveis;
- lista de consultores por loja;
- modo de escopo: `platform`, `all_stores` ou `first_store`.

### 5. Segredo de bridge do shell

O host precisa definir:

- `NUXT_FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET`

Sem isso, o shell não consegue:

- gerar o `bridgeToken` da sessão;
- gerar o ticket do websocket.

## Fronteira HTTP que o frontend do módulo consome

Quando hospedado no painel, o frontend do módulo não fala direto com o backend do módulo.

Ele espera a borda abaixo:

- `/api/admin/modules/fila-atendimento/*`

Essa borda é responsabilidade do host frontend e cumpre três papéis:

1. validar acesso administrativo;
2. manter cookie HttpOnly da sessão do módulo;
3. traduzir chamadas do frontend para a API real do backend do módulo.

### Endpoints mínimos esperados na borda do host

Sessão e contexto:

- `POST /api/admin/modules/fila-atendimento/session`
- `GET /api/admin/modules/fila-atendimento/context`

Operação:

- `GET /api/admin/modules/fila-atendimento/operations-snapshot`
- `GET /api/admin/modules/fila-atendimento/operations-overview`
- `POST /api/admin/modules/fila-atendimento/operations-queue`
- `POST /api/admin/modules/fila-atendimento/operations-pause`
- `POST /api/admin/modules/fila-atendimento/operations-resume`
- `POST /api/admin/modules/fila-atendimento/operations-start`
- `POST /api/admin/modules/fila-atendimento/operations-finish`
- `POST /api/admin/modules/fila-atendimento/operations-assign-task`

Consultores:

- `GET /api/admin/modules/fila-atendimento/consultants`
- `POST /api/admin/modules/fila-atendimento/consultants`
- `PATCH /api/admin/modules/fila-atendimento/consultants/{id}`
- `POST /api/admin/modules/fila-atendimento/consultants/{id}/archive`

Settings e catálogos:

- `GET /api/admin/modules/fila-atendimento/settings`
- `PATCH /api/admin/modules/fila-atendimento/settings/operation`
- `PATCH /api/admin/modules/fila-atendimento/settings/modal`
- `POST /api/admin/modules/fila-atendimento/settings/options/{group}`
- `PUT /api/admin/modules/fila-atendimento/settings/options/{group}`
- `PATCH /api/admin/modules/fila-atendimento/settings/options/{group}/{itemId}`
- `DELETE /api/admin/modules/fila-atendimento/settings/options/{group}/{itemId}`
- `POST /api/admin/modules/fila-atendimento/settings/products`
- `PATCH /api/admin/modules/fila-atendimento/settings/products/{itemId}`
- `DELETE /api/admin/modules/fila-atendimento/settings/products/{itemId}`
- `POST /api/admin/modules/fila-atendimento/settings/campaigns`
- `PATCH /api/admin/modules/fila-atendimento/settings/campaigns/{itemId}`
- `DELETE /api/admin/modules/fila-atendimento/settings/campaigns/{itemId}`

Relatórios e analytics:

- `GET /api/admin/modules/fila-atendimento/reports-overview`
- `GET /api/admin/modules/fila-atendimento/reports-results`
- `GET /api/admin/modules/fila-atendimento/reports-recent-services`
- `GET /api/admin/modules/fila-atendimento/reports-multistore-overview`
- `GET /api/admin/modules/fila-atendimento/analytics-ranking`
- `GET /api/admin/modules/fila-atendimento/analytics-data`
- `GET /api/admin/modules/fila-atendimento/analytics-intelligence`

Lojas:

- `GET /api/admin/modules/fila-atendimento/stores`
- `POST /api/admin/modules/fila-atendimento/stores`
- `PATCH /api/admin/modules/fila-atendimento/stores/{id}`
- `DELETE /api/admin/modules/fila-atendimento/stores/{id}`
- `POST /api/admin/modules/fila-atendimento/stores/{id}/archive`
- `POST /api/admin/modules/fila-atendimento/stores/{id}/restore`

Realtime:

- `POST /api/admin/modules/fila-atendimento/realtime-ticket`
- `WS /ws/fila-atendimento/operations`
- `WS /ws/fila-atendimento/context`

## Contrato que o backend do módulo precisa servir

Quando o módulo estiver isolado do shell, o backend do `fila-atendimento` precisa continuar oferecendo a mesma semântica lógica dos contratos abaixo.

### 1. Troca de bridge por sessão própria

Endpoint esperado pelo host:

- `POST /v1/auth/shell/exchange`

Entrada mínima:

```json
{
  "bridgeToken": "ldv-shell-v1.<payload>.<assinatura>"
}
```

Saída mínima:

```json
{
  "user": {
    "displayName": "Maria Gestora",
    "email": "maria@empresa.com"
  },
  "session": {
    "accessToken": "jwt-ou-token-do-modulo",
    "expiresInSeconds": 3600
  }
}
```

### 2. Contexto do módulo

Endpoint esperado:

- `GET /v1/me/context`

Saída mínima:

```json
{
  "user": {
    "displayName": "Maria Gestora",
    "email": "maria@empresa.com"
  },
  "principal": {
    "role": "general_manager",
    "tenantId": "tenant-core-1"
  },
  "context": {
    "activeTenantId": "tenant-core-1",
    "activeStoreId": "store-1",
    "tenants": [
      {
        "id": "tenant-core-1",
        "slug": "grupo-centro",
        "name": "Grupo Centro"
      }
    ],
    "stores": [
      {
        "id": "store-1",
        "tenantId": "tenant-core-1",
        "code": "CTR01",
        "name": "Loja Centro",
        "city": "São Paulo"
      }
    ]
  }
}
```

### 3. Snapshot operacional

Endpoint esperado:

- `GET /v1/operations/snapshot`

Saída mínima:

```json
{
  "storeId": "store-1",
  "waitingList": [
    {
      "id": "person-1",
      "storeId": "store-1",
      "storeName": "Loja Centro",
      "storeCode": "CTR01",
      "name": "Ana Silva",
      "role": "consultant",
      "initials": "AS",
      "color": "#168aad",
      "monthlyGoal": 120000,
      "commissionRate": 1.5,
      "queueJoinedAt": 1713175200000
    }
  ],
  "activeServices": [],
  "pausedEmployees": [],
  "consultantCurrentStatus": {
    "person-1": {
      "status": "queue",
      "startedAt": 1713175200000
    }
  },
  "serviceHistory": []
}
```

### 4. Settings e catálogos

Endpoint esperado:

- `GET /v1/settings`

Saída mínima recomendada:

```json
{
  "storeId": "store-1",
  "selectedOperationTemplateId": "template-default",
  "operationTemplates": [
    {
      "id": "template-default",
      "label": "Padrão",
      "description": "Template padrão da operação"
    }
  ],
  "settings": {
    "maxConcurrentServices": 10,
    "timingFastCloseMinutes": 15,
    "timingLongServiceMinutes": 45,
    "timingLowSaleAmount": 0,
    "testModeEnabled": false,
    "autoFillFinishModal": false,
    "alertMinConversionRate": 0,
    "alertMaxQueueJumpRate": 0,
    "alertMinPaScore": 0,
    "alertMinTicketAverage": 0
  },
  "modalConfig": {
    "title": "Fechar atendimento",
    "productSeenLabel": "Produto visto pelo cliente",
    "productSeenPlaceholder": "Busque e selecione um produto",
    "productClosedLabel": "Produto reservado/comprado",
    "productClosedPlaceholder": "Busque e selecione o produto fechado",
    "notesLabel": "Observações",
    "notesPlaceholder": "Detalhes adicionais do atendimento",
    "queueJumpReasonLabel": "Motivo do atendimento fora da vez",
    "queueJumpReasonPlaceholder": "Busque e selecione o motivo fora da vez",
    "lossReasonLabel": "Motivo da perda",
    "lossReasonPlaceholder": "Busque e selecione o motivo da perda",
    "customerSectionLabel": "Dados do cliente",
    "showEmailField": true,
    "showProfessionField": true,
    "showNotesField": true,
    "visitReasonSelectionMode": "multiple",
    "visitReasonDetailMode": "shared",
    "lossReasonSelectionMode": "single",
    "lossReasonDetailMode": "off",
    "customerSourceSelectionMode": "single",
    "customerSourceDetailMode": "shared",
    "requireProduct": true,
    "requireVisitReason": true,
    "requireCustomerSource": true,
    "requireCustomerNamePhone": true
  },
  "visitReasonOptions": [
    { "id": "vr-1", "label": "Compra" }
  ],
  "customerSourceOptions": [
    { "id": "src-1", "label": "Instagram" }
  ],
  "queueJumpReasonOptions": [
    { "id": "qj-1", "label": "Retorno imediato" }
  ],
  "lossReasonOptions": [
    { "id": "lr-1", "label": "Preço" }
  ],
  "professionOptions": [
    { "id": "pf-1", "label": "Arquiteta" }
  ],
  "productCatalog": [
    {
      "id": "prod-1",
      "name": "Sofá Atlas",
      "code": "SOFA-ATLAS",
      "category": "Sofás",
      "basePrice": 3990
    }
  ],
  "campaigns": [
    {
      "id": "camp-1",
      "name": "Campanha Inverno",
      "description": "Incentivo para produtos premium",
      "campaignType": "comercial",
      "isActive": true,
      "startsAt": "2026-04-01T00:00:00-03:00",
      "endsAt": "2026-05-01T00:00:00-03:00",
      "targetOutcome": "compra",
      "minSaleAmount": 1000,
      "maxServiceMinutes": 90,
      "productCodes": ["SOFA-ATLAS"],
      "sourceIds": ["src-1"],
      "reasonIds": ["vr-1"],
      "queueJumpOnly": false,
      "existingCustomerFilter": "all",
      "bonusFixed": 50,
      "bonusRate": 1.2
    }
  ]
}
```

## Dados mínimos que o backend precisa servir para o frontend não quebrar

### Tenant e lojas

O módulo precisa, no mínimo:

- `tenantId`
- `tenantSlug`
- `tenantName`
- pelo menos uma loja com `id`, `code`, `name` e `city`

### Time de consultores

Para operação, overview, relatórios e governança, o frontend precisa de um diretório coerente de consultores contendo pelo menos:

- `id`
- `storeId`
- `name`
- `role`
- `initials`
- `color`
- `monthlyGoal`
- `commissionRate`
- `conversionGoal`
- `avgTicketGoal`
- `paGoal`
- `active`

Se o módulo também gerenciar acesso do consultor, entram ainda:

- `userId`
- `email`
- `active`
- `initialPassword`

### Catálogo operacional

Para o modal de fechamento e para configuração, o backend deve servir:

- produtos com `id`, `name`, `code`, `category`, `basePrice`
- motivos de visita
- origem do cliente
- motivos de fura-fila
- motivos de perda
- profissões
- campanhas

### Estado operacional

Para a operação rodar sem erro, o backend precisa devolver:

- fila de espera
- atendimentos ativos
- consultores pausados
- status atual por consultor
- histórico de atendimentos

### Relatórios e analytics

Para as workspaces derivadas rodarem, o backend precisa atender:

- métricas agregadas por loja
- linhas de resultado detalhadas
- serviços recentes
- ranking mensal e diário
- contagens por produto, origem, profissão, motivo e desfecho
- inteligência com diagnóstico, score de saúde e ações recomendadas

## Realtime esperado pelo frontend

O frontend hospedado usa websocket do host, não websocket direto do backend.

Fluxo atual:

1. frontend chama `POST /api/admin/modules/fila-atendimento/realtime-ticket`;
2. host valida acesso e assina ticket efêmero;
3. frontend abre `WS /ws/fila-atendimento/operations` ou `WS /ws/fila-atendimento/context`;
4. host faz proxy para o backend do módulo;
5. quando chega `operation.updated`, o store revalida o snapshot.

Contratos mínimos relevantes:

- tópico `operations` exige `storeId`;
- tópico `context` exige `tenantId`;
- o ticket expira rápido;
- a sessão do módulo já precisa existir no cookie `omni_fila_atendimento_token`.

## Variáveis de ambiente hoje exigidas no host

Variáveis relevantes no `apps/painel-web`:

- `NUXT_FILA_ATENDIMENTO_API_INTERNAL_BASE`
- `FILA_ATENDIMENTO_API_INTERNAL_BASE`
- `NUXT_FILA_ATENDIMENTO_WEB_INTERNAL_BASE`
- `FILA_ATENDIMENTO_WEB_INTERNAL_BASE`
- `NUXT_FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET`
- `FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET`
- `NUXT_PUBLIC_FILA_ATENDIMENTO_BASE`
- `NUXT_PUBLIC_FILA_ATENDIMENTO_API_BASE`

Defaults atuais observados:

- base interna da API do módulo: `http://plataforma-api:4100/core/modules/fila-atendimento`
- base pública HTTP do módulo hospedado: `http://localhost:3000/api/admin/modules/fila-atendimento`
- base pública web do host: `http://localhost:3000`

## Cookie de sessão do módulo

O host guarda a sessão do módulo no cookie:

- `omni_fila_atendimento_token`

Características atuais:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`

## Acoplamentos atuais que precisam ser reduzidos para extração

O módulo ainda depende de alguns pontos concretos do host.

Principais acoplamentos atuais:

- `useBffFetch()` usado diretamente nas stores do módulo;
- gates globais do admin em middleware do shell;
- perfil administrativo resolvido por `admin-profile`;
- resolução de cliente e tenant via `core-admin-fetch`;
- stores do módulo distribuídas em `app/stores` em vez de raiz própria do módulo;
- CSS global registrado em `nuxt.config.ts`.

Direção recomendada para reduzir acoplamento:

- criar um client HTTP do módulo, por exemplo `useFilaAtendimentoHttp()`;
- mover CSS do módulo para o runtime do próprio módulo;
- mover os tipos para `runtime/types`;
- mover stores, composables e utils para `runtime/*`;
- manter no shell apenas adapters de auth, access e tenant context.

## Ordem segura de migração

Situação após a extração do módulo:

1. o host `apps/painel-web` estende a layer local em `./modules/fila-atendimento/runtime`;
2. o frontend canônico do módulo mora em `apps/painel-web/modules/fila-atendimento/runtime/app`;
3. os assets do módulo moram em `apps/painel-web/modules/fila-atendimento/runtime/assets`;
4. o server canônico do módulo mora em `apps/painel-web/modules/fila-atendimento/server`;
5. o host mantém apenas shims mínimos quando isso ajuda a absorver runtime antigo/cache legado.

## Mapa resumido do estado atual

Integração do host:

- `apps/painel-web/nuxt.config.ts`
- `apps/painel-web/modules/fila-atendimento/runtime/nuxt.config.ts`

Frontend canônico do módulo:

- `apps/painel-web/modules/fila-atendimento/runtime/app/pages/admin/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/components/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/stores/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/composables/fila-atendimento/useOperationsRealtime.ts`
- `apps/painel-web/modules/fila-atendimento/runtime/app/utils/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/runtime/app/types/fila-atendimento.ts`
- `apps/painel-web/modules/fila-atendimento/runtime/assets/css/fila-atendimento-operation.css`

Server canônico do módulo:

- `apps/painel-web/modules/fila-atendimento/server/api/admin/modules/fila-atendimento/*`
- `apps/painel-web/modules/fila-atendimento/server/utils/fila-atendimento-*`
- `apps/painel-web/modules/fila-atendimento/server/routes/ws/fila-atendimento/operations.ts`
- `apps/painel-web/modules/fila-atendimento/server/routes/ws/fila-atendimento/context.ts`

Compatibilidade temporária no host:

- `apps/painel-web/server/routes/ws/fila-atendimento/operations.ts`
- `apps/painel-web/server/routes/ws/fila-atendimento/context.ts`

Esses dois arquivos existem apenas para absorver runtime antigo que ainda tente resolver o caminho legado do host. Eles não devem receber regra nova; o código-fonte canônico segue em `apps/painel-web/modules/fila-atendimento/server/routes/ws/fila-atendimento/*`.

## Regra final deste diretório

Este diretório deixa de ser apenas documentação solta e passa a representar a casa do módulo `fila-atendimento` no frontend.

Regra de manutenção daqui para frente:

- qualquer decisão estrutural do módulo deve ser refletida aqui;
- qualquer artefato novo do módulo deve preferir nascer sob esta raiz;
- quando algo ainda precisar ficar em `app/` ou `server/`, isso deve ser tratado como etapa de transição, não como destino final.