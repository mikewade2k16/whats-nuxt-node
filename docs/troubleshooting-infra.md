## Fix Rapido - Docker travado (loop infinito ao parar/start)

Sintoma comum: Docker Desktop fica em `Stopping...` infinito e `docker ps`/`docker compose` travam por timeout.

Comando padrao (recomendado):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docker-recover.ps1
```

Se alterou codigo Go do `platform-core` e quer rebuild junto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docker-recover.ps1 -RebuildCore
```

Observacoes pendentes para tratar depois do destrave de infra:
- `nuxi prepare` no host Windows continua falhando por `oxc-transform` nativo; isso esta classificado como problema de ambiente local, nao como regressao funcional do painel.
- `npm run build` completo de `apps/api` continua falhando por um conjunto antigo de erros de tipagem/Prisma ja existentes no projeto; enquanto isso, validamos isoladamente os arquivos alterados neste sprint.

Fallback manual:

Passos de recuperacao (Windows + WSL):

```powershell
Get-Process | Where-Object { @('Docker Desktop','com.docker.backend','com.docker.proxy') -contains $_.ProcessName } | Stop-Process -Force
wsl --shutdown
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
```

Se o `Docker Desktop.exe` abrir mas o daemon continuar indisponivel (`docker version` travando) e o servico Windows continuar `Stopped`, usar o backend direto:

```powershell
Get-Process -Name "com.docker.backend" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "$env:ProgramFiles\Docker\Docker\resources\com.docker.backend.exe" `
  -ArgumentList "-accept-license","-unattended","-engine","WSL2","-with-frontend=false"
```

Validacao rapida:

```powershell
wsl -d docker-desktop -u root sh -lc "ps -ef | grep dockerd"
docker version
docker compose -f docker-compose.dev.yml ps
```

Sinal de recuperacao correta:
- `docker version` volta com `Server: Docker Desktop`
- `wsl -d docker-desktop` mostra `dockerd` rodando
- `docker compose ps` responde sem timeout

Depois, subir stack novamente:

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```

Se `platform-core` foi alterado no codigo Go, rebuild apenas dele:

```bash
docker compose -f docker-compose.dev.yml up -d --build platform-core
```
## Fix Rapido - Evolution Reiniciando (P1001 / sem WhatsApp conectado)

Sintoma comum apos trocar compose: container `evolution` em restart loop e mensagem "Nenhum WhatsApp conectado para este tenant".

Passos de recuperacao:

```bash
docker compose -f docker-compose.dev.yml down --remove-orphans
docker network prune -f
docker compose -f docker-compose.dev.yml up -d --build
```

Validar:

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs --tail=120 evolution
```

Se o erro mostrar `postgres:5432` inacessivel dentro da Evolution, o problema quase sempre e container orfao em rede antiga.

## Fix Rapido - Conversas diretas duplicadas (@lid vs @s.whatsapp.net)

Sintoma comum: a mesma pessoa aparece duas vezes na lista (uma conversa normal e outra vazia).

Dry-run:

```bash
docker compose -f docker-compose.dev.yml exec api npx tsx src/scripts/dedupe-direct-conversations.ts
```

Aplicar saneamento:

```bash
docker compose -f docker-compose.dev.yml exec api npm run fix:dedupe-direct-conversations
```

Observacao:
- O saneamento move mensagens/auditoria para a conversa canonica e remove duplicatas.
- A regra de prevencao agora grava conversa direta preferindo `@s.whatsapp.net`.
- O saneamento tambem remove conversa "sombra" vazia (mesmo nome/avatar da conversa real).

# Guia de Troubleshooting - Docker & Infraestrutura

## 📋 Índice Rápido
1. [Containers Caindo](#containers-caindo)
2. [Memória/CPU Alta](#memoriacpu-alta)
3. [Problemas de Conectividade](#problemas-de-conectividade)
4. [Performance Lenta](#performance-lenta)
5. [Banco de Dados](#banco-de-dados)
6. [Redis/Cache](#rediscache)
7. [Evolution API](#evolution-api)

---

## 🔴 CONTAINERS CAINDO

### Sintoma: Container reiniciando continuamente

```bash
docker-compose logs api
# Procurar por: "Exited with code 1" ou "Exit code 137" (OOM)
```

**Código 137 = Out of Memory (OOM)**
- Memória insuficiente
- Limite muito baixo

**Solução:**
```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 1G  # Aumentar se necessário
```

### Sintoma: Container saudável mas aplicação não responde

**Causa:** Sem health check adequado

**Solução:**
```bash
# Testar manualmente
docker-compose exec api curl http://localhost:4000/health

# Se retornar erro, verificar logs
docker-compose logs api --tail=50
```

### Sintoma: Todos os containers caem quando um cai

**Causa:** Dependências configuradas incorretamente

**Solução:**
```yaml
depends_on:
  postgres:
    condition: service_healthy  # ✅ Espera healthcheck
  redis:
    condition: service_ready    # ✅ Espera porta
```

---

## 💾 MEMÓRIA/CPU ALTA

### Diagnosticar uso de recursos

```bash
# Ver métricas em tempo real
docker stats --no-stream

# Ver limites
docker inspect container_name | grep -A 5 "MemoryLimit"

# Score de uso
./scripts/docker-stats.sh critical
```

### Node.js consumindo muita RAM

**Causa:** Garbage Collection ineficiente ou memory leak

**Verificar:**
```bash
# Ver processo Node
docker-compose exec api ps aux | grep node

# Verificar heap size
docker inspect container_name | grep NODE_OPTIONS
```

**Solução:**
```env
NODE_OPTIONS=--max-old-space-size=512 \
             --max-semi-space-size=256 \
             --initial-old-space-size=256 \
             --use-strict-mode
```

### PostgreSQL consumindo muita RAM

**Verificar conexões:**
```bash
docker-compose exec postgres psql -U omnichannel -d omnichannel \
  -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
```

**Limitar conexões:**
```bash
# postgres.conf em container
max_connections = 100
shared_buffers = 512MB
effective_cache_size = 2GB

# Ou via POSTGRES_INITDB_ARGS no compose
```

### Redis cheio (atingir maxmemory)

**Verificar:**
```bash
docker-compose exec redis redis-cli info memory
# Procurar por: used_memory vs maxmemory
```

**Problema:** `maxmemory-policy=noeviction`
- Retorna erro para TODAS as operações
- API cai com "Redis is full"

**Solução:**
```bash
# Mudar política
docker-compose exec redis redis-cli config set maxmemory-policy allkeys-lru

# Ou no compose:
command:
  - redis-server
  - --maxmemory-policy
  - "allkeys-lru"  # Remove automaticamente
```

---

## 🌐 PROBLEMAS DE CONECTIVIDADE

### API não consegue conectar ao Banco

**Verificar:**
```bash
# De dentro do container API
docker-compose exec api wget -O- http://postgres:5432/
# Não precisa responder, só verificar se conecta

# Verificar DNS
docker-compose exec api nslookup postgres

# Testar conexão direta
docker-compose exec api psql -h postgres -U omnichannel -d omnichannel -c "SELECT 1"
```

**Causas comuns:**
1. PostgreSQL não está saudável
2. Porta 5432 bloqueada
3. Credenciais incorretas

**Solução:**
```bash
# Aguardar postgres iniciar
docker-compose up -d postgres
docker-compose up -d --wait api  # Aguarda dependencies

# Verificar logs
docker-compose logs postgres | grep "ready"
```

### Frontend não consegue conectar ao API

**Verificar:**
```bash
# Do navegador
curl -v http://localhost:4000/health

# Do container web
docker-compose exec web curl http://api:4000/health

# Verificar URL configurada
docker-compose exec web cat /app/.env | grep NUXT_API
```

**Causa:** CORS bloqueado

**Verificar logs:**
```bash
docker-compose logs api | grep -i "cors\|origin"
```

**Solução:**
```env
CORS_ORIGIN=http://localhost:3000,http://api.dominio.com
```

### Evolution API não consegue salvar em banco

**Verificar:**
```bash
docker-compose logs evolution | grep -i "connection\|database\|error"

# Testar conexão direto
docker-compose exec evolution psql -c "SELECT 1"
```

---

## ⚡ PERFORMANCE LENTA

### API respondendo lentamente

**Diagnosticar:**
```bash
# Medir tempo de resposta
time curl http://localhost:4000/health

# Ver se é código ou IO
docker-compose exec api curl http://localhost:4000/debug/profile

# Checar CPU
docker stats api --no-stream
```

**Se CPU alta:**
- Alguma query SQL pesada
- Processamento de imagem/vídeo
- Muitos clientes simultâneos

**Verificar:**
```bash
docker-compose logs api | grep -i "slow\|took\|ms"
```

**Solução:**
```sql
-- Adicionar índices
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Verificar plano de execução
EXPLAIN ANALYZE SELECT ...;
```

### Web/Nuxt carregando lentamente

**Causa 1:** Buildando em dev

```javascript
// nuxt dev - lento! Use prod
// nuxt preview - melhor para testes
```

**Causa 2:** Muitas dependências

```bash
# Verificar tamanho
du -sh apps/omni-nuxt-ui/node_modules

# Limpar
npm ci --omit=dev
```

**Solução (docker-compose.prod):**
```dockerfile
# Build em prod
FROM base AS prod
RUN npm run build
CMD ["npm", "run", "preview"]  # Ou usar production server
```

### Redis lento

**Verificar:**
```bash
docker-compose exec redis redis-cli --latency
docker-compose exec redis redis-cli --latency-history

# Ver operações lentas
docker-compose exec redis redis-cli slowlog get 10
```

**Comum:** `maxmemory-policy=noeviction` com cache cheio

---

## 🗄️ BANCO DE DADOS

### PostgreSQL não inicia

**Verificar logs:**
```bash
docker-compose logs postgres
```

**Causas:**
1. Primeira inicialização - pode demorar minutos
2. Arquivo corrupto
3. Permissões de volume

**Solução:**
```bash
# Aguardar pacientemente
docker-compose logs postgres --follow

# Se corrupto, remover volume
docker-compose down -v
docker-compose up postgres

# Monitorar status
while true; do
  docker-compose exec -T postgres pg_isready && break
  sleep 5
done
```

### Conexões PostgreSQL travadas

**Verificar:**
```bash
docker-compose exec postgres psql -U omnichannel -d omnichannel \
  -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"
```

**Solução:**
```bash
# Matar conexão travada
docker-compose exec postgres psql -U omnichannel -d omnichannel \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid != pg_backend_pid();"
```

### Espaço em disco cheio

**Verificar:**
```bash
df -h
docker system df

# Volume específico
docker inspect postgres_data | grep Mountpoint
du -sh /var/lib/docker/volumes/..._postgres_data/_data
```

**Limpeza:**
```bash
# Remover logs antigos
docker-compose logs --tail=0 api

# Vacuuming
docker-compose exec postgres vacuum;
docker-compose exec postgres vacuum analyze;

# Remover backup WAL
docker-compose exec postgres rm -rf /var/lib/postgresql/data/pg_wal/*
```

---

## 🔴 REDIS/CACHE

### Redis rejeitando conexões

**Erro típico:**
```
CLUSTERDOWN The cluster is down
OOM command not allowed when used memory > 'maxmemory'
```

**Verificar:**
```bash
docker-compose exec redis redis-cli info memory
# Procurar: used_memory vs maxmemory

docker-compose exec redis redis-cli config get maxmemory-policy
# Deve ser: allkeys-lru (ou outro, não noeviction)
```

**Solução:**
```bash
# Aumentar limite
docker-compose exec redis redis-cli config set maxmemory 512mb

# Mudar política
docker-compose exec redis redis-cli config set maxmemory-policy allkeys-lru

# Salvar configuração
docker-compose exec redis redis-cli bgsave
```

### Dados desaparecendo de Redis

**Causa:** AOF/RDB desabilitado

**Verificar:**
```bash
docker-compose exec redis redis-cli config get save
docker-compose exec redis redis-cli config get appendonly
```

**Solução (prod):**
```yaml
command:
  - redis-server
  - --appendonly
  - "yes"
  - --appendfsync
  - "everysec"
```

---

## 🟢 EVOLUTION API

### Evolution não salva instâncias

**Verificar:**
```bash
docker-compose logs evolution | head -50
# Procurar: connection, database, error

# Volume
docker volume ls | grep evolution_instances
du -sh /var/lib/docker/volumes/.../evolution_instances/_data
```

### Evolution salva muitos dados

**Verificar:**
```bash
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(table_schema||'.'||table_name)) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(table_schema||'.'||table_name) DESC;
```

**Solução:**
```yaml
# docker-compose.prod.yml
environment:
  DATABASE_SAVE_DATA_HISTORIC: "false"  # Não salvar histórico
  DATABASE_SAVE_MESSAGE_UPDATE: "false" # Não salvar updates
```

---

## 🔧 FERRAMENTAS DE DEBUG

### Ver logs em tempo real

```bash
# Todos os serviços
docker-compose logs -f

# Apenas API
docker-compose logs -f api --tail=50

# Com grep
docker-compose logs api | grep -i "error\|warn"
```

### Entrar dentro de um container

```bash
docker-compose exec api sh
docker-compose exec api bash
docker-compose exec postgres psql -U omnichannel -d omnichannel
```

### Comparar health estado

```bash
docker-compose ps
docker-compose exec api curl http://localhost:4000/health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Monitorar em tempo real

```bash
# CPU/Memory
./scripts/docker-stats.sh monitor

# Health checks
./scripts/health-check.sh

# Eventos Docker
docker events --filter 'type=container'
```

---

## 🚨 EMERGÊNCIA - RESET COMPLETO

```bash
# ⚠️ DESTRUTIVO - Remove tudo

# Parar tudo
docker-compose down -v

# Remover volumes
docker volume prune -f

# Remover imagens não usadas
docker image prune -f

# Limpar sistema
docker system prune -f

# Reiniciar do zero
./scripts/startup.sh
```

---

## 📞 SUPORTE

Se o problema persistir:

1. **Coletar diagnóstico:**
   ```bash
   docker-compose ps > diagnosis.txt
   docker-compose logs > logs.txt
   docker stats --no-stream >> diagnosis.txt
   docker system df >> diagnosis.txt
   ```

2. **Enviar informações:**
   - Arquivo `logs.txt`
   - Arquivo `diagnosis.txt`
   - Arquivo `.env` (sem senhas!)
   - Descrição do problema



