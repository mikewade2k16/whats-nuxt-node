# AGENT

## Escopo

Estas instrucoes valem para `back/internal/modules/users`.

## Responsabilidade do modulo

O modulo `users` cuida da administracao de usuarios da plataforma dentro do modelo multitenant atual.

Hoje ele deve responder por:

- listar usuarios acessiveis
- criar usuario local com papel, escopo e onboarding por convite apenas no modo standalone
- criar usuario local com senha inicial definida pelo admin apenas quando nao houver identidade centralizada do shell
- atualizar dados basicos, papel e escopo
- reenviar/gerar convite inicial quando aplicavel
- redefinir senha temporaria de forma administrativa
- inativar usuario

Ele nao deve cuidar de:

- login e emissao de token
- leitura operacional da fila
- configuracoes da loja

## Contrato atual

- `GET /v1/users`
- `POST /v1/users`
- `PATCH /v1/users/{id}`
- `POST /v1/users/{id}/invite`
- `POST /v1/users/{id}/reset-password`
- `POST /v1/users/{id}/archive`

No runtime hospedado com shell bridge habilitado:

- `POST /v1/users` fica desabilitado para impedir novas identidades locais administrativas
- grants para usuarios do shell devem usar `PUT /v1/user-grants/core/{coreUserId}`

## Regras de escopo

- `platform_admin` pode administrar usuarios de qualquer tenant, inclusive outros `platform_admin`
- `owner` pode administrar usuarios do proprio tenant
- `owner` nao pode criar nem editar `platform_admin`
- `manager`, `consultant` e `marketing` nao administram usuarios
- `store_terminal` nao administra usuarios

## Regras de modelagem

- o sistema trabalha com um papel efetivo por usuario
- papeis de tenant usam `user_tenant_roles`
- papeis de loja usam `user_store_roles`
  - `consultant`
  - `manager`
  - `store_terminal`
- `platform_admin` usa `user_platform_roles`
- mutacoes devem limpar atribuicoes antigas e regravar apenas o escopo valido para o novo papel
- papeis de loja devem ficar vinculados a uma unica loja por usuario nesta fase
- criar usuario sem senha deve preferir convite, nao senha placeholder
- criar usuario com senha manual nao deve gerar convite
- criar usuario com senha manual deve marcar a conta com senha temporaria quando o papel for individual
- convite so deve ser gerado para usuario ativo e sem senha definida
- se o admin definir senha manualmente ou inativar a conta, convites pendentes devem ser revogados
- reset administrativo de senha deve marcar `must_change_password = true`, exceto para papeis de terminal fixo quando essa regra nao se aplicar
- o CRUD administrativo de usuarios deve viver em area propria do frontend, separado de `multiloja`
- autoedicao do proprio perfil nao pertence a este modulo; fica em `auth`
- consultores nao devem nascer por este modulo; o fluxo correto e `consultants`
- contas com papel `consultant` e vinculo de roster nao devem ser editadas, convidadas nem inativadas por este modulo
- para contas de consultor, este modulo pode apenas listar e executar reset administrativo de senha
