# Deploy em VPS

Guia operacional do runtime oficial em produção.

## Premissa importante

Atualizacao de 2026-04-09:

- o override `docker-compose.prod.yml` agora usa `Dockerfile.prod` para `painel-web`, `atendimento-online-api`, `atendimento-online-worker` e `atendimento-online-retencao-worker`
- isso remove o ciclo de `npm ci` + `build` no startup dos containers de producao
- o rebuild continua acontecendo na VPS quando voce roda `docker compose build`, mas o container sobe pronto logo depois da criacao
- para deploy seletivo apos `git push`, preferir o script `scripts/deploy-vps-fast.ps1`

O projeto deve subir em produção usando os mesmos serviços principais já existentes:

- `postgres`
- `redis`
- `plataforma-api`
- `atendimento-online-api`
- `atendimento-online-worker`
- `atendimento-online-retencao-worker`
- `painel-web`
- `whatsapp-evolution-gateway` quando o profile `channels` estiver habilitado
- `caddy` no override de produção

O módulo `fila-atendimento` não sobe mais com `fila-atendimento-postgres`, `fila-atendimento-api` ou `fila-atendimento-web` próprios no deploy principal.

Ele roda assim:

- backend hospedado no `plataforma-api` em `/core/modules/fila-atendimento`
- frontend hospedado no `painel-web` em `/admin/fila-atendimento`
- persistência no mesmo PostgreSQL, com schema `fila_atendimento`

## URLs públicas

| Serviço | URL |
|---|---|
| Painel web | `https://app.${DOMAIN}` |
| API operacional | `https://api.${DOMAIN}` |
| Evolution | `https://evo.${DOMAIN}` |

O `fila-atendimento` fica dentro do domínio do painel:

- tela do módulo: `https://app.${DOMAIN}/admin/fila-atendimento`
- BFF do módulo: `https://app.${DOMAIN}/api/admin/modules/fila-atendimento/*`

O `Adminer` não deve ficar exposto no go-live. Se for realmente necessário, subir apenas em janela operacional com `--profile ops` e remover depois.

## Containers esperados na VPS

| Container | Função | Porta interna |
|---|---|---|
| `omnichannel-mvp-painel-web-1` | frontend Nuxt 4 + BFF | 3000 |
| `omnichannel-mvp-atendimento-online-api-1` | backend Node/Fastify | 4000 |
| `omnichannel-mvp-atendimento-online-worker-1` | worker outbound | — |
| `omnichannel-mvp-atendimento-online-retencao-worker-1` | worker de retenção | — |
| `omnichannel-mvp-plataforma-api-1` | auth, tenants, módulos, finance e backend hospedado do `fila-atendimento` | 4100 |
| `omnichannel-mvp-postgres-1` | PostgreSQL 16 | 5432 |
| `omnichannel-mvp-redis-1` | Redis 7 | 6379 |
| `omnichannel-mvp-whatsapp-evolution-gateway-1` | gateway do WhatsApp | 8080 |
| `omnichannel-mvp-caddy-1` | reverse proxy + SSL | 80/443 |

Container opcional para operação assistida:

| Container | Função | Porta interna |
|---|---|---|
| `omnichannel-mvp-adminer-1` | visualização do banco, somente manutenção | 8080 interno |

## Containers atuais (rename 2026-04-09)

- o prefixo atual do Compose é `omnichannel-mvp`, então `docker ps`, `docker compose logs` e playbooks da VPS devem usar exatamente esses nomes
- no ambiente local, sem o override de produção, também é esperado ver `omnichannel-mvp-mailpit-1`
- no ambiente de produção, o proxy entra como `omnichannel-mvp-caddy-1`
- `adminer` e `redis-commander` continuam opcionais e só devem subir em janela operacional assistida

```text
omnichannel-mvp-painel-web-1
omnichannel-mvp-atendimento-online-api-1
omnichannel-mvp-atendimento-online-worker-1
omnichannel-mvp-atendimento-online-retencao-worker-1
omnichannel-mvp-plataforma-api-1
omnichannel-mvp-postgres-1
omnichannel-mvp-redis-1
omnichannel-mvp-whatsapp-evolution-gateway-1
omnichannel-mvp-mailpit-1
omnichannel-mvp-caddy-1
```

## Volumes preservados no rename

O rename de serviços e containers não deve recriar volumes de dados.
Para manter continuidade de banco, Redis, sessão do WhatsApp e caches de build, a stack atual reaproveita estes volumes nomeados:

```text
omnichannel-mvp_postgres_data
omnichannel-mvp_redis_data
omnichannel-mvp_evolution_instances
omnichannel-mvp_api_node_modules
omnichannel-mvp_worker_node_modules
omnichannel-mvp_retention_worker_node_modules
omnichannel-mvp_web_node_modules
```

Regra operacional:

- não remover volumes durante o rename dos serviços
- não trocar manualmente o nome desses volumes na VPS sem plano de migração
- se precisar recriar containers, usar `docker compose up -d --build --force-recreate` sem `down -v`
- a sessão da Evolution fica em `omnichannel-mvp_evolution_instances`; apagar esse volume derruba conexões existentes

## Estrutura esperada em `/opt/omnichannel`

```text
/opt/omnichannel/
|- .env.prod
|- Caddyfile
|- docker-compose.yml
|- docker-compose.prod.yml
|- apps/
|  |- atendimento-online-api/
|  |- painel-web/
|  `- plataforma-api/
|- incubadora/
|  `- fila-atendimento/
|- docs/
|- modules/
|- packages/
`- scripts/
```

## Variáveis mínimas do `.env.prod`

```env
DOMAIN=seu-dominio.com
POSTGRES_DB=omnichannel
POSTGRES_USER=omnichannel
POSTGRES_PASSWORD=<segredo>
DATABASE_URL=postgresql://omnichannel:<segredo>@postgres:5432/omnichannel?schema=public
CORE_DATABASE_URL=postgresql://omnichannel:<segredo>@postgres:5432/omnichannel
CORE_REDIS_URL=redis://redis:6379
CORE_JWT_SECRET=<segredo>
CORE_PASSWORD_RESET_TTL_MINUTES=15
CORE_SMTP_HOST=<smtp-real>
CORE_SMTP_PORT=587
CORE_SMTP_USERNAME=<usuario-smtp>
CORE_SMTP_PASSWORD=<segredo-smtp>
CORE_SMTP_FROM_EMAIL=no-reply@seu-dominio.com
CORE_SMTP_FROM_NAME=Plataforma
CORE_ALLOWED_ORIGINS=https://app.seu-dominio.com
NUXT_PUBLIC_API_BASE=https://api.seu-dominio.com
WEBHOOK_RECEIVER_BASE_URL=https://api.seu-dominio.com
EVOLUTION_DATABASE_URL=postgresql://omnichannel:<segredo>@postgres:5432/omnichannel?schema=evolution
EVOLUTION_API_KEY=<segredo>
EVOLUTION_WEBHOOK_TOKEN=<segredo>
FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET=<segredo>
FILA_ATENDIMENTO_WEB_APP_URL=https://app.seu-dominio.com
FILA_ATENDIMENTO_CORS_ALLOWED_ORIGINS=https://app.seu-dominio.com
NUXT_PUBLIC_FILA_ATENDIMENTO_BASE=https://app.seu-dominio.com
NUXT_PUBLIC_FILA_ATENDIMENTO_API_BASE=https://app.seu-dominio.com/api/admin/modules/fila-atendimento
WEB_PRODUCTION_MODE=1
```

Observações:

- em ambiente local/dev, os emails de recuperação de senha vão para o Mailpit em `http://localhost:8025`
- antes do go-live na VPS, configurar `CORE_SMTP_*` real no `.env.prod` e validar o reset de senha com envio externo real
- `ADMINER_PASSWORD_HASH` só é necessário se você decidir subir o `Adminer` com `--profile ops`

## Bootstrap inicial do schema operacional

O `docker-compose.prod.yml` não roda mais `prisma:push` automaticamente no boot do `atendimento-online-api`. Isso evita alteração surpresa de schema durante restart.

No primeiro deploy, rode o bootstrap explicitamente:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod run --rm atendimento-online-api \
  sh -c 'if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then npm ci --no-audit --no-fund; fi; npm run prisma:generate && npm run prisma:push'
```

## Subida oficial

```bash
cd /opt/omnichannel

docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod ps
```

Deploy seletivo mais rapido a partir da maquina local Windows:

```powershell
./scripts/deploy-vps-fast.ps1 -Services painel-web,atendimento-online-api -ForceRecreate
```

Exemplos uteis:

```powershell
# so o painel
./scripts/deploy-vps-fast.ps1 -Services painel-web -ForceRecreate

# API + workers sem tocar no painel
./scripts/deploy-vps-fast.ps1 -Services atendimento-online-api,atendimento-online-worker,atendimento-online-retencao-worker -ForceRecreate

# quando o repo remoto ja foi atualizado por outro processo
./scripts/deploy-vps-fast.ps1 -Services painel-web -SkipGitPull -ForceRecreate
```

Adminer, somente se realmente necessário:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile ops --env-file .env.prod up -d adminer
```

## Smoke mínimo pós-deploy

```bash
curl -I https://app.${DOMAIN}/admin/login
curl -I https://api.${DOMAIN}/health
curl -I https://app.${DOMAIN}/api/admin/modules/fila-atendimento/health
curl -I https://api.${DOMAIN}/health
```

Smoke funcional recomendado:

1. fazer login em `https://app.${DOMAIN}/admin/login`
2. abrir `https://app.${DOMAIN}/admin/fila-atendimento`
3. validar bootstrap do host
4. validar criação da sessão do módulo via shell bridge
5. validar contexto do módulo e leitura inicial da operação
6. validar `esqueceu a senha` com email entregue por SMTP real configurado na VPS

## Comandos úteis

```bash
# status
docker ps --format 'table {{.Names}}\t{{.Status}}'

# logs do shell
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod logs -f plataforma-api --tail=100

# logs do painel
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod logs -f painel-web --tail=100

# logs da API operacional
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod logs -f atendimento-online-api --tail=100
```

## O que não fazer

- não subir `fila-atendimento` com compose paralelo no servidor
- não abrir processo manual em `cmd`, `powershell` ou `screen` para compensar falha de container
- não criar segundo PostgreSQL só para o módulo sem necessidade operacional real
- não expor subdomínio separado do módulo se o host oficial está dentro do `painel-web`
- não deixar `Adminer` exposto permanentemente no domínio público
- não depender de `npm run dev`, `tsx watch` ou bootstrap automático de schema para manter produção viva
- não voltar a bind mount de `apps/painel-web` e `apps/atendimento-online-api` no runtime de produção; isso reintroduz build lento no startup

## Observação de arquitetura

O `fila-atendimento` continua sendo um módulo isolado por contrato, mas não precisa de infraestrutura duplicada para isso. O isolamento principal dele agora está em:

- fronteira HTTP/BFF
- schema próprio no banco
- sessão própria após o shell bridge
- manifesto e `AGENTS.md` de módulo
