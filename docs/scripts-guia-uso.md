# Guia de Scripts de Otimização & Monitoramento

## 📂 Estrutura de Scripts

```
scripts/
├── startup.sh              # Inicializar sistema com validações
├── monitor-containers.sh   # Monitorar saúde contínua
├── health-check.sh         # Testar conectividade de endpoints
├── docker-stats.sh         # Métricas de recursos
├── logs/
│   ├── container-monitor.log
│   └── metrics/
│       ├── metrics_*.json
│       └── report_*.txt
```

---

## 🚀 STARTUP.SH - Inicialização Otimizada

Inicia o sistema de forma segura com validações completas.

### Uso Básico

```bash
# Inicialição normal
./scripts/startup.sh

# Forçar rebuild
./scripts/startup.sh --rebuild

# Limpeza completa + rebuild
./scripts/startup.sh --force --rebuild
```

### O que faz:

1. ✅ Verifica Docker/Docker Compose
2. ✅ Valida arquivo .env
3. ✅ Prepara volumes
4. ✅ Valida docker-compose.yml
5. ✅ Build de imagens
6. ✅ Inicia containers
7. ✅ Aguarda health checks
8. ✅ Testa conectividade
9. ✅ Gera relatório

### Saída esperada:

```
ℹ️  Docker encontrado: Docker version 24.0.0
✅ Docker Compose encontrado: v2.20.0
✅ Arquivo de configuração encontrado
...
🎉 Inicialização concluída com sucesso!

Acessar aplicações:
  • Web (Nuxt):     http://localhost:3000
  • API (Fastify):  http://localhost:4000
  • Core (Go):      http://localhost:4100
```

---

## 📊 MONITOR-CONTAINERS.SH - Monitoramento Contínuo

Monitora saúde dos containers e reinicia automaticamente quando necessário.

### Uso

```bash
# Modo contínuo (verifica a cada 30 segundos)
./scripts/monitor-containers.sh

# Verificação única
./scripts/monitor-containers.sh once

# Com intervalo customizado
CHECK_INTERVAL=60 ./scripts/monitor-containers.sh

# Com webhook de alerta (Slack/Discord)
ALERT_WEBHOOK="https://hooks.slack.com/..." ./scripts/monitor-containers.sh
```

### Saída esperada:

```
═══════════════════════════════════════════════════════════════
Container Health Monitor - 2026-03-13 10:30:45
═══════════════════════════════════════════════════════════════

Checando postgres... ✅ Saudável
  └─ CPU: 2.34% | Memory: 512M / 2G
Checando redis... ✅ Saudável
Checando api... ✅ Saudável
  └─ CPU: 45.67% | Memory: 256M / 1G
Checando platform-core... ✅ Saudável
Checando worker... ✅ Saudável
Checando web... ✅ Saudável
```

### O que monitora:

- ✅ Container rodando ou parado
- ✅ Health check status
- ✅ Uso de CPU e memória
- ✅ Reinicia automaticamente se unhealthy
- ✅ Registra em arquivo de log
- ✅ Envia alertas (opcional)

### Setup para rodar continuamente (systemd)

```bash
# Criar arquivo de serviço
sudo tee /etc/systemd/system/omni-monitor.service > /dev/null << EOF
[Unit]
Description=Omnichannel Monitor
After=docker.service

[Service]
WorkingDirectory=/path/to/project
ExecStart=/bin/bash scripts/monitor-containers.sh
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

# Habilitar e iniciar
sudo systemctl enable omni-monitor.service
sudo systemctl start omni-monitor.service
```

---

## 🩺 HEALTH-CHECK.SH - Verificação de Saúde

Testa todos os endpoints e serviços da aplicação.

### Uso

```bash
# Verificação completa
./scripts/health-check.sh

# Com URLs customizadas
API_URL=https://api.prod.com ./scripts/health-check.sh
WEB_URL=https://app.prod.com ./scripts/health-check.sh
```

### Saída esperada:

```
╔════════════════════════════════════════════════════════════╗
║          HEALTH CHECK - 2026-03-13 10:30:45              ║
╚════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════
HTTP ENDPOINTS
═══════════════════════════════════════════════════════════════

Checando API Health... ✅ OK
Checando API Ready... ✅ OK
Checando Core API... ✅ OK
Checando Web App... ✅ OK

═══════════════════════════════════════════════════════════════
SERVIÇOS TCP
═══════════════════════════════════════════════════════════════

Checando PostgreSQL... ✅ OK
Checando Redis... ✅ OK

═══════════════════════════════════════════════════════════════
RESUMO
═══════════════════════════════════════════════════════════════

✅ Todos os serviços estão saudáveis!
  Passaram: 7/7
```

### Variáveis customizáveis:

```bash
API_URL="http://localhost:4000"      # Endpoint da API
CORE_URL="http://localhost:4100"     # Endpoint do Core
WEB_URL="http://localhost:3000"      # Endpoint Web
DB_HOST="localhost"                  # Host do PostgreSQL
DB_PORT="5432"                       # Porta PostgreSQL
REDIS_HOST="localhost"               # Host Redis
TIMEOUT="5"                          # Timeout em segundos
```

---

## 📈 DOCKER-STATS.SH - Métricas de Recursos

Monitora uso de CPU, memória, rede e armazenamento.

### Uso

```bash
# Monitorar em tempo real (5s intervalo, 5min duração)
./scripts/docker-stats.sh monitor

# Customizar intervalo e duração
INTERVAL=10 DURATION=600 ./scripts/docker-stats.sh monitor

# Coletar snapshot em JSON
./scripts/docker-stats.sh collect
# Salva em: logs/metrics/metrics_20260313_101045.json

# Gerar relatório completo
./scripts/docker-stats.sh report
# Salva em: logs/metrics/report_20260313_101045.txt

# Alertar sobre recursos críticos
./scripts/docker-stats.sh critical
```

### Saída - Monitoramento em tempo real:

```
╔════════════════════════════════════════════════════════════════════╗
║                 DOCKER RESOURCES MONITOR                          ║
║                 2026-03-13 10:30:45                               ║
╚════════════════════════════════════════════════════════════════════╝

╔ CONTAINERS RODANDO ════════════════════════════════════════════════╗
NAME                 IMAGE                    STATUS
omnichannel-postgres container_postgres       Up 10 minutes
omnichannel-redis    redis:7-alpine           Up 10 minutes
omnichannel-api      node:22-alpine           Up 9 minutes

╔ MÉTRICAS DE RECURSOS ══════════════════════════════════════════════╗

CONTAINER            CPU %     MEM USAGE / LIMIT  NET I/O      BLOCK I/O
postgres             2.34%     512M / 1.5G        5.2MB / 1MB  10MB / 5MB
redis                0.45%     45M / 512M         100KB / 50KB 0B / 0B
api                  45.67%    256M / 1G          50MB / 100MB 0B / 0B
```

### Saída - Alertas críticos:

```
⚠️  CPU crítica em api: 95%
⚠️  Memória crítica em postgres: 87%
```

---

## 📋 CHECKLIST - IMPLEMENTAÇÃO DE OTIMIZAÇÕES

Use este checklist para garantir que todas as otimizações foram aplicadas.

### ✅ Fase 1: Limites de Recursos (HOJE)

- [ ] Adicionar `deploy.resources.limits` ao docker-compose.prod.yml
  - [ ] PostgreSQL: `cpus: 1.5`, `memory: 1.5G`
  - [ ] Redis: `cpus: 0.5`, `memory: 512M`
  - [ ] API: `cpus: 1`, `memory: 1G`
  - [ ] Platform-core: `cpus: 1`, `memory: 512M`
  - [ ] Workers: `cpus: 0.5-1`, `memory: 512M`
  - [ ] Web: `cpus: 1`, `memory: 512M`
  - [ ] Evolution: `cpus: 2`, `memory: 1G`

- [ ] Adicionar `deploy.resources.reservations` para garantir recursos mínimos

- [ ] Testar aplicação com limites
  ```bash
  docker-compose -f docker-compose.prod.yml up
  ```

### ✅ Fase 2: Health Checks (Esta semana)

- [ ] Adicionar health check ao `postgres`
- [ ] Adicionar health check ao `redis`
- [ ] Adicionar health check ao `api`
- [ ] Adicionar health check ao `platform-core`
- [ ] Adicionar health check ao `worker`
- [ ] Adicionar health check ao `web`
- [ ] Adicionar health check ao `evolution`

- [ ] Testar health checks
  ```bash
  docker-compose ps  # Deve mostrar "healthy"
  ```

### ✅ Fase 3: Políticas de Restart (Esta semana)

- [ ] Adicionar `restart: unless-stopped` a todos serviços
- [ ] Testar restart automático
  ```bash
  docker kill omnichannel-api
  docker-compose ps  # API deve estar "Up"
  ```

### ✅ Fase 4: Otimizações Node.js (Esta semana)

- [ ] Definir `NODE_OPTIONS` adequadamente:
  - [ ] API: `--max-old-space-size=512`
  - [ ] Web: `--max-old-space-size=512` (reduzido de 1024)
  - [ ] Workers: `--max-old-space-size=256-512`

- [ ] Adicionar flags de otimização:
  ```
  --max-semi-space-size=256
  --initial-old-space-size=256
  --use-strict-mode
  ```

### ✅ Fase 5: Redis Configuração (Esta semana)

- [ ] Mudar `maxmemory-policy` de `noeviction` para `allkeys-lru`
- [ ] Aumentar `maxmemory` para `512MB` em prod
- [ ] Habilitar AOF (append-only file):
  ```yaml
  command:
    - --appendonly yes
    - --appendfsync everysec
  ```

- [ ] Testar Redis
  ```bash
  docker-compose exec redis redis-cli info memory
  # used_memory < maxmemory
  ```

### ✅ Fase 6: Dockerfiles Multi-stage (Esta semana)

- [ ] Criar `Dockerfile.prod` para API
  - [ ] Stage builder
  - [ ] Stage prod
  - [ ] Stage worker
  - [ ] Stage retention

- [ ] Criar `Dockerfile.prod` para Nuxt Web
  - [ ] Build com `npm run build`
  - [ ] Runtime compacto

- [ ] Testar builds
  ```bash
  docker build -f apps/api/Dockerfile.prod -t api:prod .
  ```

### ✅ Fase 7: Scripts de Monitoramento (Esta semana)

- [ ] Tornar scripts executáveis
  ```bash
  chmod +x scripts/*.sh
  ```

- [ ] Testar startup.sh
  ```bash
  ./scripts/startup.sh
  ```

- [ ] Testar monitor-containers.sh
  ```bash
  ./scripts/monitor-containers.sh once
  ```

- [ ] Testar health-check.sh
  ```bash
  ./scripts/health-check.sh
  ```

- [ ] Testar docker-stats.sh
  ```bash
  ./scripts/docker-stats.sh collect
  ```

### ✅ Fase 8: Logging & Observabilidade (Próximas 2 semanas)

- [ ] Configurar logging driver JSON para containers
  ```yaml
  logging:
    driver: "json-file"
    options:
      max-size: "50m"
      max-file: "5"
  ```

- [ ] Implementar Prometheus (opcional)
  ```bash
  docker run -d prom/prometheus
  ```

- [ ] Implementar Grafana (opcional)
  ```bash
  docker run -d grafana/grafana
  ```

---

## 📊 MATRIZ DE RECURSOS - RECOMENDADO

### Desenvolvimento (Máquina Local)

```yaml
PostgreSQL:  1.5G RAM,  1.5 CPU  (limite total)
Redis:       256M  RAM, 0.5 CPU
API:         512M  RAM, 1.0 CPU
Web:         512M  RAM, 1.0 CPU
Workers:     512M  RAM, 1.0 CPU
--------------------------------
Total:       ~3.5GB    ~5 CPU
```

**Máquina mínima:** 4GB RAM, 2-4 CPU cores

### Produção Tier 1 - MVP (até 10 clientes)

```yaml
PostgreSQL:  1.5G RAM,  1.5 CPU
Redis:       512M  RAM, 0.5 CPU
API:         1.0G  RAM, 1.0 CPU
Core:        512M  RAM, 0.5 CPU
Workers:     512M  RAM, 1.0 CPU
Web:         512M  RAM, 1.0 CPU
Evolution:   1.0G  RAM, 1.0 CPU (opcional)
--------------------------------
Total:       ~6.5GB    ~6 CPUs
```

**VPS mínima:** 8GB RAM, 4 vCores

### Produção Tier 2 - Escalável (até 50 clientes)

```yaml
PostgreSQL:  3.0G RAM,  2.0 CPU
Redis:       1.0G  RAM, 1.0 CPU
API (x2):    2.0G  RAM, 2.0 CPU
Core:        1.0G  RAM, 1.0 CPU
Workers (x2):1.0G  RAM, 2.0 CPU
Web:         1.0G  RAM, 1.0 CPU
Evolution:   2.0G  RAM, 2.0 CPU
--------------------------------
Total:       ~11GB      ~11 CPUs
```

**VPS recomendada:** 16GB RAM, 8 vCores

---

## 🔍 VERIFICAÇÃO PASSO-A-PASSO

Após aplicar otimizações:

### 1. Verificar limites

```bash
docker inspect omnichannel-api | grep MemoryLimit
# Deve retornar valor (ex: 1073741824 = 1GB)
```

### 2. Verificar health

```bash
docker-compose ps
# Deve mostrar todas com "(healthy)" ou apenas "Up"
```

### 3. Testar carga

```bash
# Simular 10 requisições
for i in {1..10}; do
  curl -s http://localhost:4000/health &
done
wait
echo "Teste de carga concluído"
```

### 4. Monitorar recursos

```bash
./scripts/docker-stats.sh critical
# Não deve haver avisos de CPU/Memória crítica
```

### 5. Verificar logs

```bash
docker-compose logs --tail=50
# Não deve haver erros de OOM ou "container exited"
```

---

## 🎯 PRÓXIMAS AÇÕES

1. **Imediato:** Aplicar limites de recursos (30min)
2. **Hoje:** Adicionar health checks (1h)
3. **Esta semana:** Implementar scripts (2h)
4. **Próximas 2 semanas:** Monitoramento (4h)
5. **Produção:** Aplicar todos os ajustes (Go-live)

