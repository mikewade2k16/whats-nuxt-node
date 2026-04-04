# Deploy em VPS — Guia Completo

---

## 🤖 Acesso Rápido para LLMs / Agentes / Testes

> Tudo que um agente ou desenvolvedor precisa para acessar, testar e modificar o sistema em produção.

### VPS

| Item | Valor |
|------|-------|
| IP | `85.31.62.33` |
| OS | Ubuntu 24.04 LTS |
| RAM | 7.8 GB |
| Disco | 96 GB |
| CPUs | 2 |
| SSH user | `root` |
| Chave SSH | `~/.ssh/vps_deploy` (na máquina de dev do Mike) |
| Diretório do projeto | `/opt/omnichannel` |

**Conectar via SSH:**
```bash
ssh -i ~/.ssh/vps_deploy -o StrictHostKeyChecking=no root@85.31.62.33
```

**Rodar comando remoto:**
```bash
ssh -i ~/.ssh/vps_deploy -o StrictHostKeyChecking=no root@85.31.62.33 "comando aqui"
```

---

### URLs Públicas

| Serviço | URL |
|---------|-----|
| Frontend (app) | `https://app.whenthelightsdie.com` |
| API (Fastify) | `https://api.whenthelightsdie.com` |
| Evolution API | `https://evo.whenthelightsdie.com` |
| Adminer (DB viewer) | `https://db.whenthelightsdie.com` |

---

### Credenciais do Sistema

**Admin Panel (platform-core):**
| Campo | Valor |
|-------|-------|
| Email | `mikewade2k16@gmail.com` |
| Senha | `123123456` |
| URL login | `https://app.whenthelightsdie.com` → Painel Admin |
| Status | `Validado em 2026-03-31` |

**Banco de dados (PostgreSQL):**
| Campo | Valor |
|-------|-------|
| Host (interno Docker) | `postgres:5432` |
| Database | `omnichannel` |
| User | `omnichannel` |
| Senha | `48b6dcba9498652f9428fe88a963735d90f923280315d971` |
| Connection string | `postgresql://omnichannel:48b6dcba9498652f9428fe88a963735d90f923280315d971@postgres:5432/omnichannel` |

**Redis:**
| Campo | Valor |
|-------|-------|
| Host (interno Docker) | `redis:6379` |
| URL | `redis://redis:6379` |

**Evolution API:**
| Campo | Valor |
|-------|-------|
| URL interna | `http://evolution:8080` |
| URL pública | `https://evo.whenthelightsdie.com` |
| API Key | `a8375e84b6295c51ea910f2238c4a269b28b03d0d864c1d8b4b500a9aa5f2f71` |

**Adminer (visualizador do banco):**
| Campo | Valor |
|-------|-------|
| URL | `https://db.whenthelightsdie.com` |
| Usuário HTTP | `dbadmin` |
| Senha HTTP | `Omni@DB2026` |
| Sistema | `PostgreSQL` |
| Servidor | `postgres` |
| Usuário DB | `omnichannel` |
| Senha DB | `48b6dcba9498652f9428fe88a963735d90f923280315d971` |
| Database | `omnichannel` |

> **DNS necessário:** registro A `db → 85.31.62.33` no painel do domínio. Após criar o registro, o Caddy emite o SSL automaticamente.

**JWT Secrets (para forjar tokens em testes — nunca expor publicamente):**
| Campo | Valor |
|-------|-------|
| JWT_SECRET (API) | `47dbacb67babe6d2cbe9997ecdbd7e0e6d26235a1f4f1aca56c4f3c7615f0edf` |
| CORE_JWT_SECRET | `6363a41463d4fb349b42bcbc484e44ef50b29d4693071c1631efc8f07834c601` |

---

### Containers Docker (nomes e funções)

```bash
# Ver status de todos os containers
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

| Container | Função | Porta interna |
|-----------|--------|---------------|
| `omnichannel-mvp-web-1` | Frontend Nuxt 4 | 3000 |
| `omnichannel-mvp-api-1` | Backend Fastify + Socket.IO | 4000 |
| `omnichannel-mvp-worker-1` | Worker BullMQ (envio WhatsApp) | — |
| `omnichannel-mvp-retention-worker-1` | Worker de retenção de mensagens | — |
| `omnichannel-mvp-platform-core-1` | Auth/tenants (Go) | 4100 |
| `omnichannel-mvp-postgres-1` | PostgreSQL 16 | 5432 |
| `omnichannel-mvp-redis-1` | Redis 7 | 6379 |
| `omnichannel-mvp-evolution-1` | Evolution API (WhatsApp) | 8080 |
| `omnichannel-mvp-caddy-1` | Reverse proxy + SSL | 80/443 |
| `omnichannel-mvp-adminer-1` | Visualizador do banco (Adminer) | 8080 (interno) |

---

### Comandos Úteis na VPS

```bash
# Alias já configurado no .bashrc da VPS:
# dc = docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod

# Ver logs em tempo real
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "cd /opt/omnichannel && source ~/.bashrc && dc logs -f api --tail=50"

# Ver todos os containers
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker ps"

# Reiniciar um serviço
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker restart omnichannel-mvp-api-1"

# Acessar o banco de dados
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker exec -it omnichannel-mvp-postgres-1 psql -U omnichannel omnichannel"

# Acessar Redis
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker exec -it omnichannel-mvp-redis-1 redis-cli"

# Limpar rate limit de login (quando bloqueado)
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker exec omnichannel-mvp-redis-1 redis-cli --scan --pattern 'rate-limit:*' | xargs -r docker exec -i omnichannel-mvp-redis-1 redis-cli DEL && docker restart omnichannel-mvp-web-1 omnichannel-mvp-api-1 omnichannel-mvp-platform-core-1"

# Enviar código atualizado da máquina dev para a VPS
tar -czf - --exclude='.git' --exclude='*/node_modules' --exclude='.nuxt' --exclude='.output' --exclude='dist' --exclude='volumes' --exclude='*.log' --exclude='.claude' --exclude='old_web' . | ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "tar -xzf - -C /opt/omnichannel/"

# Reiniciar serviços após envio de código
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "docker restart omnichannel-mvp-api-1 omnichannel-mvp-worker-1 omnichannel-mvp-web-1"
```

---

### Estrutura de Arquivos na VPS

```
/opt/omnichannel/
├── .env.prod                  # variáveis de ambiente (NÃO está no git)
├── Caddyfile                  # config do reverse proxy
├── docker-compose.yml         # base (dev + prod)
├── docker-compose.prod.yml    # override de produção
├── apps/
│   ├── api/                   # Backend Fastify (Node.js/TypeScript)
│   ├── omni-nuxt-ui/          # Frontend Nuxt 4
│   ├── platform-core/         # Auth service (Go)
│   └── platform-core/
├── docs/                      # Documentação
└── scripts/                   # Scripts utilitários
```

---

### API Endpoints Principais

```bash
# Health check da API
curl https://api.whenthelightsdie.com/health

# Login admin (retorna JWT)
curl -X POST https://app.whenthelightsdie.com/api/bff/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mikewade2k16@gmail.com","password":"123123456"}'

# Evolution API — listar instâncias WhatsApp
curl https://evo.whenthelightsdie.com/instance/fetchInstances \
  -H "apikey: a8375e84b6295c51ea910f2238c4a269b28b03d0d864c1d8b4b500a9aa5f2f71"
```

---

### Rate Limiters — Como Resetar

O sistema tem 4 camadas de rate limit no login:

| Camada | Config | Reset |
|--------|--------|-------|
| Nuxt BFF (Redis) | 10 req / 5min, block 15min | Limpar chaves Redis `rate-limit:*` |
| Nuxt BFF (in-memory) | mesmo config, fallback | `docker restart omnichannel-mvp-web-1` |
| API Fastify | `auth.login.ip` e `auth.login.credential` | Limpar chaves Redis `rate-limit:*` e reiniciar `omnichannel-mvp-api-1` |
| Platform-core (Go) | `core.auth.login` — **50 req / 5min, block 2min** | Limpar chaves Redis `rate-limit:*` e reiniciar `omnichannel-mvp-platform-core-1` |

**Reset completo de rate limit:**
```bash
ssh -i ~/.ssh/vps_deploy root@85.31.62.33 "
docker exec omnichannel-mvp-redis-1 redis-cli --scan --pattern 'rate-limit:*' | xargs -r docker exec -i omnichannel-mvp-redis-1 redis-cli DEL
docker restart omnichannel-mvp-web-1 omnichannel-mvp-api-1 omnichannel-mvp-platform-core-1
"
```

---

## Visão Geral

O sistema roda 100% via Docker Compose com Caddy como reverse proxy (SSL automático via Let's Encrypt).

| Serviço | Descrição | Porta interna |
|---------|-----------|---------------|
| `caddy` | Reverse proxy + SSL automático | 80/443 (público) |
| `web` | Frontend Nuxt 4 | 3000 |
| `api` | Backend Fastify + Socket.IO | 4000 |
| `worker` | Worker BullMQ (envio de mensagens) | — |
| `platform-core` | Auth/tenants (Go) | 4100 |
| `postgres` | Banco de dados | 5432 |
| `redis` | Fila e cache | 6379 |
| `evolution` | Evolution API (WhatsApp) | 8080 |

## Pré-Requisitos na VPS

- Ubuntu 22.04+ ou Debian 12+
- Docker 24+ + Docker Compose v2
- Caddy 2+
- 2 CPUs mínimo, 4GB RAM recomendado (projeto roda bem com 8GB)
- Swap de 2GB (obrigatório para build do Nuxt)

## 1. Preparação Inicial (só na primeira vez)

### 1.1 Instalar Docker

```bash
apt-get update && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker --now
```

### 1.2 Instalar Caddy

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

### 1.3 Criar Swap (necessário para build Nuxt)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
# Tornar permanente:
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. DNS — Registros Obrigatórios

No painel do domínio (Hostinger → Zona DNS), crie **4 registros A** apontando para o IP da VPS:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | `app` | `IP_DA_VPS` | 300 |
| A | `api` | `IP_DA_VPS` | 300 |
| A | `evo` | `IP_DA_VPS` | 300 |
| A | `db` | `IP_DA_VPS` | 300 | ← Adminer (visualizador do banco) |

**Aguarde a propagação** antes de subir (5-30 min com TTL 300). Verificar:
```bash
nslookup app.SEU_DOMINIO 8.8.8.8
nslookup db.SEU_DOMINIO 8.8.8.8
```

## 3. Configuração do `.env.prod`

O arquivo `.env.prod` **nunca vai para o git** (está no `.gitignore`).

### Gerar secrets seguros na VPS:
```bash
# Rodar na VPS para gerar valores únicos:
echo "POSTGRES_PASSWORD: $(openssl rand -hex 24)"
echo "JWT_SECRET: $(openssl rand -hex 32)"
echo "CORE_JWT_SECRET: $(openssl rand -hex 32)"
echo "EVOLUTION_API_KEY: $(openssl rand -hex 32)"
echo "EVOLUTION_WEBHOOK_TOKEN: $(openssl rand -hex 32)"
```

### Campos obrigatórios a preencher:

```env
DOMAIN=SEU_DOMINIO.com
POSTGRES_PASSWORD=<openssl rand -hex 24>
DATABASE_URL=postgresql://omnichannel:<POSTGRES_PASSWORD>@postgres:5432/omnichannel?schema=public
CORE_DATABASE_URL=postgresql://omnichannel:<POSTGRES_PASSWORD>@postgres:5432/omnichannel
EVOLUTION_DATABASE_URL=postgresql://omnichannel:<POSTGRES_PASSWORD>@postgres:5432/omnichannel?schema=evolution
JWT_SECRET=<openssl rand -hex 32>
CORE_JWT_SECRET=<openssl rand -hex 32>
CORE_REDIS_URL=redis://redis:6379
CORS_ORIGIN=https://app.SEU_DOMINIO.com
NUXT_PUBLIC_API_BASE=https://api.SEU_DOMINIO.com
WEBHOOK_RECEIVER_BASE_URL=https://api.SEU_DOMINIO.com
CORE_API_EMAIL=root@core.local
CORE_API_PASSWORD=<senha real do root do platform-core>
CORE_ALLOWED_ORIGINS=https://app.SEU_DOMINIO.com
WEB_PRODUCTION_MODE=1
EVOLUTION_API_KEY=<openssl rand -hex 32>
EVOLUTION_WEBHOOK_TOKEN=<openssl rand -hex 32>
```

## 4. Enviar Código para a VPS

No Windows sem rsync, use tar+ssh:

```bash
# Rodar na máquina de desenvolvimento (Git Bash):
tar -czf - \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='.nuxt' \
  --exclude='.output' \
  --exclude='dist' \
  --exclude='volumes' \
  --exclude='*.log' \
  --exclude='.claude' \
  --exclude='old_web' \
  . | ssh -i ~/.ssh/vps_deploy root@IP_DA_VPS "tar -xzf - -C /opt/omnichannel/"
```

## 5. Subir os Serviços

```bash
cd /opt/omnichannel

# 1. Fazer pull das imagens (pode demorar)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod pull

# 2. Build das imagens locais (api, web, worker, platform-core)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod build

# 3. Subir tudo
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d

# 4. Verificar status
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod ps
```

> **Alias útil** — crie no `.bashrc` da VPS para não repetir toda vez:
> ```bash
> alias dc='docker compose -f /opt/omnichannel/docker-compose.yml -f /opt/omnichannel/docker-compose.prod.yml --profile channels --env-file /opt/omnichannel/.env.prod'
> # Uso: dc up -d | dc ps | dc logs -f api
> ```

## 6. Verificação Pós-Deploy

```bash
# Status dos containers
docker compose ps

# Logs da API
docker compose logs -f api --tail=50

# Logs do worker
docker compose logs -f worker --tail=50

# Logs do Caddy (SSL)
docker compose logs -f caddy --tail=50

# Testar endpoints
curl https://api.SEU_DOMINIO.com/health
curl -I https://app.SEU_DOMINIO.com
```

## 7. Atualizar o Sistema (deploys futuros)

```bash
# Na máquina dev — enviar código atualizado:
tar -czf - --exclude='.git' --exclude='*/node_modules' --exclude='.nuxt' --exclude='.output' --exclude='dist' --exclude='volumes' --exclude='*.log' --exclude='.claude' --exclude='old_web' . | ssh -i ~/.ssh/vps_deploy root@IP_DA_VPS "tar -xzf - -C /opt/omnichannel/"

# Na VPS — rebuild e restart apenas dos serviços alterados:
cd /opt/omnichannel
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod build api web worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d --no-deps api web worker
```

## 8.0 Notas de Auth/Admin validadas em produção (2026-03-31)

Estas observações precisam ser preservadas antes da remoção definitiva do login legado.

- o acesso atualmente validado do painel é `mikewade2k16@gmail.com / 123123456`
- o proxy `apps/omni-nuxt-ui/server/api/core-bff/[...path].ts` precisa transformar `x-core-token` em `Authorization: Bearer <token>` antes de encaminhar para o `platform-core`
- sem essa tradução, chamadas como `/api/core-bff/core/tenants/{tenantId}` e `/modules` falham com `401` no core e o frontend tende a exibir `Falha no backend core`
- usuários criados como root/global precisam nascer com `is_platform_admin = true`, vinculação no tenant `root`, role `platform_root` e módulos ativos do tenant root
- quando o usuário existe apenas no fluxo legado/local, o login pode responder token com `role: VIEWER` mesmo que o `profile` do core indique acesso administrativo
- antes de mexer na autenticação, validar sempre:
  - `POST /api/bff/auth/login`
  - `GET /api/core-bff/core/auth/me`
  - `GET /api/core-bff/core/tenants/{tenantId}`
  - `GET /api/core-bff/core/tenants/{tenantId}/modules`

Estado validado em 2026-03-31:

- login do painel funcionando com o acesso acima
- `core/auth/me` funcionando pelo BFF
- tenant atual `c907cb97-bd4d-4efe-9854-ee9ec4dbce91`
- `modules` respondendo normalmente pelo BFF
- usuário `tonyw.wright@outlook.com` corrigido no banco para root/platform admin com role `platform_root`
- no financeiro, datas automaticas (`Hoje`, `effectiveDate`, periodo padrao) devem usar `America/Sao_Paulo`; usar `UTC` gera virada errada de dia perto das 21h/22h do Brasil

## 8. Lições Aprendidas — Primeiro Deploy (2026-03-18)

Problemas encontrados e as correções aplicadas durante o primeiro deploy real:

### ❌ `sshpass` não disponível no Windows
**Problema:** Não existe `sshpass` no Git Bash do Windows — impossível passar senha via linha de comando.
**Fix:** Gerar par de chaves SSH (`ssh-keygen -t ed25519`) e adicionar a chave pública via console web da Hostinger.

### ❌ Chave SSH corrompida ao colar no console da Hostinger
**Problema:** O console web quebrou a chave longa em múltiplas linhas ou colou junto com a chave da Hostinger sem newline.
**Fix:** Usar base64 para evitar quebra de linha:
```bash
echo "<BASE64_DA_CHAVE>" | base64 -d >> ~/.ssh/authorized_keys
# Ou usar python3 para remover e re-adicionar a chave corrompida:
python3 -c "import re; c = open('/root/.ssh/authorized_keys').read(); c = re.sub(r'\s*ssh-ed25519\s+\S+\s+claude-deploy\s*', '', c).rstrip(); k = 'ssh-ed25519 AAAA... claude-deploy'; open('/root/.ssh/authorized_keys', 'w').write(c + chr(10) + k + chr(10)); print('OK')"
```

### ❌ `rsync` não disponível no Windows/Git Bash
**Problema:** `rsync` não existe no Git Bash do Windows.
**Fix:** Usar `tar + ssh pipe`:
```bash
tar -czf - --exclude='.git' --exclude='*/node_modules' ... . | ssh -i ~/.ssh/vps_deploy root@IP "tar -xzf - -C /opt/omnichannel/"
```

### ❌ Porta 80 em uso ao subir Caddy via Docker
**Problema:** O Caddy instalado via `apt` estava rodando como serviço do sistema e segurando a porta 80.
**Fix:** Parar e desabilitar o serviço antes de subir o container:
```bash
systemctl stop caddy && systemctl disable caddy
```

### ❌ `Dockerfile.prod` da API sem `npm run build`
**Problema:** O builder instalava deps com `--omit=dev` (sem TypeScript) e não compilava. A imagem não tinha a pasta `dist/`.
**Fix:** Instalar TODAS as deps no builder (sem `--omit=dev`) e adicionar `npm run build` antes de copiar o `dist/`:
```dockerfile
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run prisma:generate && npm run build
```

### ❌ `outbound-worker.ts` não importava `outboundQueue` e `outboundRetryJobOptions`
**Problema:** Erro de TypeScript ao compilar — o monitor de PENDING presos usava essas variáveis sem importar de `queue.ts`.
**Fix:** Adicionar ao import existente:
```typescript
import { outboundQueue, outboundQueueMaxAttempts, outboundQueueName, outboundRetryJobOptions } from "../queue.js";
```

### ❌ `volumes: []` no docker-compose.prod.yml não remove os volumes do base
**Problema:** No Docker Compose, overrides ACUMULAM — não é possível remover volumes definidos no arquivo base. Tentar sobrescrever build/command com Dockerfile.prod enquanto o volume monta o código-fonte sobre `/app` fazia o container não achar `dist/`.
**Fix na epoca:** Para o primeiro deploy, manter o modo dev (codigo montado via volume, `npm run dev`) evitou quebrar o `dist/` por causa dos volumes acumulados do Compose.

**Estado atual:** depois desta fase, o `web` foi migrado para build/runtime de producao controlado por `WEB_PRODUCTION_MODE=1`, mas `api`, `worker` e `retention-worker` ainda continuam em modo de desenvolvimento ate a migracao completa para imagens standalone.

### ⏳ Caddy demora para emitir SSL após adicionar DNS
**Problema:** Let's Encrypt usa servidores DNS próprios que demoram alguns minutos a mais para ver a propagação, mesmo após o Google/8.8.8.8 já resolver corretamente.
**Comportamento esperado:** O Caddy tenta automaticamente com backoff exponencial (2min → 10min → ...). Não precisa reiniciar.

## 8.1 Correcoes aplicadas apos o primeiro acesso remoto (2026-03-18 noite / 2026-03-19 madrugada)

Tudo abaixo aconteceu depois da etapa em que a VPS ja estava acessivel, os containers principais estavam de pe, a API respondia `/health` e o painel ja abria a tela de login.

### ✅ 1. Validacao inicial da VPS

Foi confirmado que:

- o SSH com a chave `~/.ssh/vps_deploy` funcionava normalmente
- o diretorio remoto correto era `/opt/omnichannel`
- os containers principais estavam em execucao
- `https://app.whenthelightsdie.com` redirecionava para `/admin/login`
- `https://api.whenthelightsdie.com/health` respondia `200`

### ❌ 2. Login do painel quebrado por `429 Too Many Requests`

**Sintoma observado:**

- `POST /api/bff/auth/login` retornava `429`
- `POST /core/auth/login` do `platform-core` tambem retornava `429`
- o bloqueio acontecia mesmo apos restart de containers

**Causa raiz encontrada:**

O `platform-core` estava subindo sem `CORE_REDIS_URL`. O middleware de rate limit do Go tem um bug: quando a URL do Redis fica vazia, ele nao cai corretamente no fallback em memoria e passa a negar o login imediatamente.

**Correcao aplicada no compose base:**

```yaml
platform-core:
  environment:
    CORE_REDIS_URL: ${CORE_REDIS_URL:-${REDIS_URL:-redis://redis:6379}}
```

**Estado atual esperado:**

- `.env.prod` precisa manter `CORE_REDIS_URL=redis://redis:6379`
- sem isso, o `platform-core` pode voltar a bloquear o login com `429` falso

### ❌ 3. Credencial do root do `platform-core` divergente da documentacao

**Sintoma observado:**

Depois de corrigir o `429`, o login passou a retornar `401 Unauthorized`.

**Causa raiz encontrada:**

- a documentacao e o `.env.prod` usavam `root@core.local / a8375e84b6295c51ea910f22`
- o seed/migration do `platform-core` originalmente criava o root com senha `123456`

**Correcao aplicada:**

Foi alinhada a senha real do usuario `root@core.local` no banco `platform_core.users` com a senha documentada na producao, para que:

- o painel admin use a mesma credencial documentada
- a API interna consiga autenticar no `platform-core` usando `CORE_API_PASSWORD`

**Importante para o futuro:**

Se a senha do root for alterada novamente, atualizar juntos:

- tabela de credenciais deste documento
- `.env.prod` em `CORE_API_PASSWORD`
- hash armazenado em `platform_core.users`

### ⚠️ 4. Reset real do rate limit de login

Durante a investigacao, foram encontradas chaves Redis como:

- `rate-limit:bff.auth.login:unknown`
- `rate-limit:auth.login.ip:*`
- `rate-limit:auth.login.credential:*`

Isso mostrou que o login passa por mais de uma camada:

- Nuxt BFF
- API Fastify
- platform-core

Por isso o reset completo precisa:

1. limpar `rate-limit:*` no Redis
2. reiniciar `web`
3. reiniciar `api`
4. reiniciar `platform-core`

O documento acima ja foi atualizado com esse fluxo correto.

### ⚠️ 5. `retention-worker` acusou `public.Tenant` inexistente no boot

**Sintoma observado:**

No inicio, o `retention-worker` logou erro Prisma dizendo que `public.Tenant` nao existia.

**Diagnostico feito:**

- o Postgres foi inspecionado diretamente
- as tabelas `public`, `platform_core` e `evolution` realmente existiam
- nao foi necessario aplicar patch de schema

**Status final:**

Depois de estabilizar o ambiente e reiniciar os servicos corretos, o worker executou normalmente e registrou:

```text
[retention] sweep finished
```

Entao esse erro ficou caracterizado como transitorio de boot/inicializacao, nao como falta real de tabela.

### ❌ 6. Painel com varios `502` em imports dinamicos do Nuxt

**Sintoma observado no navegador:**

- `/_nuxt/@fs/...`
- `@vite/client`
- `virtual:nuxt:...`
- `Failed to fetch dynamically imported module`
- varios `502 Bad Gateway`

**Causa raiz encontrada:**

O frontend `web` ainda estava rodando em `nuxt dev` na VPS. Isso faz o navegador depender do Vite dev server e de assets de desenvolvimento, o que e instavel atras do Caddy em producao.

**Correcao final aplicada:**

Foi criado um modo explicito de producao para o servico `web` no `docker-compose.yml`, controlado por `WEB_PRODUCTION_MODE`:

```yaml
web:
  command: >
    sh -c "if [ ! -d node_modules ] || [ -z \"$(ls -A node_modules 2>/dev/null)\" ]; then npm install --no-audit --no-fund; fi;
    if [ \"${WEB_PRODUCTION_MODE:-0}\" = \"1\" ]; then
      npm run build &&
      NITRO_HOST=0.0.0.0 NITRO_PORT=3000 NODE_ENV=production node .output/server/index.mjs;
    else
      npm run dev -- --host 0.0.0.0 --port 3000;
    fi"
```

E a producao passou a usar:

```env
WEB_PRODUCTION_MODE=1
```

O `docker-compose.prod.yml` tambem ficou com override explicito para `NODE_ENV=production`, `NITRO_HOST` e `NITRO_PORT`.

**Comportamento esperado agora:**

- ao recriar o container `web`, ele faz `nuxt build`
- durante esse build, o Caddy pode devolver `502` temporariamente por alguns segundos/minutos
- quando o build termina, o app volta com assets de producao em `/_nuxt/*.js`

### ✅ 7. Validacoes finais desta etapa

No fim desta rodada, foi validado que:

- `GET https://app.whenthelightsdie.com/admin/login` responde `200`
- o HTML do login nao referencia mais `@vite/client`, `/_nuxt/@fs` nem `virtual:nuxt`
- `POST https://app.whenthelightsdie.com/api/bff/auth/login` responde `200`
- `GET https://api.whenthelightsdie.com/health` responde `200`
- o `retention-worker` terminou o sweep corretamente
- o Caddy conseguiu emitir certificados validos tambem para `api.whenthelightsdie.com` e `evo.whenthelightsdie.com` quando o DNS propagou

### 7.1 Inbox com 404 em `/tenant/whatsapp/status` e `/conversations/sync-open`

Depois que login e frontend ficaram estaveis, a inbox ainda fazia chamadas de background que apareciam como erro no navegador:

- `GET /api/bff/tenant/whatsapp/status`
- `POST /api/bff/conversations/sync-open`

Diagnostico confirmado na VPS:

- as rotas existiam e estavam registradas no Fastify
- o tenant tinha uma instancia local marcada como default (`demo-instance`)
- a Evolution ainda nao tinha nenhuma instancia real criada (`fetchInstances` retornava `[]`)

Ou seja: existia uma instancia "local" por fallback de registry, mas ela ainda nao existia no provider. Por isso os handlers propagavam `404` da Evolution.

Correcao aplicada no backend:

- `GET /tenant/whatsapp/status` agora responde `200` com `configured: false` e mensagem orientando configurar o canal no Admin quando a instancia ainda nao existe na Evolution
- `POST /conversations/sync-open` agora responde `204` como no-op silencioso quando:
  - nao existe instancia pronta para sync
  - a instancia ainda nao foi criada na Evolution
  - o WhatsApp ainda nao esta conectado

Resultado esperado:

- a inbox pode abrir sem poluir o console com erro de rede nessas condicoes esperadas
- o usuario continua vendo o aviso funcional de que o cliente ainda nao possui WhatsApp pronto

Importante:

- isso remove o erro de painel, mas nao cria a instancia na Evolution sozinho
- para ativar o canal de verdade ainda e necessario usar o fluxo do Admin para bootstrap/configuracao do WhatsApp

### 7.2 QR Code com `404` e bootstrap com `409` por conflito de `demo-instance`

Depois que `status` e `sync-open` ficaram silenciosos, apareceram mais dois sintomas no painel:

- `GET /api/bff/tenant/whatsapp/qrcode?force=false` retornando `404`
- `POST /api/bff/tenant/whatsapp/bootstrap` retornando `409`

Diagnostico confirmado na VPS:

- o endpoint de QR ainda tentava consultar `connectionState` na Evolution e propagava `404` quando a instancia ainda nao existia no provider
- existiam pelo menos dois tenants locais usando o nome generico `demo-instance`:
  - `demo`
  - `root`
- a query string `force=false` estava sendo interpretada como `true` no backend por causa de `z.coerce.boolean()`, disparando reconnect desnecessario em polling de tela

Isso acontecia porque o fallback local de registry ainda priorizava `EVOLUTION_DEFAULT_INSTANCE=demo-instance`, o que nao e seguro em ambiente multi-tenant.

Correcao aplicada no backend:

- `GET /tenant/whatsapp/qrcode` agora responde `200` com `configured: false` e mensagem orientando fazer o bootstrap quando a instancia ainda nao existe na Evolution
- o fallback de instancia local passou a preferir nome por tenant (`<slug>-wa`) antes do `EVOLUTION_DEFAULT_INSTANCE`
- o bootstrap passou a ajustar automaticamente nomes em conflito quando o tenant esta reaproveitando a propria instancia placeholder
- os schemas de query string passaram a interpretar `true/false`, `1/0`, `yes/no` corretamente, evitando que `force=false` seja tratado como `true`

Exemplo real validado:

- o tenant `root` tentou bootstrapar `demo-instance`
- o backend detectou conflito com outro tenant
- o nome foi ajustado automaticamente para `root-wa`
- a Evolution criou a instancia, publicou QR e enviou webhook `connection-update`

Estado esperado depois dessa correcao:

- antes do bootstrap, o QR nao derruba mais `404`
- no bootstrap de placeholders legados, o backend tenta sair do nome generico sozinho
- depois do bootstrap, `status` e `qrcode` passam a responder `200` para a instancia real criada


### 7.3 Inbox sem WhatsApp conectado nao deve renderizar o dashboard

Depois que o QR/bootstrap passaram a funcionar, ficou visivel outro problema de UX na inbox:

- o aviso amarelo de WhatsApp desconectado ocupava uma area vertical enorme
- o `chat-page__dashboard` continuava renderizado mesmo sem canal conectado

Diagnostico local e na VPS:

- o container `.chat-page` usava grid com `grid-template-rows: auto minmax(0, 1fr)`
- como existem varios blocos acima do dashboard (switch de tenant e alerts), o segundo item visivel podia virar o proprio `UAlert`
- quando isso acontecia, o alerta herdava a linha expansivel (`1fr`) e parecia "estourado" em altura
- o dashboard continuava sendo montado abaixo, mesmo num estado em que a UX correta era mostrar apenas o aviso

Correcao aplicada no frontend:

- `.chat-page` passou a usar `flex` em coluna, para que os alerts fiquem sempre com altura natural
- o `chat-page__dashboard` agora so renderiza quando o status do WhatsApp ainda esta carregando ou quando ha conexao ativa
- quando o canal esta desconectado, aguardando QR ou nao configurado, a inbox mostra apenas o aviso e oculta a area de chat

Estado esperado depois dessa correcao:

- sem WhatsApp conectado, a pagina mostra apenas o alerta compacto
- o chat, a lista de conversas e a coluna de detalhes nao aparecem nesse estado
- quando o WhatsApp conecta, o dashboard volta a aparecer normalmente

### 7.4 QR exibido mas WhatsApp recusa o dispositivo

Depois que o QR voltou a aparecer, surgiu um sintoma mais sutil:

- o painel ainda mostrava um QR aparentemente valido
- ao escanear no app do WhatsApp, o celular informava que nao foi possivel conectar o dispositivo

Diagnostico confirmado na VPS:

- a Evolution registrou `QR code limit reached, please login again`
- em seguida publicou `connection.update` com `state: refused` e `statusReason: 428`
- o backend ainda podia devolver QR antigo vindo do cache mesmo depois desse estado recusado

Correcao aplicada:

- o endpoint de QR deixou de servir QR de cache quando a instancia entra em `refused`
- nesses casos o backend limpa o cache local de QR e responde orientando resetar a sessao
- `POST /tenant/whatsapp/connect` passou a resetar automaticamente a sessao recusada antes de pedir um novo QR
- `POST /tenant/whatsapp/logout` tambem limpa o cache de QR para evitar reaproveitar codigo morto
- o painel passou a rotular `refused` como falha real de pareamento, com mensagem explicita para gerar um novo QR

Estado esperado depois dessa correcao:

- se a Evolution recusar o ultimo pareamento, o painel para de exibir QR velho
- o usuario passa a ver orientacao correta para regenerar a sessao
- ao clicar em `Conectar por QR`, a sessao recusada e resetada antes de um novo pareamento

### 7.5 Sessao parcial apos restart/hot reload deve deslogar

Tambem apareceu um problema de UX e consistencia no frontend de admin:

- depois de restart do frontend ou alteracoes durante desenvolvimento, o usuario podia continuar "logado" parcialmente
- o menu mostrava papel de admin junto com `Cliente #1`, mesmo sem acesso real aos modulos
- varias telas ficavam sem permissao porque `auth`, `core-auth` e `session-simulation` ja nao representavam a mesma sessao

Diagnostico:

- havia cenarios em que apenas uma parte da autenticacao sobrevivia em `localStorage`
- o middleware aceitava sessao parcial (`auth` ou `core-auth`) e nao derrubava o contexto inteiro
- o store `session-simulation` ainda recriava um fallback local tipo `Cliente #1` ao resetar, o que mascarava a dessintonia

Correcao aplicada:

- mismatch entre `auth` e `core-auth` agora derruba as duas sessoes e redireciona para `/admin/login`
- respostas `401` em `useApi` e `useBffFetch` agora limpam tambem o `session-simulation`
- o `reset()` do `session-simulation` deixou de persistir o fallback fake `Cliente #1`
- quando nao existe cliente real carregado, o frontend passa a mostrar apenas `Cliente`, sem inventar um tenant inexistente

Estado esperado depois dessa correcao:

- se a sessao real nao puder ser mantida apos restart/hot reload, o sistema desloga
- o menu nao deve mais ficar preso em `Cliente #1` sem contexto valido
- a navegacao volta para login em vez de deixar a UI num meio-termo inconsistente

### 7.6 Evolution online em producao, mas `root-wa` segue presa no ciclo de QR recusado

Em 2026-03-19 foi feita uma checagem direta da infraestrutura para validar se ainda existia algum bloqueio fora da aplicacao.

Estado confirmado na VPS:

- `web`, `api`, `platform-core`, `worker`, `postgres`, `redis`, `caddy` e `evolution` estavam todos `Up`
- `https://api.whenthelightsdie.com/health` respondeu `200`
- `https://app.whenthelightsdie.com/admin/login` respondeu `200`
- a Evolution em producao estava online no container `omnichannel-mvp-evolution-1`, imagem `evoapicloud/evolution-api:v2.3.7`
- a Evolution estava persistindo sessao em volume Docker (`/evolution/instances`) e usando Postgres + Redis normalmente

Diagnostico confirmado na Evolution:

- a instancia `root-wa` continuava existindo e recebendo `connect`
- os webhooks `qrcode-updated` e `connection-update` chegavam normalmente na API (`202`)
- a instancia entrava em `connecting`, gerava QRs e depois caia em `refused`
- nos logs da Evolution apareceu explicitamente `QR code limit reached, please login again`
- o `fetchInstances` mostrava `disconnectionReasonCode: 401` com logout/refusa de sessao
- no `connectionState`, a instancia podia aparecer como `close` logo depois do ciclo recusado

Conclusao operacional:

- o gargalo atual nao esta mais no Caddy, frontend, BFF ou API interna
- o problema esta no ciclo de pareamento da sessao dentro da Evolution / WhatsApp Web
- hoje a producao consegue gerar QR e receber webhook, mas nao consegue estabilizar a instancia em `open`

O que fazer a partir daqui:

- sempre escanear apenas o QR mais recente, logo apos clicar em `Conectar por QR`
- evitar insistir em QR antigo quando o painel entrar em `refused` ou mandar regenerar sessao
- se a instancia continuar repetindo `connecting -> refused`, aplicar reset mais forte: logout completo e, se necessario, delete/recreate da instancia na Evolution
- se o loop continuar mesmo apos recreate, revisar compatibilidade da versao da Evolution / Baileys / `CONFIG_SESSION_PHONE_VERSION` em producao

### 7.7 Reset forte automatico no `/tenant/whatsapp/connect`

Em 2026-03-19 o backend foi ajustado para nao depender mais apenas de `logout/connect` quando a sessao da Evolution entra em estado quebrado.

Correcao aplicada:

- o `EvolutionClient` passou a suportar `DELETE /instance/delete/{instance}`
- `POST /tenant/whatsapp/connect` agora detecta e aplica reset forte quando a instancia:
  - entra em `refused`
  - cai para `close` depois de `disconnectionReasonCode: 401`
  - desaparece da Evolution (`404` / instancia ausente)
- o reset forte faz:
  - `logout` tolerando `400/404`
  - `delete` da instancia na Evolution
  - limpeza do cache de QR no Redis
  - limpeza do cooldown de `connect`
  - recreate da instancia com o mesmo nome
  - reconfiguracao do webhook
  - novo `connect` para gerar QR limpo

Validacao feita em producao:

- `POST https://app.whenthelightsdie.com/api/bff/tenant/whatsapp/connect` respondeu `200`
- a resposta voltou com `hardResetApplied: true`
- o motivo detectado foi `hardResetReason: "disconnection_401"`
- a instancia `root-wa` foi recriada com `instanceId` novo
- o `fetchInstances` da Evolution voltou sem `disconnectionReasonCode`
- o QR voltou com `count: 1`, confirmando sessao zerada

Estado esperado depois dessa correcao:

- quando a Evolution entrar no ciclo `connecting -> refused/close` por sessao quebrada, o backend deve se auto-recuperar
- o painel deve receber QR de uma sessao realmente nova, e nao de uma instancia antiga reaproveitada
- se ainda falhar apos isso, o proximo suspeito passa a ser compatibilidade/pareamento do lado Evolution/WhatsApp Web, nao mais sessao stale local

### 7.8 WhatsApp conectado, mas a inbox ainda sem mensagens antigas

Depois que o WhatsApp conecta com sucesso, ainda existe uma diferenca importante entre:

- sessao conectada no provider
- conversas criadas localmente
- historico de mensagens realmente backfillado

No fluxo atual do produto:

- a inbox chama `POST /conversations/sync-open` em background para criar/atualizar conversas a partir dos chats abertos na Evolution
- ao abrir uma conversa, o front chama `POST /conversations/:conversationId/messages/sync-history` em background para buscar historico dessa conversa
- isso significa que conectar o WhatsApp nao importa automaticamente todo o historico de todas as conversas de uma vez

Interpretacao pratica:

- se o painel mostrar `connected/open`, isso confirma a sessao viva
- se a lista de conversas ainda vier vazia, pode ser que o `sync-open` ainda nao tenha encontrado chats elegiveis ou ainda nao tenha rodado com `createdCount/updatedCount > 0`
- se a conversa existe mas o historico antigo ainda nao apareceu, o backfill depende do `sync-history` daquela conversa
- mensagens novas recebidas depois da conexao devem entrar pelo webhook normal (`MESSAGES_UPSERT`)

Checklist para esse caso:

- abrir a inbox apos a conexao e aguardar a primeira sincronizacao em background
- validar `POST /conversations/sync-open` e observar `createdCount` / `updatedCount`
- abrir uma conversa e validar `POST /conversations/:conversationId/messages/sync-history`
- conferir `processedCount` / `createdCount` no retorno do sync-history
- enviar ou receber uma mensagem nova de teste para validar o caminho realtime/webhook

Conclusao:

- isso nao indica necessariamente falta de configuracao de deploy
- hoje, na maior parte dos casos, esse sintoma aponta mais para comportamento de sincronizacao/backfill do que para infraestrutura

### 7.9 Validacao real de sync-open e sync-history em producao

Em `2026-03-19`, com a instancia `root-wa` ja conectada, foi feita uma validacao real dos dois fluxos pelo BFF autenticado.

Resultado do `sync-open`:

- `POST https://app.whenthelightsdie.com/api/bff/conversations/sync-open` respondeu `200`
- retorno observado:
  - `instanceName: "root-wa"`
  - `fetchedChatsCount: 342`
  - `selectedChatsCount: 120`
  - `createdCount: 0`
  - `updatedCount: 0`
  - `skippedCount: 120`
  - `totalConversationsAfterSync: 120`

Leitura correta desse resultado:

- o fluxo existe e esta funcionando em producao
- ele nao precisou de codigo novo para "passar a existir" na VPS
- nesse momento especifico ele apenas nao criou novas conversas porque as `120` ja estavam localmente sincronizadas

Resultado do `sync-history`:

- conversa validada: `cmmxi15bl0015n526okahvihv`
- antes do backfill, o endpoint de mensagens dessa conversa ainda mostrava so as mensagens mais recentes
- `POST https://app.whenthelightsdie.com/api/bff/conversations/cmmxi15bl0015n526okahvihv/messages/sync-history` respondeu `200`
- retorno observado:
  - `fetchedCount: 300`
  - `selectedCount: 300`
  - `queryVariant: "where.key+offset"`
  - `processedCount: 300`
  - `createdCount: 298`
  - `deduplicatedCount: 2`
  - `failedCount: 0`
- depois disso, a mesma conversa passou a expor mensagens antigas do dia anterior e `hasMore: true`

Conclusao pratica:

- `sync-open` ja esta operacional em producao
- `sync-history` ja esta operacional em producao
- o problema nao e "programar tudo de novo para a VPS"
- o trabalho real agora e validar, ajustar edge cases do provider e transformar esses fluxos em checklist/smoke test de go-live

### 7.10 Smoke test outbound automatizado no grupo Maico

Em `2026-03-19`, foi ajustado o script `apps/api/src/scripts/media-battery.ts` para ele poder usar uma conversa real ja existente, em vez de sempre criar uma conversa sandbox.

Variaveis novas suportadas pelo script:

- `BATTERY_CONVERSATION_ID`
- `BATTERY_EXISTING_EXTERNAL_ID`
- `BATTERY_EXISTING_CONTACT_NAME`
- `BATTERY_LABEL_PREFIX`

Comando de referencia para producao:

```bash
cd /opt/omnichannel/apps/api
API_BASE_URL=https://api.whenthelightsdie.com \
BATTERY_TENANT_SLUG=root \
BATTERY_EMAIL=root@core.local \
BATTERY_PASSWORD='a8375e84b6295c51ea910f22' \
BATTERY_EXISTING_EXTERNAL_ID='554284138129-1623170425@g.us' \
BATTERY_LABEL_PREFIX="Prod smoke $(date -Iseconds)" \
npm run test:media:battery
```

Resultado validado no grupo `Maico 😎😎`:

- conversa alvo: `cmmxiaiwc005fn526qf4gold2`
- `TEXT`: `SENT`
- `IMAGE`: `SENT`
- `VIDEO`: `SENT`
- `AUDIO`: `SENT`
- `DOCUMENT`: `SENT`

Mensagens de referencia geradas nesta validacao:

- `cmmxj56tn02o1n5261f3aose8` (`TEXT`)
- `cmmxj58jw02o4n526upvk1hzg` (`IMAGE`)
- `cmmxj5aad02o7n526per8t4y6` (`VIDEO`)
- `cmmxj5c1s02oan5268cxm4579` (`AUDIO`)
- `cmmxj5dv902odn5260h5fe6s7` (`DOCUMENT`)

Leitura correta desse teste:

- o pipeline outbound do painel/API/worker/Evolution esta funcional para texto e midias
- isso nao substitui a validacao manual de inbound
- o proximo passo manual e testar, do celular para o sistema, envio de imagem, documento, audio e video para confirmar recepcao, armazenamento e renderizacao

## 8. Checklist de go-live e o que ainda falta

### 8.1 Checklist real do ambiente atual

Para considerar o ambiente realmente operacional, o minimo hoje e:

- `https://api.whenthelightsdie.com/health` responder `200`
- `https://app.whenthelightsdie.com/admin/login` responder `200`
- todos os containers criticos estarem `Up`: `web`, `api`, `worker`, `platform-core`, `postgres`, `redis`, `evolution`, `caddy`
- login admin funcionar com a credencial documentada
- o WhatsApp ficar `connected/open` no painel e no celular
- a inbox criar/atualizar conversas via `sync-open`
- ao abrir uma conversa, o `sync-history` conseguir backfillar mensagens quando houver historico disponivel na Evolution
- validar pelo menos um teste inbound e um outbound reais
- worker e retention-worker sem crash loop
- backup, firewall e operacao basica da VPS estarem definidos

### 8.2 O que ainda precisa ser feito depois desta estabilizacao

Mesmo com o painel funcional, ainda faltam melhorias para um deploy de producao mais limpo:

- migrar `api`, `worker` e `retention-worker` para imagens de producao reais, em vez de `npm run dev` / `tsx watch`
- remover bind mounts de codigo-fonte em producao e usar artefatos de build prontos
- corrigir no codigo do `platform-core` o bug do rate limit quando `RedisURL` estiver vazio
- criar um script oficial de bootstrap/reset da senha do root do `platform-core`, para nao depender de ajuste manual em SQL
- idealmente prebuildar a imagem do `web` em vez de reconstruir o Nuxt a cada recriacao do container
- sempre fazer hard refresh (`Ctrl+F5`) ou usar aba anonima apos mudar o runtime do frontend, para evitar cache antigo de assets do Vite
- opcionalmente expor no Admin um botao explicito de `reset completo da instancia WhatsApp`, mesmo com o reset automatico ja ativo no backend
- revisar a estrategia de versao da Evolution em producao, incluindo `CONFIG_SESSION_PHONE_VERSION`, quando o pareamento continuar falhando mesmo com QR novo

### 8.3 Isso e retrabalho ou problema de arquitetura?

A leitura correta, com base no que foi validado no codigo e na VPS, e:

- nao parece que o projeto foi "feito errado" por existir localmente e exigir validacao em producao
- o que apareceu foi uma falta de paridade e de homologacao real entre ambiente local e ambiente com Evolution/WhatsApp rodando de verdade
- varias capacidades ja estavam prontas no codigo antes desta rodada:
  - `sync-open` no backend e disparo automatico no front
  - `sync-history` no backend e disparo automatico ao abrir conversa
  - outbound de `TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT` e `AUDIO`
  - parsing webhook para inbound de texto e midia

O que faltou foi endurecimento de produto/deploy:

- uma rotina oficial de smoke test para `connect -> sync-open -> sync-history -> send text -> receive text -> send media -> receive media`
- ambiente de homologacao ou staging mais proximo da VPS real
- menos servicos rodando em modo dev na stack de producao
- uma checklist de go-live obrigatoria antes de considerar um canal "pronto"

Sequencia recomendada daqui para frente:

- primeiro validar texto outbound e inbound em producao
- depois validar imagem, documento, audio e video outbound
- depois validar recepcao de imagem, documento, audio e video
- por ultimo validar eventos de leitura, delete-for-all, reconnect e restart da stack

Meta correta:

- nao reescrever cada feature na producao
- fechar uma vez cada fluxo fim a fim, documentar, automatizar smoke tests e reaproveitar esse playbook nas proximas subidas

---

## 9. Troubleshooting

### Platform-core devolvendo `429` imediatamente no login
Se `POST /core/auth/login` devolver `429` logo na primeira tentativa, suspeite de `CORE_REDIS_URL` ausente.

Checklist:

```bash
docker inspect omnichannel-mvp-platform-core-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep CORE_REDIS_URL
```

Se estiver vazio, garantir no compose/base:

```yaml
CORE_REDIS_URL: ${CORE_REDIS_URL:-${REDIS_URL:-redis://redis:6379}}
```

Depois recriar o servico:

```bash
cd /opt/omnichannel
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d --force-recreate platform-core
```

### Login retornando `401` mesmo com senha "certa"
Verificar se a senha documentada do root realmente bate com a senha armazenada no `platform-core`.

Pontos que precisam estar coerentes:

- `docs/deploy-vps.md` (credenciais)
- `.env.prod` (`CORE_API_PASSWORD`)
- tabela `platform_core.users`

Se a documentacao e o banco divergirem, o painel pode falhar e a API interna tambem.

### Caddy não emitiu SSL
```bash
docker compose logs caddy | grep -E "error|Error|certificate"
# Causa mais comum: DNS não propagou — verificar com nslookup
nslookup app.SEU_DOMINIO 8.8.8.8
```

### Worker em crash loop após mudança de schema
```bash
docker compose exec worker npm run prisma:generate
docker compose restart worker
```

### Mensagens presas em PENDING
```bash
# Ver se o worker está rodando:
docker compose logs worker --tail=20

# Verificar log de alerta de PENDING presos:
docker compose logs worker | grep STALE_PENDING
```

### Rate limit travado no login (429 Too Many Requests)
O rate limiter é armazenado no **Redis** — reiniciar o platform-core não resolve.
```bash
# Limpar chaves de rate limit do login:
docker exec omnichannel-mvp-redis-1 redis-cli DEL \
  'rate-limit:auth.login.ip:172.18.0.7' \
  'rate-limit:bff.auth.login:unknown' \
  'rate-limit:auth.login.credential:auto:root@core.local:172.18.0.7'

# Verificar se limpou:
docker exec omnichannel-mvp-redis-1 redis-cli KEYS '*rate*'
```

Se quiser reset completo da cadeia de login:

```bash
docker exec omnichannel-mvp-redis-1 redis-cli --scan --pattern 'rate-limit:*' | xargs -r docker exec -i omnichannel-mvp-redis-1 redis-cli DEL
docker restart omnichannel-mvp-web-1 omnichannel-mvp-api-1 omnichannel-mvp-platform-core-1
```

### Painel com `502`, `@vite/client`, `/_nuxt/@fs` ou `virtual:nuxt`
Isso indica que o frontend provavelmente subiu em `nuxt dev` em vez de runtime de producao.

Verificar o HTML:

```bash
curl -s https://app.SEU_DOMINIO.com/admin/login | grep -E '@vite|/_nuxt/@fs|virtual:nuxt'
```

Se aparecer qualquer um desses termos:

- conferir se `.env.prod` tem `WEB_PRODUCTION_MODE=1`
- recriar o `web`
- aguardar o `nuxt build` terminar antes de testar de novo

Comandos:

```bash
cd /opt/omnichannel
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod rm -sf web
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod up -d web
docker logs -f omnichannel-mvp-web-1
```

Quando estiver pronto, o log esperado termina com algo parecido com:

```text
Build complete!
Listening on http://0.0.0.0:3000
```

### Inbox com `404` em `/tenant/whatsapp/status` ou `/conversations/sync-open`
Se a inbox abrir, mas o navegador mostrar `404` nesses endpoints, nao assuma que a rota sumiu.

Checklist:

- confirmar no log do `api` se a rota esta sendo chamada normalmente
- verificar se o tenant tem instancia local registrada
- verificar se a Evolution realmente possui a instancia criada

Exemplo util:

```bash
docker exec omnichannel-mvp-evolution-1 sh -lc "curl -s -H 'apikey: $AUTHENTICATION_API_KEY' http://127.0.0.1:8080/instance/fetchInstances"
```

Se vier `[]`, a Evolution ainda nao tem nenhuma instancia criada.

Interpretacao correta:

- a configuracao local do tenant pode existir
- mas a instancia real ainda nao foi bootstrapada na Evolution

Estado esperado apos a correcao aplicada em 2026-03-18:

- `/tenant/whatsapp/status` responde `200` com `configured: false`
- `/conversations/sync-open` responde `204` sem erro de rede

Para ativar de fato o canal, executar o fluxo do Admin para configurar/bootstrapar o WhatsApp.

### QR Code com `404` ou bootstrap com `409` usando `demo-instance`
Se `qrcode` voltar `404` e o bootstrap travar com `409`, suspeite de placeholder legado com nome generico repetido entre tenants.

Checklist:

- verificar se a Evolution ainda nao tem a instancia criada
- verificar se mais de um tenant ficou com `demo-instance`
- confirmar se o tenant atual esta reaproveitando uma instancia placeholder local

Sinais tipicos:

- `GET /tenant/whatsapp/qrcode` devolve `404` antes do bootstrap
- `POST /tenant/whatsapp/bootstrap` devolve `409`
- `GET /tenant/whatsapp/qrcode?force=false` continua tentando reconnect como se `force=true`
- `select id, slug, "whatsappInstance" from "Tenant"` mostra mais de um tenant com `demo-instance`

Estado esperado apos a correcao aplicada em 2026-03-18:

- `GET /tenant/whatsapp/qrcode` responde `200` com `configured: false` enquanto a instancia ainda nao existe na Evolution
- o bootstrap reaproveitando placeholder legado pode renomear automaticamente para `<tenant-slug>-wa`
- `force=false` deixa de disparar reconnect e passa a respeitar o valor real da query string
- depois do bootstrap, `status` e `qrcode` passam a responder `200`

### Inbox mostrando alerta gigante e dashboard vazio sem WhatsApp conectado
Se a inbox mostrar um alerta amarelo ocupando quase toda a tela e, ao mesmo tempo, deixar a estrutura de chat renderizada abaixo, o problema e de layout/estado do frontend.

Checklist:

- verificar se o componente ainda renderiza `chat-page__dashboard` quando `isWhatsAppConnected = false`
- verificar se `.chat-page` ainda usa grid com `grid-template-rows: auto minmax(0, 1fr)`
- confirmar se o tenant esta em estado `connecting`, `close`, `disconnected` ou sem instancia configurada

Estado esperado apos a correcao aplicada em 2026-03-18:

- o alerta fica com altura natural
- sem conexao ativa, a inbox mostra apenas o aviso
- o dashboard volta a ser renderizado somente quando o WhatsApp estiver conectado

### QR aparece no painel, mas o WhatsApp diz que nao foi possivel conectar o dispositivo
Se o painel mostrar QR, mas o app WhatsApp recusar o pareamento, suspeite de sessao recusada na Evolution e QR stale em cache.

Checklist:

- verificar no log da Evolution se apareceu `QR code limit reached, please login again`
- verificar se o `connection.update` entrou em `state: refused`
- confirmar se o painel ainda esta exibindo QR de uma tentativa anterior

Estado esperado apos a correcao aplicada em 2026-03-18:

- o backend nao reaproveita QR de cache quando a instancia esta em `refused`
- `Conectar por QR` reseta a sessao recusada antes de pedir novo codigo
- o painel passa a orientar reset/regeneracao em vez de insistir num QR invalido

Se mesmo assim continuar falhando em 2026-03-19:

- verificar `docker logs omnichannel-mvp-evolution-1 --tail 120` e procurar por `QR code limit reached, please login again`
- verificar `curl http://127.0.0.1:8080/instance/fetchInstances -H 'apikey: ...'` e confirmar se a instancia ficou em `connecting` com `disconnectionReasonCode: 401`
- verificar `curl http://127.0.0.1:8080/instance/connectionState/NOME_DA_INSTANCIA -H 'apikey: ...'` e confirmar se o estado caiu para `close` ou `refused`
- confirmar se `POST /api/bff/tenant/whatsapp/connect` voltou com `hardResetApplied: true` e recriou a instancia
- se mesmo apos o reset forte automatico a conexao continuar falhando, o problema deixa de ser cache/sessao stale no nosso backend e passa a indicar incompatibilidade do lado Evolution/WhatsApp Web

### Menu/admin preso em `Cliente #1` ou sessao parcial apos restart
Se depois de restart, hot reload ou mudanca de deploy o usuario aparecer "logado" mas sem acesso real, suspeite de dessintonia entre `auth`, `core-auth` e `session-simulation`.

Checklist:

- verificar se apenas um dos stores de autenticacao continuou hidratado
- verificar se o middleware ainda deixou a rota carregar mesmo com sessao parcial
- confirmar se o `session-simulation` recriou fallback local sem cliente real

Estado esperado apos a correcao aplicada em 2026-03-18:

- mismatch entre `auth` e `core-auth` derruba a sessao inteira
- respostas `401` limpam tambem o estado de simulacao
- o frontend volta para `/admin/login` em vez de exibir `Cliente #1` sem contexto valido

### Banco de dados
```bash
# Acessar o banco diretamente:
docker compose exec postgres psql -U omnichannel omnichannel

# Rodar migration manualmente:
docker compose exec api npx prisma migrate deploy
```

### Memória insuficiente durante build
```bash
# Verificar swap ativo:
free -h
# Se swap = 0, reativar:
swapon /swapfile
```

## 10. Infraestrutura Atual

| Item | Valor |
|------|-------|
| VPS IP | `85.31.62.33` |
| Domínio | `whenthelightsdie.com` |
| Frontend | `https://app.whenthelightsdie.com` |
| API | `https://api.whenthelightsdie.com` |
| Evolution API | `https://evo.whenthelightsdie.com` |
| OS | Ubuntu 24.04 LTS |
| RAM | 7.8GB |
| Disco | 96GB |
| CPUs | 2 |
| Diretório deploy | `/opt/omnichannel` |
