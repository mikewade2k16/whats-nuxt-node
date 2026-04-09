# DiagnÃƒÂ³stico e OtimizaÃƒÂ§ÃƒÂ£o de Infraestrutura - Docker & Containers

**Data**: 13 de MarÃƒÂ§o, 2026  
**Status**: CRÃƒÂTICO - Containers caindo e travando frequentemente

---

## Ã°Å¸â€œÅ  ESTADO ATUAL DA INFRAESTRUTURA

### ServiÃƒÂ§os em ExecuÃƒÂ§ÃƒÂ£o
```
1. postgres:16-alpine          (PostgreSQL Database)
2. redis:7-alpine              (Cache/Message Queue)
3. api                         (Node.js Backend - Fastify)
4. plataforma-api               (Go Backend)
5. worker                      (Node.js - Processamento de fila)
6. retention-worker            (Node.js - Limpeza de dados)
7. web                         (Nuxt.js 4 - Frontend)
8. evolution-api               (WhatsApp Integration)
9. adminer                     (DB Admin - Ops apenas)
10. redis-commander            (Redis Admin - Ops apenas)
```

### Armazenamento de Dados
- **postgres_data**: Banco de dados principal (Postgres)
- **redis_data**: Cache e filas
- **evolution_instances**: ConfiguraÃƒÂ§ÃƒÂ£o de instÃƒÂ¢ncias WhatsApp
- **node_modules volumes**: DependÃƒÂªncias (api, worker, retention, web)

---

## Ã°Å¸Å¡Â¨ GARGALOS CRÃƒÂTICOS IDENTIFICADOS

### 1. **FALTA DE LIMITES DE RECURSOS (CRÃƒÂTICO)**
| ServiÃƒÂ§o | CPU Atual | MemÃƒÂ³ria Atual | Status |
|---------|-----------|---------------|--------|
| PostgreSQL | Ilimitado | Ilimitado | Ã¢Å¡Â Ã¯Â¸Â Pode consumir toda RAM |
| Redis | Ilimitado | 256MB mÃƒÂ¡x | Ã¢Å¡Â Ã¯Â¸Â Sem limite de container |
| API | Ilimitado | 768MB Node | Ã¢Å¡Â Ã¯Â¸Â Pode crescer sem controle |
| Web | Ilimitado | 1024MB Node | Ã°Å¸â€Â´ **MUY ALTO** para dev |
| Worker | Ilimitado | 384MB Node | Ã¢Å¡Â Ã¯Â¸Â Processamento pesado |
| Retention | Ilimitado | 256MB Node | Ã¢Å¡Â Ã¯Â¸Â Sem limite real |
| plataforma-api | Ilimitado | Sem limite | Ã¢Å¡Â Ã¯Â¸Â Go sem controle |
| Evolution | Ilimitado | Sem limite | Ã°Å¸â€Â´ **MUITO PESADO** |

**Resultado**: Um serviÃƒÂ§o pode consumir toda RAM disponÃƒÂ­vel, matando os outros.

### 2. **HEALTH CHECKS INCOMPLETOS**
```
Ã¢Å“â€¦ PostgreSQL: Tem healthcheck
Ã¢Å“â€¦ Redis: Tem healthcheck
Ã¢ÂÅ’ API: SEM healthcheck
Ã¢ÂÅ’ Worker: SEM healthcheck
Ã¢ÂÅ’ Retention-worker: SEM healthcheck
Ã¢ÂÅ’ Web: SEM healthcheck
Ã¢ÂÅ’ plataforma-api: SEM healthcheck
Ã¢ÂÅ’ Evolution: SEM healthcheck
```

**Problema**: Containers podem estar "vivos" mas nÃƒÂ£o processando. Docker nÃƒÂ£o sabe.

### 3. **NODE.JS MAL CONFIGURADO**
- **Web (Nuxt)**: `--max-old-space-size=1024` (1GB!) - Para desenvolvimento!
- **API**: `--max-old-space-size=768` - Sem limit de OutOfMemory
- **Workers**: Global de 384MB/256MB - Pode fazer garbage collection pesado
- **Sem flags de otimizaÃƒÂ§ÃƒÂ£o**:
  - `--use-strict-mode`: Detectar bugs mais cedo
  - `--max-semi-space-size`: Otimizar GC
  - `--initial-old-space-size`: PrÃƒÂ©-alocar memÃƒÂ³ria

### 4. **POSTGRES SEM CONFIGURAÃƒâ€¡ÃƒÆ’O**
```sql
-- Faltam estas configuraÃƒÂ§ÃƒÂµes:
max_connections = 100              -- Sem limite, cresce sempre
shared_buffers = 25% RAM           -- Sem especificaÃƒÂ§ÃƒÂ£o
effective_cache_size = 75% RAM     -- Sem especificaÃƒÂ§ÃƒÂ£o
work_mem = 5MB                     -- Default perigoso
maintenance_work_mem = 10MB        -- Default baixo
```

**Resultado**: Performance pÃƒÂ©ssima e travamentos.

### 5. **REDIS COM POLÃƒÂTICA PERIGOSA**
```yaml
maxmemory-policy: noeviction  # Ã°Å¸â€Â´ CRÃƒÂTICO!
```

**Problema**: Quando atinge 256MB, rejeita TODAS as operaÃƒÂ§ÃƒÂµes = API cai!

**Alternativas**:
- `allkeys-lru`: Remove chaves menos usadas
- `allkeys-lfu`: Remove baseado em frequÃƒÂªncia
- `volatile-lru`: Remove chaves com TTL

### 6. **WORKERS RODANDO EM DESENVOLVIMENTO**
```dockerfile
# API: tsx watch (recarga no cÃƒÂ³digo)
# Workers: tsx watch (recarga no cÃƒÂ³digo)
# Web: npm run dev (nÃƒÂ£o compilado, interpretado)
```

**Problema**: Interpretado ÃƒÂ© 10-50x mais lento que compilado!

### 7. **DOCKER COMPOSE PARA DEV + PROD**
- Volumes montados diretamente (dev)
- DependÃƒÂªncias reinstaladas toda vez
- Sem separaÃƒÂ§ÃƒÂ£o de ambientes
- Profile "channels" para Evolution (confuso)

### 8. **FALTA DE MONITORING/LOGGING**
- Sem logs centralizados
- Sem mÃƒÂ©tricas
- Sem alertas
- ImpossÃƒÂ­vel debugar problemas

### 9. **EVOLUTION API - SUPER PESADA**
```
- Imagem enorme (pode ter 500MB+)
- Salva tudo em PostgreSQL (muitos writes)
- Sem cache estratÃƒÂ©gico
- Cada instÃƒÂ¢ncia = mais consumo
```

### 10. **BANCO DE DADOS NÃƒÆ’O OTIMIZADO**
- Sem ÃƒÂ­ndices nas queries pesadas
- Sem particionamento
- Sem vacuuming automÃƒÂ¡tico
- Sem connection pooling

---

## Ã°Å¸â€œË† ESCALABILIDADE ATUAL

| MÃƒÂ©trica | Valor Atual | MÃƒÂ¡ximo Recomendado | Status |
|---------|------------|-------------------|--------|
| ConexÃƒÂµes DB | Sem limite | MÃƒÂ¡x 100 (dev) | Ã°Å¸â€Â´ CrÃƒÂ­tico |
| Cache RAM | 256MB | AjustÃƒÂ¡vel | Ã¢Å¡Â Ã¯Â¸Â Baixo |
| Node Heap | 768-1024MB | VariÃƒÂ¡vel | Ã°Å¸â€Â´ Alto |
| InstÃƒÂ¢ncias WhatsApp | 1-5 | Sem controle | Ã¢Å¡Â Ã¯Â¸Â Perigoso |
| Processa de Fila | 1 worker | Pode escalar | Ã¢Å¡Â Ã¯Â¸Â Engargalamento |

---

## Ã°Å¸Å½Â¯ PONTOS CRÃƒÂTICOS - PRIORIDADE

### Ã°Å¸â€Â´ CRÃƒÂTICO (Implementar HOJE)
1. **Adicionar limites CPU/MemÃƒÂ³ria** a TODOS containers
2. **Health checks** em todos serviÃƒÂ§os
3. **Restart policy** adequada
4. **Redis maxmemory-policy** mudar para `allkeys-lru`
5. **Otimizar Node.js** com flags de produÃƒÂ§ÃƒÂ£o

### Ã°Å¸Å¸Â  ALTA PRIORIDADE (Esta semana)
1. Separar dev/prod docker-compose
2. Otimizar Dockerfile para multi-stage
3. Adicionar logging estruturado
4. Connection pooling PostgreSQL
5. Otimizar queries pesadas

### Ã°Å¸Å¸Â¡ MÃƒâ€°DIO (PrÃƒÂ³ximas sprints)
1. Implementar Prometheus + Grafana
2. Adicionar Circuit Breakers
3. Rate limiting
4. Caching estratÃƒÂ©gico
5. Database replication (backup)

---

## Ã°Å¸â€™Â¾ ESPECIFICAÃƒâ€¡ÃƒÆ’O MÃƒÂNIMA - VPS PARA COMEÃƒâ€¡O

### **Tier 1: MVP/Teste (1-10 clientes)**
```
CPU:          2 vCores (Intel i5 equivalente)
RAM:          4 GB
Storage:      50 GB SSD
Banda:        500 Mbps
Estimado:     R$ 50-100/mÃƒÂªs
OS:           Linux (Ubuntu 24.04 LTS)

AlocaÃƒÂ§ÃƒÂ£o:
- PostgreSQL:    1.5 GB RAM fixed
- Redis:         256 MB RAM
- API:           512 MB RAM
- plataforma-api: 256 MB RAM
- Workers (2):   512 MB RAM total
- Web:           256 MB RAM
- Evolution:     256 MB RAM
- Sistema:       ~500 MB
Total:           4 GB (ajustado)
```

**LimitaÃƒÂ§ÃƒÂµes**:
- MÃƒÂ¡x 5-10 instÃƒÂ¢ncias WhatsApp
- MÃƒÂ¡x 100 usuÃƒÂ¡rios simultÃƒÂ¢neos
- MÃƒÂ¡x 1000 mensagens/hora

---

### **Tier 2: ProduÃƒÂ§ÃƒÂ£o Leve (10-50 clientes)**
```
CPU:          4 vCores (Intel i7 equivalente)
RAM:          8 GB
Storage:      100 GB SSD
Banda:        1 Gbps
Estimado:     R$ 200-350/mÃƒÂªs
OS:           Linux (Ubuntu 24.04 LTS)

AlocaÃƒÂ§ÃƒÂ£o:
- PostgreSQL:     3 GB RAM fixed + cache
- Redis:          512 MB RAM
- API (2x):       1 GB RAM
- plataforma-api:  512 MB RAM
- Workers (2):    1 GB RAM
- Web:            512 MB RAM
- Evolution:      512 MB RAM
- Sistema:        ~500 MB
Total:            8 GB
```

**Melhorias**:
- ReplicaÃƒÂ§ÃƒÂ£o PostgreSQL (backup)
- Multi-instance workers
- Caching em camadas
- Rate limiting ativo

---

### **Tier 3: ProduÃƒÂ§ÃƒÂ£o EscalÃƒÂ¡vel (50+ clientes)**
```
CPU:          8+ vCores
RAM:          16-32 GB
Storage:      500+ GB SSD/NVME
Banda:        2+ Gbps
Estimado:     R$ 500-1500+/mÃƒÂªs
Infraestrutura: Load Balancer, Multi-server
```

**Setup**:
- PostgreSQL separado (prÃƒÂ³prio servidor)
- Redis Cluster
- API em mÃƒÂºltiplos containers
- Workers distribuÃƒÂ­dos
- Evolution em container separado
- Monitoramento completo

---

## Ã°Å¸â€Â§ RECOMENDAÃƒâ€¡Ãƒâ€¢ES IMEDIATAS

### 1. Limites de Recursos (Dockerfile/docker-compose)
```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1.5G

  redis:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 2. Health Checks Completos
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 30s
```

### 3. OtimizaÃƒÂ§ÃƒÂ£o Node.js
```bash
NODE_OPTIONS="--max-old-space-size=512 \
              --max-semi-space-size=256 \
              --initial-old-space-size=256 \
              --use-strict-mode"
```

### 4. Redis PolÃƒÂ­tica
```yaml
command:
  - redis-server
  - --maxmemory-policy
  - allkeys-lru  # Ao invÃƒÂ©s de noeviction
```

### 5. PostgreSQL Pool
```javascript
// No pool connection:
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000,
```

### 6. Scripts de Restart AutomÃƒÂ¡tico
```bash
# restart-container.sh - Monitora e reinicia
docker-compose ps | grep -v "Up" | grep api && \
  docker-compose restart api
```

---

## Ã°Å¸â€œâ€¹ CHECKLIST DE IMPLEMENTAÃƒâ€¡ÃƒÆ’O

### Fase 1: Estabilizar (Hoje - 3 dias)
- [ ] Adicionar limites CPU/Memory
- [ ] Adicionar health checks
- [ ] Otimizar Node.js flags
- [ ] Mudar Redis policy
- [ ] Implementar restart script

### Fase 2: Otimizar (Esta semana)
- [ ] Separar dev/prod docker-compose
- [ ] Multi-stage Dockerfile
- [ ] Connection pooling
- [ ] Logging estruturado
- [ ] Database indexing

### Fase 3: Monitorar (PrÃƒÂ³ximas 2 semanas)
- [ ] Prometheus + Grafana
- [ ] ELK Stack (Elasticsearch/Logstash/Kibana)
- [ ] Alert manager
- [ ] Performance baselines

---

## Ã°Å¸Å½Â¯ MÃƒâ€°TRICAS PARA ACOMPANHAR

ApÃƒÂ³s as otimizaÃƒÂ§ÃƒÂµes:

| MÃƒÂ©trica | Antes | Depois | Meta |
|---------|-------|--------|------|
| Memory Peak | > 6GB | < 4GB | < 3GB |
| Container Crashes/dia | 5-10 | < 1 | 0 |
| API Response Time | > 2s | < 500ms | < 200ms |
| Database Connections | VariÃƒÂ¡vel | 20-30 | < 20 |
| Uptime | < 90% | > 99% | > 99.5% |

---

## Ã°Å¸Å¡â‚¬ PRÃƒâ€œXIMOS PASSOS

1. **HOJE**: Implementar docker-compose otimizado com limites
2. **AMANHÃƒÆ’**: Criar scripts de restart automÃƒÂ¡tico e monitoramento
3. **Esta semana**: Separar dev/prod, adicionar logging
4. **PrÃƒÂ³xima sprint**: Implementar Prometheus + Grafana
5. **ProduÃƒÂ§ÃƒÂ£o**: Usar Tier 2 com todas otimizaÃƒÂ§ÃƒÂµes aplicadas

---

## Ã°Å¸â€œÅ¾ CONTATO & SUPORTE

Para implementar estas otimizaÃƒÂ§ÃƒÂµes:
- DocumentaÃƒÂ§ÃƒÂ£o de cada serviÃƒÂ§o em `docs/`
- Scripts de monitoramento em `scripts/`
- Docker-compose otimizado pronto para uso
- Guia de troubleshooting anexado

**Estimativa**: 3-5 horas de implementaÃƒÂ§ÃƒÂ£o para estabilizar
**Resultado**: Sistema robusto, escalÃƒÂ¡vel e pronto para produÃƒÂ§ÃƒÂ£o

