# Access Control Matrix (Painel)

Objetivo: manter uma fonte unica para decidir quem pode acessar cada pagina/modulo, com padroes por level e overrides por cliente/usuario.

## Regra estrutural de auth

1. O `platform-core` e a unica fonte de autenticacao/autorizacao da aplicacao.
- qualquer modulo plugavel deve confiar no contexto vindo do core
- nao pode existir login paralelo por modulo em runtime
- nao pode existir sessao paralela por modulo em runtime

2. O modulo de atendimento segue essa mesma regra:
- nao tera auth proprio
- nao tera cadastro proprio de usuario/cliente
- usara apenas a sessao, tenant ativo, user context e RBAC definidos no core
- qualquer limite do atendimento por cliente/usuario deve ser resolvido pelo core e consumido pelo modulo

3. Consequencia pratica:
- remover ou bloquear qualquer fluxo legado de auth local no atendimento
- todo gate de atendimento deve usar o mesmo token/contexto do painel
- clientes nunca podem misturar dados ou sessoes entre tenants porque o escopo nasce no core
## Regras base (acordo atual)

1. `super root`:
- `isPlatformAdmin=true` + `user_type=admin` + `level=admin`.
- somente este perfil possui acesso total e simulacao completa.

2. `platform staff`:
- `isPlatformAdmin=true` + `user_type=admin` + `level != admin`.
- possui escopo cross-client, mas nao recebe acesso total por default.
- acessa apenas o que o `level` permitir e o que for liberado por override.

3. `client admin`:
- pode gerenciar usuarios do proprio cliente.
- pode acessar e alterar temas.
- nunca enxerga dados, filtros ou seletores de outros clientes.

4. Qualquer sessao tenant-scoped:
- ve apenas dados do proprio cliente.
- nao deve receber `select`/filtro global de `cliente`.
- nao deve descobrir nomes/ids de outros clientes pela UI.

### Diferenca operacional: `root/master` vs `Admin Demo`

- `root/master`:
  - `users.is_platform_admin = true`.
  - vinculo obrigatorio com tenant `Root` (`slug=root`) em `tenant_users` como `admin/owner`.
  - nao pode ficar sem vinculo de tenant em ambiente ativo.
  - `root@core.local` deve permanecer com `user_type=admin` e `level=admin`.

- `platform staff` (interno da agencia):
  - `users.is_platform_admin = true`.
  - vinculo com tenant `Root`.
  - `level` real vem de `tenant_users.access_level` (ex.: `marketing`).
  - nao recebe full access automatico.

- `Admin Demo` (admin de tenant):
  - `users.is_platform_admin = false`.
  - vinculado em `tenant_users` com `access_level = admin` e `user_type = admin`.
  - gerencia apenas o proprio tenant (sem bypass global).

4. Paginas operacionais do sistema (default):
- `monitoramento`, `clientes`, `componentes` ficam bloqueadas para clientes por padrao.
- `qa` fica bloqueada por padrao para clientes, mas pode ser liberada por override.

5. Modulos controlam paginas de dominio:
- sem modulo `atendimento` -> sem acesso a `/admin/omnichannel/*`.
- sem modulo `finance` -> sem acesso a `/admin/finance`.
- mesma regra sera aplicada para `crm`, `site`, etc.

## Regras do modulo atendimento (fase multi-tenant atual)

1. Auth e contexto:
- o atendimento nao possui auth proprio.
- todo acesso ao modulo usa a sessao autenticada no `platform-core`.
- o escopo do tenant e do usuario e sempre herdado do core.

2. Defaults por cliente:
- `1` instancia WhatsApp por cliente.
- `3` usuarios com acesso ao modulo por cliente.
- esses valores devem poder ser alterados pelo painel central e persistidos no core.

3. Habilitacao do modulo no cliente:
- ativar o modulo `atendimento` para o cliente nao significa liberar todos os usuarios do cliente.
- o modulo precisa estar ativo no cliente `e` o usuario precisa estar alocado ao modulo.

4. Quem gerencia acesso:
- `super root` pode ajustar limites e acessos.
- `client admin` pode escolher quais usuarios do proprio cliente terao acesso ao atendimento.
- `client admin` nunca pode ver usuarios ou instancias de outros clientes.
- `client admin` nao pode elevar `maxChannels/maxUsers`; esses limites continuam vindo do core.

5. Regra de limite:
- nao permitir conceder acesso ao quarto usuario quando o limite do cliente for `3`.
- nao permitir reduzir o limite para abaixo da quantidade atualmente alocada.

6. Regra de multi-whats (fase atual):
- `client admin` vera todas as instancias do proprio cliente por padrao.
- os demais usuarios do cliente poderao ser vinculados a instancias especificas.
- com apenas `1` instancia ativa, usuario com `atendimentoAccess` opera normalmente.
- com `2+` instancias ativas, usuario comum so enxerga as instancias explicitamente vinculadas.
- a mesma matriz de escopo do core define quem entra no modulo e quais instancias pode operar.
- cada instancia agora possui politica operacional propria:
  - `MULTI_INSTANCE`: usuarios vinculados podem aparecer tambem em outras instancias
  - `SINGLE_INSTANCE`: usuario vinculado aqui nao pode ficar vinculado a outra instancia exclusiva
- cada instancia pode ter `fila/setor` e `responsavel` persistidos no painel para as proximas fases de roteamento.

## Niveis padrao (tenant users)

Niveis iniciais sugeridos:

- `admin`: administracao do cliente, usuarios, temas, configuracoes do proprio tenant.
- `marketing`: paginas de marketing/site/tracking, sem financeiro por padrao.
- `finance`: paginas financeiras, sem marketing por padrao.
- `atendimento`: inbox e operacao do modulo de atendimento.
- `crm`: paginas de CRM (quando modulo estiver ativo).
- `viewer`: leitura basica sem operacoes sensiveis.

## Matriz inicial de paginas

| Page/Area | Module | platform root (admin mode) | client admin | marketing | finance | atendimento | crm | viewer |
|---|---|---|---|---|---|---|---|---|
| `/admin/manage/users` | `core_panel` | allow | allow | deny | deny | deny | deny | deny |
| `/admin/themes` | `core_panel` | allow | allow | allow | allow | allow | allow | allow |
| `/admin/manage/clientes` | `core_panel` | allow | deny | deny | deny | deny | deny | deny |
| `/admin/manage/componentes` | `core_panel` | allow | deny | deny | deny | deny | deny | deny |
| `/admin/containers` | `core_panel` | allow | deny | deny | deny | deny | deny | deny |
| `/admin/manage/qa` | `core_panel` | allow | deny (default) | deny | deny | deny | deny | deny |
| `/admin/omnichannel/*` | `atendimento` | allow | allow if module enabled | deny (default) | deny (default) | allow if module enabled | deny | deny |
| `/admin/finance` | `finance` | allow | allow if module enabled | deny (default) | allow if module enabled | deny (default) | deny | deny |
| `/admin/site/*` | `site` | allow | allow if module enabled | allow if module enabled | deny (default) | deny (default) | deny | read-only optional |
| `/admin/tasks` | `kanban` | allow | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | read-only optional |
| `/admin/tracking` | `analytics` | allow | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | read-only optional |
| `/admin/tools/*` | `tools` | allow | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | allow if module enabled | deny (default) |

Notas:
- `allow if module enabled` significa que o cliente precisa ter o modulo ativo.
- `default` significa comportamento inicial, podendo mudar por override.

## Overrides (cliente e usuario)

Objetivo: permitir excecoes sem quebrar padrao.

1. Override por cliente:
- liga/desliga pagina para todo mundo daquele cliente.
- exemplo: cliente sem acesso a `qa` por padrao, mas cliente X pode ter.

2. Override por usuario:
- liga/desliga pagina para usuario especifico.
- exemplo: usuario `finance` com permissao extra de `marketing`.
- persistido em `users.preferences.adminAccess.allowFeatures/denyFeatures`.

3. Precedencia de avaliacao:
- `deny` explicito por usuario.
- `allow` explicito por usuario.
- `deny` explicito por cliente.
- `allow` explicito por cliente.
- default por level + modulo.

## Proposta de configuracao no painel (proximo passo)

1. Tela "Acesso por cliente":
- lista de paginas/modulos com toggle `allow/deny`.

2. Tela "Acesso por usuario":
- mesma lista com overrides individuais.

3. Tela "Padrao por level":
- define defaults de `admin`, `marketing`, `finance`, `atendimento`, `crm`, `viewer`.

## Estado atual implementado (frontend)

- autenticacao de `/admin/*` agora passa por middleware global unico.
- `super root` e o unico com full access + sessao simulada.
- `platform staff` agora usa `level` real; `isPlatformAdmin` sozinho nao gera mais acesso total.
- `client admin` ja liberado para `/admin/manage/users`.
- `temas` liberado para usuarios autenticados.
- `tasks`, `tracking`, `tools`, `team` e `site` agora entram na mesma matriz unica de acesso.
- `clientes`, `componentes`, `monitoramento`, `qa` continuam bloqueados por default e podem ser liberados por override de usuario quando fizer sentido operacional.
- gates de `atendimento` e `finance` continuam por modulo.
- pagina de `users` agora possui modal de override por usuario (allow/deny por area) sem expor edicao crua do JSON no fluxo principal.
- middlewares de pagina legados foram removidos para evitar divergencia de regra.

## Estado atual implementado (backend BFF)

- `resolveAccessContext` agora resolve permissao por token valido no `platform-core` (`/core/auth/me` + perfil em `/core/admin/users`).
- `level` e `user_type` de `platform admin` agora respeitam o valor real do banco; nao sao mais forçados para `admin/admin`.
- headers `x-user-type/x-user-level/x-client-id` so sao aceitos para simulacao quando o ator e `super root`.
- para qualquer outro perfil, esses headers sao ignorados (fail-closed), evitando bypass por manipulacao do frontend.
- `tenant admin` continua com poder de gerenciar usuarios, mas segue tenant-scoped no BFF.
- `platform staff` pode ter escopo cross-client sem ganhar acesso total; a liberacao de pagina/acao vem da matriz + overrides.
- endpoints de `clientes` e `qa` agora usam a mesma avaliacao server-side da matriz do frontend, evitando divergencia entre menu/rota/API.
- endpoints de `users` no BFF agora aceitam `client admin`, mas com escopo forcado ao `clientId` da sessao tenant-scoped.
- endpoints/rotas/socket do atendimento devem validar tambem `atendimentoAccess`, e nao apenas modulo ativo no cliente.

### Rotina de validacao recomendada

- executar: `node scripts/security-access-audit.mjs`
- relatorio: `docs/metrics/security-access-audit-latest.json`
- detalhes do ciclo atual: `docs/security-access-audit.md`

## Regras UX de permissao (obrigatorias)

1. Se o usuario nao pode editar um campo:
- nao renderizar `input/select/switch` editavel.
- renderizar valor em modo leitura (com indicacao visual de somente leitura).

2. Se a UI mostrar controle editavel:
- o backend precisa aceitar a operacao para aquele ator/contexto.
- nao pode existir "controle editavel que sempre falha".

3. Campos tenant-scoped em usuarios (`level`, `clientId`):
- somente editaveis para usuarios que possuem escopo de tenant.
- conta `platform root` sem vinculo de tenant nao expoe esses controles.

4. Redirecionamento por bloqueio de rota/modulo:
- quando houver bloqueio por permissao, a UI deve exibir confirmacao visual obrigatoria.
- nao pode haver redirecionamento silencioso para `/admin` sem mensagem.
- o destino padrao agora e `/admin/access-denied`, com motivo e rota de origem.

5. Sessao tenant-scoped:
- filtros e colunas `adminOnly` devem ficar ocultos.
- creates/updates devem forcar `clientId` do proprio tenant no backend.
- endpoints de lista/edicao/exclusao nao podem aceitar escape de escopo via query/body.

## Fluxo consolidado de acesso (item 1)

1. Usuario nao autenticado:
- qualquer acesso a `/admin/*` redireciona para `/admin/login`.
- o caminho original fica em `redirect` para retorno apos login.

2. Usuario autenticado:
- middleware global `admin-feature-access.global.ts` avalia a rota.
- a decisao usa helper unico `app/utils/admin-access.ts`.

3. Rota bloqueada:
- redireciona para `/admin/access-denied`.
- a pagina mostra motivo, rota de origem e contexto atual da sessao simulada.

4. Navegacao:
- o menu do header usa a mesma regra base do helper de acesso.
- menu visivel e URL direta passam a obedecer a mesma matriz.

## Backlog de seguranca (prioridade alta)

1. Remover dependencia de headers simulados para autorizacao (`x-user-type`, `x-user-level`, `x-client-id`) em producao.
2. Resolver contexto de autorizacao no BFF a partir do token/sessao validada no backend (fail-closed).
3. Aplicar checagem server-side de permissao por rota/acao (listar, criar, editar, excluir) com regra por level/modulo.
4. Cobrir com testes de regressao de acesso:
- usuario client tentando editar campos admin.
- alteracao de headers no front (spoof) sem elevar privilegio.
- acesso a paginas bloqueadas por modulo/level.
5. Auditar SQL/API para garantir isolamento tenant e evitar bypass por parametros de `clientId`.
