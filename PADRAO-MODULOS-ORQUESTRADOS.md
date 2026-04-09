# Padrão de Módulos Orquestrados

Resumo rápido do padrão arquitetural adotado para módulos plugáveis da plataforma.

## Regra principal

- módulo não puxa dado interno de outro módulo;
- módulo declara o que precisa;
- o shell orquestrador resolve contexto, capacidades e integrações;
- o módulo consome contrato estável;
- `HTTP + JSON` é a fronteira canônica entre shell e módulo;
- dentro do mesmo processo, adapters podem usar tipos nativos quando isso simplificar a implementação sem quebrar o contrato.

## O que o módulo conhece

- `ActorContext`
- `TenantContext`
- `AccessPolicy`
- contratos opcionais declarados no manifesto e no `AGENTS.md`

## O que o módulo não conhece

- service interno de outro módulo
- tabela privada de outro módulo
- helper, ORM ou classe concreta de outro módulo
- store global do host
- detalhe de linguagem do shell

## Papel do shell

O shell é responsável por:

- autenticar
- resolver tenant, ator e escopo
- resolver módulos ativos e capacidades
- injetar integrações opcionais
- chamar o módulo por contrato
- expor isso para BFF, UI, jobs e eventos

## Sessão integrada de módulo

Quando um módulo precisar subir dentro da plataforma sem login paralelo:

1. o painel autentica o usuário no shell principal;
2. o shell emite um bridge efêmero;
3. o backend do módulo troca esse bridge por sessão própria;
4. o frontend do módulo continua operando sobre sua API nativa.

Regras práticas desta borda:

- o shell entrega contexto explícito, não internals do host;
- o bridge deve carregar `tenantSlug` e `scopeMode` quando houver escopo de tenant;
- rotas do host protegidas por `x-core-token` não devem ser abertas por navegação crua;
- o painel deve chamar essas rotas por fetch autenticado, como `useApi` ou `useBffFetch`.

## O que reler quando bater dúvida

- visão executiva: `PADRAO-MODULOS-ORQUESTRADOS.md`
- protocolo completo: `docs/protocolo-orquestracao-modulos.md`
- contratos canônicos: `packages/shell-contracts/README.md`
- template de módulo: `docs/padrao-agents-modulo.md`
- exemplo real: `modules/fila-atendimento/AGENTS.md`

## Aplicação imediata

O primeiro módulo em incorporação ativa nesse padrão é:

- `modules/fila-atendimento`

Estado atual:

- o runtime principal hospeda o `fila-atendimento` dentro dos serviços existentes do shell;
- backend do módulo: `plataforma-api` em `/core/modules/fila-atendimento`;
- frontend do módulo: `painel-web` em `/admin/fila-atendimento`;
- persistência do módulo: mesmo PostgreSQL, em schema próprio;
- o painel já hospeda `/admin/fila-atendimento`;
- o host agora usa fetch autenticado para `bootstrap` e `launch-url`;
- o bridge do shell já leva escopo explícito de `tenantSlug` e `scopeMode`.
- o backend do módulo já troca o bridge por sessão própria em `POST /v1/auth/shell/exchange`;
- a identidade externa do shell agora é reconciliada por `provider + user_id`, permitindo rotação segura de `external_subject`;
- o fallback local `incubadora/fila-atendimento/back/scripts/api/start-local.ps1` já sobe com migrations aplicadas e defaults do shell bridge;
- o fluxo de navegador com `shellBridgeToken` já foi validado até `/operacao`, com cookie `ldv_access_token` emitido pelo próprio módulo.
