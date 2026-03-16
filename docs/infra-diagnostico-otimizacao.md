# Diagnóstico e Otimização de Infraestrutura - Docker & Containers

**Data**: 13 de Março, 2026  
**Status**: CRÍTICO - Containers caindo e travando frequentemente

---

## 📊 ESTADO ATUAL DA INFRAESTRUTURA

### Serviços em Execução
```
1. postgres:16-alpine          (PostgreSQL Database)
2. redis:7-alpine              (Cache/Message Queue)
3. api                         (Node.js Backend - Fastify)
4. platform-core               (Go Backend)
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
- **evolution_instances**: Configuração de instâncias WhatsApp
- **node_modules volumes**: Dependências (api, worker, retention, web)

---

## 🚨 GARGALOS CRÍTICOS IDENTIFICADOS

### 1. **FALTA DE LIMITES DE RECURSOS (CRÍTICO)**
| Serviço | CPU Atual | Memória Atual | Status |
|---------|-----------|---------------|--------|
| PostgreSQL | Ilimitado | Ilimitado | ⚠️ Pode consumir toda RAM |
| Redis | Ilimitado | 256MB máx | ⚠️ Sem limite de container |
| API | Ilimitado | 768MB Node | ⚠️ Pode crescer sem controle |
| Web | Ilimitado | 1024MB Node | 🔴 **MUY ALTO** para dev |
| Worker | Ilimitado | 384MB Node | ⚠️ Processamento pesado |
| Retention | Ilimitado | 256MB Node | ⚠️ Sem limite real |
| Platform-core | Ilimitado | Sem limite | ⚠️ Go sem controle |
| Evolution | Ilimitado | Sem limite | 🔴 **MUITO PESADO** |

**Resultado**: Um serviço pode consumir toda RAM disponível, matando os outros.

### 2. **HEALTH CHECKS INCOMPLETOS**
```
✅ PostgreSQL: Tem healthcheck
✅ Redis: Tem healthcheck
❌ API: SEM healthcheck
❌ Worker: SEM healthcheck
❌ Retention-worker: SEM healthcheck
❌ Web: SEM healthcheck
❌ Platform-core: SEM healthcheck
❌ Evolution: SEM healthcheck
```

**Problema**: Containers podem estar "vivos" mas não processando. Docker não sabe.

### 3. **NODE.JS MAL CONFIGURADO**
- **Web (Nuxt)**: `--max-old-space-size=1024` (1GB!) - Para desenvolvimento!
- **API**: `--max-old-space-size=768` - Sem limit de OutOfMemory
- **Workers**: Global de 384MB/256MB - Pode fazer garbage collection pesado
- **Sem flags de otimização**:
  - `--use-strict-mode`: Detectar bugs mais cedo
  - `--max-semi-space-size`: Otimizar GC
  - `--initial-old-space-size`: Pré-alocar memória

### 4. **POSTGRES SEM CONFIGURAÇÃO**
```sql
-- Faltam estas configurações:
max_connections = 100              -- Sem limite, cresce sempre
shared_buffers = 25% RAM           -- Sem especificação
effective_cache_size = 75% RAM     -- Sem especificação
work_mem = 5MB                     -- Default perigoso
maintenance_work_mem = 10MB        -- Default baixo
```

**Resultado**: Performance péssima e travamentos.

### 5. **REDIS COM POLÍTICA PERIGOSA**
```yaml
maxmemory-policy: noeviction  # 🔴 CRÍTICO!
```

**Problema**: Quando atinge 256MB, rejeita TODAS as operações = API cai!

**Alternativas**:
- `allkeys-lru`: Remove chaves menos usadas
- `allkeys-lfu`: Remove baseado em frequência
- `volatile-lru`: Remove chaves com TTL

### 6. **WORKERS RODANDO EM DESENVOLVIMENTO**
```dockerfile
# API: tsx watch (recarga no código)
# Workers: tsx watch (recarga no código)
# Web: npm run dev (não compilado, interpretado)
```

**Problema**: Interpretado é 10-50x mais lento que compilado!

### 7. **DOCKER COMPOSE PARA DEV + PROD**
- Volumes montados diretamente (dev)
- Dependências reinstaladas toda vez
- Sem separação de ambientes
- Profile "channels" para Evolution (confuso)

### 8. **FALTA DE MONITORING/LOGGING**
- Sem logs centralizados
- Sem métricas
- Sem alertas
- Impossível debugar problemas

### 9. **EVOLUTION API - SUPER PESADA**
```
- Imagem enorme (pode ter 500MB+)
- Salva tudo em PostgreSQL (muitos writes)
- Sem cache estratégico
- Cada instância = mais consumo
```

### 10. **BANCO DE DADOS NÃO OTIMIZADO**
- Sem índices nas queries pesadas
- Sem particionamento
- Sem vacuuming automático
- Sem connection pooling

---

## 📈 ESCALABILIDADE ATUAL

| Métrica | Valor Atual | Máximo Recomendado | Status |
|---------|------------|-------------------|--------|
| Conexões DB | Sem limite | Máx 100 (dev) | 🔴 Crítico |
| Cache RAM | 256MB | Ajustável | ⚠️ Baixo |
| Node Heap | 768-1024MB | Variável | 🔴 Alto |
| Instâncias WhatsApp | 1-5 | Sem controle | ⚠️ Perigoso |
| Processa de Fila | 1 worker | Pode escalar | ⚠️ Engargalamento |

---

## 🎯 PONTOS CRÍTICOS - PRIORIDADE

### 🔴 CRÍTICO (Implementar HOJE)
1. **Adicionar limites CPU/Memória** a TODOS containers
2. **Health checks** em todos serviços
3. **Restart policy** adequada
4. **Redis maxmemory-policy** mudar para `allkeys-lru`
5. **Otimizar Node.js** com flags de produção

### 🟠 ALTA PRIORIDADE (Esta semana)
1. Separar dev/prod docker-compose
2. Otimizar Dockerfile para multi-stage
3. Adicionar logging estruturado
4. Connection pooling PostgreSQL
5. Otimizar queries pesadas

### 🟡 MÉDIO (Próximas sprints)
1. Implementar Prometheus + Grafana
2. Adicionar Circuit Breakers
3. Rate limiting
4. Caching estratégico
5. Database replication (backup)

---

## 💾 ESPECIFICAÇÃO MÍNIMA - VPS PARA COMEÇO

### **Tier 1: MVP/Teste (1-10 clientes)**
```
CPU:          2 vCores (Intel i5 equivalente)
RAM:          4 GB
Storage:      50 GB SSD
Banda:        500 Mbps
Estimado:     R$ 50-100/mês
OS:           Linux (Ubuntu 24.04 LTS)

Alocação:
- PostgreSQL:    1.5 GB RAM fixed
- Redis:         256 MB RAM
- API:           512 MB RAM
- Platform-core: 256 MB RAM
- Workers (2):   512 MB RAM total
- Web:           256 MB RAM
- Evolution:     256 MB RAM
- Sistema:       ~500 MB
Total:           4 GB (ajustado)
```

**Limitações**:
- Máx 5-10 instâncias WhatsApp
- Máx 100 usuários simultâneos
- Máx 1000 mensagens/hora

---

### **Tier 2: Produção Leve (10-50 clientes)**
```
CPU:          4 vCores (Intel i7 equivalente)
RAM:          8 GB
Storage:      100 GB SSD
Banda:        1 Gbps
Estimado:     R$ 200-350/mês
OS:           Linux (Ubuntu 24.04 LTS)

Alocação:
- PostgreSQL:     3 GB RAM fixed + cache
- Redis:          512 MB RAM
- API (2x):       1 GB RAM
- Platform-core:  512 MB RAM
- Workers (2):    1 GB RAM
- Web:            512 MB RAM
- Evolution:      512 MB RAM
- Sistema:        ~500 MB
Total:            8 GB
```

**Melhorias**:
- Replicação PostgreSQL (backup)
- Multi-instance workers
- Caching em camadas
- Rate limiting ativo

---

### **Tier 3: Produção Escalável (50+ clientes)**
```
CPU:          8+ vCores
RAM:          16-32 GB
Storage:      500+ GB SSD/NVME
Banda:        2+ Gbps
Estimado:     R$ 500-1500+/mês
Infraestrutura: Load Balancer, Multi-server
```

**Setup**:
- PostgreSQL separado (próprio servidor)
- Redis Cluster
- API em múltiplos containers
- Workers distribuídos
- Evolution em container separado
- Monitoramento completo

---

## 🔧 RECOMENDAÇÕES IMEDIATAS

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

### 3. Otimização Node.js
```bash
NODE_OPTIONS="--max-old-space-size=512 \
              --max-semi-space-size=256 \
              --initial-old-space-size=256 \
              --use-strict-mode"
```

### 4. Redis Política
```yaml
command:
  - redis-server
  - --maxmemory-policy
  - allkeys-lru  # Ao invés de noeviction
```

### 5. PostgreSQL Pool
```javascript
// No pool connection:
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000,
```

### 6. Scripts de Restart Automático
```bash
# restart-container.sh - Monitora e reinicia
docker-compose ps | grep -v "Up" | grep api && \
  docker-compose restart api
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

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

### Fase 3: Monitorar (Próximas 2 semanas)
- [ ] Prometheus + Grafana
- [ ] ELK Stack (Elasticsearch/Logstash/Kibana)
- [ ] Alert manager
- [ ] Performance baselines

---

## 🎯 MÉTRICAS PARA ACOMPANHAR

Após as otimizações:

| Métrica | Antes | Depois | Meta |
|---------|-------|--------|------|
| Memory Peak | > 6GB | < 4GB | < 3GB |
| Container Crashes/dia | 5-10 | < 1 | 0 |
| API Response Time | > 2s | < 500ms | < 200ms |
| Database Connections | Variável | 20-30 | < 20 |
| Uptime | < 90% | > 99% | > 99.5% |

---

## 🚀 PRÓXIMOS PASSOS

1. **HOJE**: Implementar docker-compose otimizado com limites
2. **AMANHÃ**: Criar scripts de restart automático e monitoramento
3. **Esta semana**: Separar dev/prod, adicionar logging
4. **Próxima sprint**: Implementar Prometheus + Grafana
5. **Produção**: Usar Tier 2 com todas otimizações aplicadas

---

## 📞 CONTATO & SUPORTE

Para implementar estas otimizações:
- Documentação de cada serviço em `docs/`
- Scripts de monitoramento em `scripts/`
- Docker-compose otimizado pronto para uso
- Guia de troubleshooting anexado

**Estimativa**: 3-5 horas de implementação para estabilizar
**Resultado**: Sistema robusto, escalável e pronto para produção

