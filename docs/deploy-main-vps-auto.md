# Deploy Automatico da Main na VPS

Documento simples do fluxo oficial de producao.

## Decisao adotada

- a VPS tera um clone persistente do repositorio em `/opt/omnichannel`
- producao sobe somente a partir da branch `main`
- `dev`, `feature/*`, `hotfix/*` e qualquer outra branch nao fazem deploy automatico na VPS
- o deploy automatico sera feito por GitHub Actions via SSH
- os dados ficam preservados fora do Git:
  - `.env.prod` fica somente na VPS
  - banco, Redis e sessoes ficam em volumes Docker nomeados
- o deploy nao usa `docker compose down -v`
- o deploy nao usa `git clean -fd` na VPS, para nao apagar `.env.prod` nem artefatos operacionais locais

## O que ja esta pronto no repositorio

Ja configurado por aqui:

- workflow de deploy automatico em `.github/workflows/deploy-vps-main.yml`
- politica de branch do workflow: so faz deploy automatico em `push` para `main`
- fallback manual com sincronizacao para `origin/main` em `scripts/deploy-vps-fast.ps1`
- documentacao do fluxo em `docs/deploy-main-vps-auto.md` e `docs/deploy-vps.md`

Importante:

- o repositorio sozinho nao consegue criar usuario Linux na VPS
- o repositorio sozinho nao consegue criar `authorized_keys` no servidor
- o repositorio sozinho nao consegue cadastrar secrets dentro do GitHub para voce
- o repositorio sozinho nao consegue criar `.env.prod` com segredos reais na VPS

Entao existe uma divisao clara:

- configuracao versionada do deploy: ja ficou pronta aqui
- provisionamento inicial do ambiente externo: ainda precisa ser feito uma vez, manualmente, na VPS e no GitHub

## O que e manual so uma vez

Esses passos sao externos ao repo e precisam ser feitos manualmente apenas no setup inicial:

1. criar o usuario de deploy na VPS, se voce optar por nao usar `root`
2. instalar Docker, Compose plugin, Git e Curl na VPS
3. criar `/opt/omnichannel`
4. configurar a chave `VPS -> GitHub` para o clone privado do repo
5. clonar o repo na VPS
6. criar o arquivo `.env.prod` na VPS
7. configurar a chave `GitHub Actions -> VPS` em `authorized_keys`
8. cadastrar os secrets do workflow no GitHub
9. executar o primeiro bootstrap manual

Depois disso, o fluxo passa a ser automatico no merge para `main`.

## O que fica automatico depois do setup inicial

Depois que a VPS e os secrets estiverem prontos:

1. voce mergeia na `main`
2. o GitHub Actions conecta na VPS por SSH
3. o workflow sincroniza o clone com `origin/main`
4. o workflow builda os servicos de aplicacao
5. o workflow roda `docker compose up -d` e recria so os containers que realmente mudaram
6. os volumes de dados permanecem preservados

Observacao:

- commit apenas de `docs/**`, arquivos `*.md` ou workflow em `.github/workflows/**` nao dispara deploy automatico na VPS

Ou seja:

- setup inicial: manual
- deploy recorrente da `main`: automatico

## Politica de branches

- `main`: branch unica de producao
- `dev`: branch de integracao/teste sem deploy automatico na VPS de producao
- outras branches: trabalho local, PR e validacao de CI somente

Fluxo esperado:

1. desenvolver em `dev` ou branch de feature
2. abrir PR
3. validar CI
4. mergear na `main`
5. o GitHub Actions faz o deploy automatico na VPS

## O que fica salvo na VPS

Dentro de `/opt/omnichannel`:

- clone do repo
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `Caddyfile`
- codigo do projeto para build das imagens
- `.env.prod` local, fora do Git

Fora do Git e preservados entre deploys:

- volume do Postgres
- volume do Redis
- volume da Evolution
- qualquer volume nomeado de runtime necessario

Regra principal:

- deploy atualiza codigo e recria containers de aplicacao
- deploy nao apaga volumes de dados

## As duas chaves que existem nesse modelo

Sao duas chaves diferentes. Isso evita confusao.

### Chave 1: VPS -> GitHub

Uso:

- a propria VPS usa essa chave para `git fetch` no repo privado

Como configurar:

1. na VPS, gerar uma chave nova so para leitura do repo
2. adicionar a chave publica em `GitHub > Repo > Settings > Deploy keys`
3. marcar como `read-only`

Exemplo na VPS:

```bash
ssh-keygen -t ed25519 -C "omnichannel-vps-git" -f ~/.ssh/omnichannel_repo
cat ~/.ssh/omnichannel_repo.pub
```

Arquivo `~/.ssh/config` na VPS:

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/omnichannel_repo
  IdentitiesOnly yes
```

### Chave 2: GitHub Actions -> VPS

Uso:

- o workflow do GitHub Actions usa essa chave para entrar por SSH na VPS e executar o deploy

Como configurar:

1. gerar uma chave local ou na propria VPS para o usuario de deploy
2. adicionar a chave publica em `~/.ssh/authorized_keys` do usuario da VPS
3. salvar a chave privada como secret do GitHub Actions

## Secrets do GitHub Actions

Configurar no repo:

- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`
- `VPS_REMOTE_PATH`
- `VPS_SSH_KEY`
- `VPS_KNOWN_HOSTS`

Valores esperados:

- `VPS_HOST`: IP ou host da VPS
- `VPS_PORT`: porta SSH, normalmente `22`
- `VPS_USER`: usuario de deploy; preferir um usuario proprio de deploy, nao `root`
- `VPS_REMOTE_PATH`: `/opt/omnichannel`
- `VPS_SSH_KEY`: chave privada que o GitHub Actions usa para entrar na VPS
- `VPS_KNOWN_HOSTS`: saida de `ssh-keyscan -H seu-host`

Gerar `VPS_KNOWN_HOSTS`:

```bash
ssh-keyscan -H SEU_IP_OU_DOMINIO
```

## Passo a passo inicial na VPS

Resumo rapido:

- sim, o primeiro preparo da VPS e manual
- nao, isso nao precisa ser repetido a cada deploy
- depois do setup inicial, o deploy normal deixa de ser manual

### 1. Instalar dependencias do host

Na VPS instalar:

- Docker Engine
- Docker Compose plugin
- Git
- Curl

Referencia completa: `docs/deploy-vps.md`

### 2. Criar o diretorio do projeto

```bash
mkdir -p /opt/omnichannel
cd /opt/omnichannel
```

Observacao importante:

- o usuario `deploy` pode ser dono de `/opt/omnichannel`, mas nao consegue remover a pasta se o diretorio pai `/opt` continuar sob controle do `root`
- se precisar limpar e recriar `/opt/omnichannel`, faca esse reset como `root` ou com `sudo`

Exemplo seguro de reset inicial:

```bash
sudo rm -rf /opt/omnichannel
sudo install -d -o deploy -g deploy /opt/omnichannel
```

### 3. Configurar a chave da VPS para acessar o GitHub

```bash
ssh-keygen -t ed25519 -C "omnichannel-vps-git" -f ~/.ssh/omnichannel_repo
cat ~/.ssh/omnichannel_repo.pub
```

Adicionar a chave publica como `Deploy key` no repo.

### 4. Clonar o repo na VPS

```bash
git clone git@github.com:SEU-OWNER/SEU-REPO.git /opt/omnichannel
cd /opt/omnichannel
git checkout main
```

Se o clone falhar por restos de tentativa anterior ou permissao em arquivos dentro de `/opt/omnichannel`, limpe a pasta como `root` e repita o clone com o usuario `deploy`:

```bash
sudo rm -rf /opt/omnichannel
sudo install -d -o deploy -g deploy /opt/omnichannel
sudo -u deploy git clone git@github.com:SEU-OWNER/SEU-REPO.git /opt/omnichannel
sudo -u deploy bash -lc 'cd /opt/omnichannel && git checkout main'
```

Sequencia recomendada no primeiro clone para evitar estado parcial:

```bash
rm -rf /opt/omnichannel
install -d -o deploy -g deploy /opt/omnichannel
su - deploy -c 'git clone git@github.com:SEU-OWNER/SEU-REPO.git /opt/omnichannel && cd /opt/omnichannel && git checkout main && git branch -vv && git remote -v'
```

Resultado esperado:

- `git clone` termina sem pedir senha
- `git checkout main` termina sem conflito
- `git branch -vv` mostra `main` rastreando `origin/main`
- `git remote -v` mostra a URL SSH do GitHub

### 5. Criar `.env.prod`

Esse arquivo fica somente na VPS.

```bash
cd /opt/omnichannel
nano .env.prod
```

### 6. Fazer o primeiro bootstrap manual

```bash
cd /opt/omnichannel
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod ps
```

### 7. Habilitar o workflow automatico

Depois que a VPS estiver pronta e o repo clonado:

1. cadastrar os secrets no GitHub
2. garantir que a branch de producao e `main`
3. mergear algo na `main`
4. conferir a execucao do workflow `deploy-vps-main`

## Como o deploy automatico funciona

Quando entra commit novo na `main`, o workflow:

1. abre SSH na VPS
2. entra em `/opt/omnichannel`
3. roda:

```bash
git fetch --prune origin
git checkout main
git reset --hard origin/main
```

4. valida se o path remoto existe, se o clone e valido e se `.env.prod` esta presente
5. builda os servicos de aplicacao selecionados
6. roda `docker compose up -d` nos servicos selecionados
7. recria containers apenas quando imagem ou configuracao mudam; o modo forcado fica reservado ao dispatch manual com `force_recreate=true`
8. sobe o `caddy` no mesmo fluxo para aplicar mudancas do `Caddyfile` versionado quando houver alteracao

Servicos recriados pelo workflow:

- `plataforma-api`
- `atendimento-online-api`
- `atendimento-online-worker`
- `atendimento-online-retencao-worker`
- `painel-web`
- `caddy`

No `workflow_dispatch`, voce tambem pode:

1. informar `git_ref` para redeploy de commit especifico ou rollback controlado
2. informar `services` para deploy seletivo
3. desligar `build_images` quando quiser apenas reaplicar o estado atual
4. ligar `force_recreate=true` quando quiser reinicio completo dos servicos selecionados

Servicos de dados nao entram no deploy automatico:

- `postgres`
- `redis`

## O que NAO fazemos nesse modelo

- nao fazemos `git clone` a cada deploy
- nao copiamos zip/manualmente para a VPS
- nao apagamos volumes de dados a cada release
- nao fazemos deploy automatico de `dev` ou de branch de feature para a VPS de producao
- nao rodamos `npm install` manual dentro do container de producao
- nao rodamos `git clean -fd` no clone da VPS, para nao apagar `.env.prod`

## Comando manual de fallback

Se precisar disparar deploy manual a partir da sua maquina Windows:

```powershell
./scripts/deploy-vps-fast.ps1 -Services painel-web,atendimento-online-api,atendimento-online-worker,atendimento-online-retencao-worker,plataforma-api -ForceRecreate
```

Esse script tambem sincroniza a VPS sempre com `origin/main`.

## Rollback simples

Se um deploy da `main` quebrar e voce precisar voltar rapido:

```bash
cd /opt/omnichannel
git log --oneline -n 10
git checkout main
git reset --hard <commit-anterior-bom>
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod build plataforma-api atendimento-online-api atendimento-online-worker atendimento-online-retencao-worker painel-web
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d --force-recreate plataforma-api atendimento-online-api atendimento-online-worker atendimento-online-retencao-worker painel-web caddy
```

Melhor pratica depois disso:

1. criar um hotfix
2. corrigir na branch apropriada
3. voltar a alinhar a `main`

Alternativa mais previsivel:

1. usar `workflow_dispatch`
2. preencher `git_ref` com o commit anterior bom
3. manter `build_images=true`
4. usar `force_recreate=true` se quiser reiniciar explicitamente todos os servicos selecionados

## Sugestao pratica de operacao

Se quiser manter isso simples e confiavel:

1. use `main` apenas para o que pode ir para producao
2. use `dev` como branch de integracao
3. proteja a `main` com PR obrigatorio
4. use o workflow automatico so para `main`
5. deixe o arquivo `.env.prod` e os volumes somente na VPS
6. mais para frente, se quiser deploy ainda mais rapido, migre de build na VPS para imagens publicadas em registry

## Fonte de verdade

Para detalhes completos de runtime, variaveis, volumes, smoke e producao:

- `docs/deploy-vps.md`

Para o fluxo automatico simples de branch + clone + deploy:

- este documento