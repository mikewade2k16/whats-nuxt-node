# ARQUITETURA-MODULAR-ALVO

Snapshot inicial em `2026-04-03`.

Este documento define a arquitetura alvo do painel para a fase de modularizacao.

Importante:

- isto e desenho-alvo, nao retrato fiel do runtime atual
- este documento existe para guiar refactor, renomeacao e extracao de modulos
- nao autoriza mover pastas ou quebrar imports antes da base ficar estavel

## Objetivo

Queremos que o sistema evolua para um formato em que:

- cada modulo de dominio possa viver com o menor acoplamento possivel
- auth, tenant, RBAC e ativacao de modulo fiquem centralizados no shell
- backend, frontend, migrations e contratos de um modulo fiquem juntos
- um modulo nao precise conhecer internals de outro para funcionar
- a extracao futura de um modulo para outro projeto seja muito menos custosa

## Problema que estamos resolvendo

Hoje a dificuldade nao e apenas tecnica.
Ela e estrutural:

- os nomes das apps nao comunicam com clareza o papel real de cada parte
- auth e contexto de acesso ainda estao espalhados
- fronteiras entre core, modulo, BFF e backend operacional nao estao totalmente explicitas
- o legado ainda confunde o que e referencia, o que e runtime e o que e dependencia tecnica

Se modularizarmos antes de corrigir isso, so vamos espalhar a confusao em mais pastas.

## Principios obrigatorios

### 1. Modulo de dominio nao conhece modulo de dominio

`finance` nao deve importar internals de `atendimento`.
`atendimento` nao deve importar internals de `crm`.

Quando um modulo precisar de contexto externo, ele deve depender de contrato, nao de implementacao concreta.

### 2. O shell concentra preocupacoes transversais

O shell e o modulo pai da plataforma.
Ele fornece:

- auth
- sessao
- actor atual
- tenant atual
- RBAC e policy
- ativacao de modulos por tenant
- feature flags
- auditoria
- observabilidade minima
- registry de modulos
- composicao de navegacao, rotas e menus

### 3. Cada modulo tem superficie publica propria

Cada modulo deve expor, de forma previsivel:

- contrato de backend
- contrato de frontend
- eventos que publica
- eventos que consome
- migrations e tabelas que possui
- manifest de capacidades

### 4. Dependencia permitida e por contrato

Um modulo pode consumir:

- contratos do shell
- SDK comum de modulo
- utilitarios realmente genericos

Um modulo nao pode consumir:

- repositorio interno de outro modulo
- tabela privada de outro modulo
- service concreto de outro modulo
- store/composable interno de outro modulo

### 5. O padrao de seguranca e fail-closed

Se o shell nao conseguir confirmar:

- tenant atual
- actor atual
- permissao
- modulo ativo

o acesso deve falhar, nunca liberar por fallback silencioso.

## Modelo alvo

### Shell

O shell e a camada que liga tudo.
Ele pode continuar nascendo a partir do que hoje e `apps/plataforma-api`, mas seu papel arquitetural precisa ficar mais claro.

Responsabilidades do shell:

- autenticar
- resolver identidade e claims
- resolver tenant e escopo
- validar permissao
- dizer quais modulos estao ativos para cada tenant
- disponibilizar contratos comuns
- registrar modulos carregados
- oferecer pontos de extensao para UI, backend e jobs
- fornecer auditoria, eventos, clock, tracing e configs comuns

Regra:

- o shell conhece todos os modulos registrados
- os modulos nao conhecem os detalhes internos do shell, apenas seus contratos

### Modulo de dominio

Um modulo de dominio e uma unidade funcional com dono claro de regra, dados e contrato.

Exemplos:

- `finance`
- `atendimento-online`
- `fila-atendimento`
- futuros `crm`, `site`, `kanban`

Cada modulo deve carregar consigo:

- backend
- frontend
- contratos
- migrations
- seeds proprios, quando fizer sentido
- testes proprios
- `AGENTS.md`

## Intake de modulos externos ou incubados

Nem todo modulo novo vai nascer direto dentro da estrutura final do monorepo.
Alguns podem chegar como projeto separado, mais completo, e depois serem incorporados.

O caso atual mais importante e:

- `incubadora/fila-atendimento/`

Regra:

- `incubadora/fila-atendimento/` nao deve permanecer para sempre como produto paralelo solto
- ele deve ser tratado como incubadora do futuro modulo `fila-atendimento`
- a incorporacao precisa separar o que e dominio reaproveitavel do que e host local do projeto standalone

### Leitura atual de `incubadora/fila-atendimento/`

Blocos que parecem mais prontos para virar modulo:

- `back/internal/modules/operations`
- `back/internal/modules/realtime`
- `back/internal/modules/reports`
- `back/internal/modules/analytics`
- `back/internal/modules/settings`
- `web/app/features/operation`
- contratos em `web/PANEL_EMBED_CONTRACT.md`
- contratos em `back/CORE_MODULES_PORTABILITY.md`

Blocos que nao devem entrar crus no shell:

- `back/internal/modules/auth`
- `back/internal/modules/tenants`
- `back/internal/modules/stores`
- `back/internal/modules/users`
- `docker-compose.yml` proprio da pasta

Direcao:

- `auth`, `tenant`, `stores` e `users` devem virar adapters do shell, nao um segundo host paralelo
- o objetivo nao e ter dois paineis principais no mesmo repo
- o objetivo e absorver o dominio de fila, operacao, relatorios e analytics como modulo plugavel do painel principal
- `fila-atendimento` nao substitui nem renomeia o modulo `atendimento-online`; os dois dominios precisam permanecer semanticamente separados

### Aplicacoes de composicao

As apps de runtime podem continuar existindo, mas devem tender a papel de host/composicao:

- `painel-web`: hospeda a UI, BFF fino, menus, layout, sessao e montagem dos modulos
- `atendimento-online-api`: hospeda rotas operacionais e adaptadores do modulo de atendimento online
- `plataforma-api`: hospeda auth, tenants, admin, registry e capacidades comuns

Regra:

- app host nao vira deposito de regra de negocio de modulo
- regra de negocio fica dentro do modulo

## Estrutura alvo de pastas

Mapa conceitual sugerido para o monorepo:

```text
apps/
  painel-web/                -> host web e BFF fino
  atendimento-online-api/    -> host operacional do modulo de atendimento online
  plataforma-api/            -> auth, tenant, RBAC, registry e capacidades comuns

modules/
  finance/
    backend/
    frontend/
    contracts/
    migrations/
    tests/
    AGENTS.md
    README.md
    module.manifest.json
  atendimento-online/
    backend/
    frontend/
    contracts/
    migrations/
    tests/
    qa/
    AGENTS.md
    README.md
    module.manifest.json
  fila-atendimento/
    backend/
    frontend/
    contracts/
    migrations/
    tests/
    qa/
    AGENTS.md
    README.md
    module.manifest.json

packages/
  shell-contracts/       -> tipos e interfaces comuns do shell
  module-sdk/            -> helpers de bootstrap, registro e adaptadores
  shared-ui/             -> apenas primitives de UI realmente genericas
```

Importante:

- isso e desenho-alvo
- nao significa que vamos mover tudo agora
- primeiro estabilizamos auth, seed, build e isolamento
- desde `2026-04-04`, `modules/fila-atendimento/` ja existe como scaffold oficial de extracao, mas ainda sem cutover de runtime

## Nomes oficiais atuais

Desde `2026-04-04`, estes sao os nomes oficiais do runtime atual:

- `apps/painel-web`
- `apps/atendimento-online-api`
- `apps/plataforma-api`
- `incubadora/fila-atendimento`
- `old_web` removido do repositorio; nao reintroduzir legado equivalente

Regra:

- estes nomes ja valem para codigo, docs, compose, CI e deploy
- a proxima mudanca estrutural relevante nao e outro rename semantico; e a futura extracao para `modules/`

## Proposta recomendada de nomenclatura

Para reduzir ambiguidade, o nome precisa dizer em qual camada aquela pasta vive:

- `apps/` = runtimes e entrypoints
- `modules/` = dominios plugaveis
- `infra/` = dependencias de infra e operacao
- `scripts/` = automacoes

### Recomendacao principal

Se formos escolher um vocabulario unico para o repo, a melhor linha hoje e:

- `apps/painel-web` como frontend principal
- `apps/plataforma-api` como backend compartilhado da plataforma
- `apps/atendimento-online-api` como backend operacional atual do modulo de atendimento online
- `modules/fila-atendimento` como destino futuro da extracao modular do modulo de fila
- `incubadora/fila-atendimento` como intake temporario enquanto o modulo ainda nao foi absorvido

### Nomes de servico Docker recomendados

- `painel-web`
- `plataforma-api`
- `atendimento-online-api`
- `atendimento-online-worker`
- `atendimento-online-retencao-worker`
- `whatsapp-evolution-gateway`

### Motivos da recomendacao

- `painel-web` comunica com clareza que este runtime e frontend
- `plataforma-api` comunica que o Go e backend HTTP da plataforma compartilhada
- `atendimento-online-api` comunica que o Node atual e backend HTTP do modulo de atendimento online
- `modules/fila-atendimento` prepara o caminho para extracao do modulo sem colidir com `atendimento-online`
- `atendimento-online` cobre melhor o escopo real do modulo: WhatsApp hoje e Instagram depois, sem prender o nome ao canal atual
- `fila-atendimento` preserva a identidade do segundo modulo sem criar dois dominios chamados `atendimento-online`
- `incubadora/fila-atendimento` deixa claro que `incubadora/fila-atendimento` ainda nao e modulo consolidado do shell

### O que evitar

- nomes genericos como `atendimento-online-api`, `painel-web`, `core`
- nomes presos a framework como `nuxt-ui`
- nomes de modulo baseados em tecnologia e nao em dominio
- misturar runtime de plataforma com modulo de negocio no mesmo padrao de nome

### Regra de leitura que vamos seguir

- sufixo `-web` = frontend
- sufixo `-api` = backend HTTP
- sufixo `-worker` = processamento assÃƒÆ’Ã‚Â­ncrono
- prefixo `plataforma-` = capacidade compartilhada do shell
- prefixo `atendimento-online-` = dominio de atendimento digital multicanal

## Contratos minimos do shell

Todo modulo pode depender destes contratos.
Nenhum modulo deve depender de mais do que isso sem justificativa forte.

### `ActorContext`

Representa quem esta executando a acao.

Deve responder no minimo:

- `actorId`
- `actorType`
- `displayName`
- `roles`
- `permissions`
- `timezone`

### `TenantContext`

Representa em qual tenant a acao acontece.

Deve responder no minimo:

- `tenantId`
- `tenantSlug`
- `tenantStatus`
- `timezone`
- `activeModules`
- `featureFlags`

### `AccessPolicy`

Contrato para validar acesso.

Deve responder no minimo:

- se o actor pode executar determinada acao
- se o modulo esta ativo para o tenant
- se o contexto atual permite ler ou mutar o recurso

### `ModuleRegistry`

Contrato que o shell usa para descobrir e montar modulos.

Deve responder no minimo:

- id do modulo
- nome de exibicao
- rotas registradas
- menus/itens de navegacao
- jobs
- eventos publicados e consumidos
- capabilities disponiveis

### `AuditSink`

Contrato de auditoria.

Todo modulo deve poder registrar:

- quem fez
- em qual tenant
- em qual recurso
- qual acao
- antes/depois quando necessario

### `DomainEventBus`

Contrato para eventos entre shell e modulos.

Regra:

- modulo publica evento por contrato
- consumidor reage por contrato
- nenhum modulo pode acoplar em chamada direta so por conveniencia

### `Clock`

Contrato de tempo.

Importante para:

- regras de competencia
- datas automaticas
- recorrencia
- auditoria

### `Storage` ou `PersistenceProvider`

Contrato de infraestrutura para persistencia do modulo.

Regra:

- cada modulo continua dono das suas queries, repositorios e migrations
- o shell oferece acesso a infraestrutura, nao a regra do repositorio

## Protocolo de orquestracao entre shell e modulos

Regra estrutural obrigatoria:

- modulo nao consulta outro modulo diretamente
- modulo nao importa implementacao interna de outro modulo
- modulo declara o que precisa
- shell orquestrador resolve o contexto e entrega isso por contrato

Formato alvo:

- contrato serializavel em JSON
- request envelope
- response envelope
- referencias opacas para dados externos
- adaptadores por transporte, sem mudar o contrato logico

Transportes aceitos:

- in-process
- HTTP/JSON
- fila/evento
- job agendado

Regra:

- o frontend e o BFF nao precisam saber a linguagem do modulo
- o shell e quem conversa com o modulo por contrato
- o modulo responde por contrato

Padrao canonico:

- `docs/protocolo-orquestracao-modulos.md`
- `packages/shell-contracts/README.md`

## Superficies publicas de um modulo

Cada modulo deve expor quatro superficies claras.

### 1. Contrato de aplicacao

Comandos, queries e DTOs do modulo.

Exemplos:

- `CreateFinanceSheet`
- `ListFinanceSheets`
- `ReplaceFinanceSheet`

### 2. Contrato HTTP ou BFF

Rotas e payloads externos.

Regra:

- lista leve
- detalhe pesado
- mutacao pequena com endpoint pequeno
- nao devolver estrutura gigante por comodidade

### 3. Contrato de eventos

Eventos que o modulo publica e consome.

Exemplos:

- `finance.sheet.closed`
- `finance.config.updated`

### 4. Contrato de dados

Tabelas, migrations e ownership de persistencia.

Regra:

- tabela do modulo e do modulo
- outro modulo nao faz query direta nela sem contrato explicito

## Regras de banco e multitenancy

Para um modulo ser plugavel e seguro, o ownership de dados precisa ser claro.

### Regra 1. Toda tabela de dominio tenant-aware carrega `tenant_id`

Exceto quando o dado for global por definicao.

### Regra 2. Toda query tenant-aware filtra tenant explicitamente

Sem filtro implicito oculto no controller.
Sem confiar em "depois a UI filtra".

### Regra 3. O shell resolve o tenant antes de entrar no modulo

O modulo recebe `TenantContext`.
Ele nao precisa descobrir tenant por conta propria em varios lugares.

### Regra 4. Cruzamento entre modulos prefere referencia opaca

Exemplo:

- `finance` pode guardar `actor_id` ou `customer_ref`
- `finance` nao deveria depender do schema interno do modulo dono daquele cadastro

### Regra 5. Acesso entre tenants e sempre negado por padrao

Se houver duvida entre:

- negar
- liberar

o sistema deve negar.

## Como um modulo fica plugavel

Objetivo realista:

- um modulo deve ser executavel dentro do shell
- e deve poder ser transportado para outro projeto com muito menos atrito

Para isso ele precisa:

- possuir seus contratos
- possuir suas migrations
- possuir seu frontend e backend
- depender apenas de contratos comuns
- evitar leitura direta de tabelas e services externos

No futuro ele pode operar em dois modos:

### Modo acoplado ao shell

O shell injeta:

- actor
- tenant
- policy
- auditoria
- eventos
- feature flags

### Modo standalone

O proprio modulo sobe com adaptadores locais para suprir os contratos do shell.

Exemplo:

- `finance` pode rodar em outro projeto se esse projeto fornecer um adaptador para `ActorContext`, `TenantContext` e `AccessPolicy`

## Frontend e composicao de UI

O front de cada modulo nao deve depender do store interno de outro modulo.

Cada modulo pode exportar:

- paginas
- componentes de tela
- itens de menu
- guards/capabilities de UI
- composables proprios

O host web monta isso via registry.

Regra:

- o host decide o que carregar
- o modulo declara o que oferece
- o modulo nao assume menu, rota ou layout fora do seu contrato

## BFF e backend operacional

O BFF nao deve virar segundo dominio.

Papel esperado:

- repassar auth/sessao
- sanitizar input
- compor chamadas minimas
- traduzir contrato quando necessario

Nao fazer:

- regra de negocio pesada
- agregacao gigante de payload
- dependencia cruzada entre modulos por conveniencia

## Manifesto minimo por modulo

Todo modulo deve ter um manifesto proprio.

Exemplo conceitual:

```json
{
  "id": "finance",
  "displayName": "Financeiro",
  "version": "1",
  "requires": [
    "ActorContext",
    "TenantContext",
    "AccessPolicy",
    "AuditSink",
    "Clock",
    "PersistenceProvider"
  ],
  "exports": [
    "routes",
    "menu",
    "events",
    "jobs",
    "migrations"
  ]
}
```

O formato exato pode mudar.
O importante e a ideia:

- o modulo declara o que precisa
- o modulo declara o que oferece

## Template de `AGENTS.md` por modulo

Template canonico:

- `docs/padrao-agents-modulo.md`

Todo modulo novo deve nascer seguindo esse documento.
Resumo minimo obrigatorio:

### 1. Identidade do modulo

- nome
- papel
- status

### 2. Responsabilidades

- o que o modulo faz

### 3. Contratos que consome

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- outros contratos do shell estritamente necessarios

### 4. Contratos que exporta

- DTOs
- comandos/queries
- endpoints
- eventos
- interfaces plugaveis

### 5. Dados e persistencia

- schema
- tabelas
- migrations
- filas/storage/indices relevantes

### 6. Endpoints, filas e interfaces expostas

- rotas
- workers
- jobs
- wrappers

### 7. Eventos e sinais de integracao

- publicados
- consumidos
- realtime

### 8. O que o modulo nao pode conhecer

- imports internos proibidos
- tabelas externas proibidas
- sessoes paralelas
- regra concreta de UI

### 9. Checks minimos de mudanca

- testes
- build
- impacto em contrato
- impacto em tenancy

Observacao:

- regras mais detalhadas de payload, auditoria e anti-padroes continuam valendo via `AGENTS.md` da raiz e pelo template canonico em `docs/padrao-agents-modulo.md`

## Ordem de migracao arquitetural

Esta e a ordem recomendada para sair do desenho e entrar em execucao:

### Etapa A. Estabilizar a verdade atual

- unificar auth
- alinhar seeds e CI
- recuperar build do `apps/atendimento-online-api`
- recuperar build do `apps/painel-web`
- fechar fail-open
- zerar falhas do audit de acesso

### Etapa B. Congelar contratos do shell

- formalizar `ActorContext`
- formalizar `TenantContext`
- formalizar `AccessPolicy`
- formalizar `ModuleRegistry`
- formalizar `AuditSink` e `DomainEventBus`
- formalizar envelope JSON de request/response entre shell e modulo

### Etapa C. Fazer um modulo piloto

Piloto sugerido:

1. `finance`
2. intake de `incubadora/fila-atendimento` como modulo `atendimento`
3. `atendimento` estabilizado ja no shell

Criticos do piloto:

- backend e frontend do modulo com ownership claro
- migrations do modulo
- manifesto do modulo
- `AGENTS.md` do modulo no formato novo
- separacao entre dominio reaproveitavel e host local legado/incubado

### Etapa D. Renomear com semantica

So depois da etapa B.

### Etapa E. Migrar testes e remover legado

Concluida em `2026-04-04`: o harness foi migrado para o front ativo e o legado foi removido.

### Etapa F. Expandir o modelo para os proximos modulos

- `crm`
- `site`
- `kanban`

## Decisoes praticas desta fase

Ficam definidas como direcao:

- o shell e o modulo pai da plataforma
- modulos de dominio dependem de contratos, nao de modulos concretos
- cada modulo precisa declarar o que consome e o que exporta
- nomes semanticos ja podem ser usados em docs mesmo antes do rename fisico
- `atendimento-online` e `fila-atendimento` sao modulos distintos e nao devem ser fundidos por nome
- `finance` e o melhor modulo piloto quando a base estabilizar
- `incubadora/fila-atendimento` passa a ser o candidato principal para formar o modulo `atendimento`

## O que nao fazer agora

Ainda nao vamos:

- mover pastas em massa
- dividir servicos por impulso
- extrair modulo fisicamente sem auth/seed/build estaveis
- criar shared package gigante sem fronteira

## Relacao com o backlog

Este documento implementa a parte de desenho da:

- `P2.9`
- `P2.10`
- parte preparatoria de `P1.5`

As tarefas operacionais continuam sendo controladas por:

- `TAREFAS-PRIORITARIAS-REPO.md`

