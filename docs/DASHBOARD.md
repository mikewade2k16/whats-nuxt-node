# ðŸ“Š Dashboard de Monitoramento - Guia de Uso

## VisÃ£o Geral

O Dashboard de Monitoramento Ã© uma interface integrada no painel Nuxt que permite visualizar e controlar os containers Docker em tempo real, diretamente da aplicaÃ§Ã£o, **sem necessidade de acessar o terminal ou Docker Desktop**.

## âœ… O que foi criado

### 1. **Componentes Nuxt**
- `apps/painel-web/app/components/Admin/ContainerMonitor.vue` - Componente principal com monitoring
- `apps/painel-web/app/pages/admin.vue` - Layout base do painel admin
- `apps/painel-web/app/pages/admin/containers.vue` - PÃ¡gina de containers
- `apps/painel-web/app/pages/admin/logs.vue` - PÃ¡gina de logs consolidados
- `apps/painel-web/app/pages/admin/health.vue` - PÃ¡gina de health check

### 2. **Composable TypeScript**
- `apps/painel-web/app/composables/useAdminApi.ts` - AbstraÃ§Ã£o de APIs de admin

### 3. **API Backend**
- `apps/atendimento-online-api/src/routes/admin.ts` - 8 endpoints para monitoramento e controle
- Integrado em `apps/atendimento-online-api/src/main.ts`

### 4. **Docker Compose**
- `docker-compose.dev.yml` - ConfiguraÃ§Ã£o otimizada para Windows

## ðŸš€ Como colocar no ar

### Passo 1: Construir e iniciar os containers

```bash
# Navegue atÃ© a raiz do projeto
cd c:\Users\Mike\Documents\Projects\whats-test

# Inicie com a configuraÃ§Ã£o de desenvolvimento (otimizada para Windows)
docker-compose -f docker-compose.dev.yml up -d

# Ou, se preferir usar produÃ§Ã£o
docker-compose -f docker-compose.prod.yml up -d
```

### Passo 2: Acessar o Dashboard

1. Abra o navegador em: **http://localhost:3000/admin/containers**
2. VocÃª verÃ¡ o dashboard com:
   - âœ… Status de todos os containers
   - ðŸ“Š Uso de CPU e MemÃ³ria em tempo real
   - ðŸŽ¯ BotÃµes de controle (Restart, Stop, Logs)

### Passo 3: Usar as funcionalidades

#### ðŸ“Š **Monitoramento de Containers**
- Acesse: `/admin/containers`
- Veja em tempo real:
  - Status (Up, Exited, etc)
  - CPU % de cada container
  - Uso de MemÃ³ria
  - Status de saÃºde (Healthy/Unhealthy)

#### ðŸ”„ **Controlar Containers**
- **Restart**: Reinicia o container (Ãºtil para recarga de cÃ³digo)
- **Stop**: Para o container
- **Logs**: Visualiza os Ãºltimos 100 logs do container

#### ðŸ“‹ **Logs Consolidados**
- Acesse: `/admin/logs`
- Filtre por container especÃ­fico
- Ajuste nÃºmero de linhas (10-1000)
- Auto-refresh a cada 5 segundos
- Copie logs para clipboard

#### â¤ï¸ **Health Check**
- Acesse: `/admin/health`
- Veja saÃºde de todos os serviÃ§os
- HistÃ³rico das Ãºltimas 20 verificaÃ§Ãµes
- Status geral do sistema

## ðŸ“ˆ Recursos

### Monitoramento em Tempo Real
- **AtualizaÃ§Ã£o automÃ¡tica**: A cada 30 segundos
- **Polling via HTTP**: Sem necessidade de WebSocket
- **MÃ©tricas por container**:
  - CPU %
  - Memory (formato: `256M / 1G`)
  - Status
  - Health Check

### Sistema Stats
- CPU Cores disponÃ­veis
- Total de RAM
- RAM disponÃ­vel
- Percentual de uso da RAM
- Platform (Linux/Windows/macOS)
- Uptime do sistema

### Controle de Containers
Todos os endpoints POST requerem autenticaÃ§Ã£o (jÃ¡ integrado via `authPlugin` do Fastify):

```bash
# Exemplos de curl (local, sem autenticaÃ§Ã£o em dev)
curl -X POST http://localhost:4000/api/admin/container/api/restart
curl -X POST http://localhost:4000/api/admin/container/web/stop
curl -X POST http://localhost:4000/api/admin/container/postgres/start
```

## ðŸ”§ Endpoints de API

Todos os endpoints estÃ£o sob `/api/admin`:

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/api/admin/containers` | Lista todos os containers + stats do sistema |
| GET | `/api/admin/container/:name/stats` | Stats de um container especÃ­fico |
| GET | `/api/admin/container/:name/logs?tail=50` | Logs de um container |
| POST | `/api/admin/container/:name/restart` | Reinicia container |
| POST | `/api/admin/container/:name/stop` | Para container |
| POST | `/api/admin/container/:name/start` | Inicia container |
| GET | `/api/admin/system` | Stats do sistema |
| GET | `/health` | Health check bÃ¡sico |

## ðŸ› ï¸ Troubleshooting

### "Containers nÃ£o aparecem no dashboard"
1. Certifique-se que os containers estÃ£o rodando: `docker ps`
2. Verifique se a API estÃ¡ online: `curl http://localhost:4000/health`
3. Verifique o console do navegador para erros

### "CPU/Memory mostra 0%"
- Em alguns ambientes, `docker stats` pode nÃ£o estar disponÃ­vel
- Neste caso, implemente fallback usando `docker inspect`
- Veja opÃ§Ãµes em `apps/atendimento-online-api/src/routes/admin.ts:getContainerStats()`

### "Buttons nÃ£o funcionam"
1. Verifique logs da API: `docker logs api`
2. Certifique-se que Docker CLI estÃ¡ disponÃ­vel: `docker --version`
3. Verifique permissÃµes do container para acessar docker socket

### "Docker Desktop continua travando"
- Use `docker-compose.dev.yml` com configuraÃ§Ã£o otimizada
- Reduza memory limits se necessÃ¡rio
- Compare com `docker-compose.prod.yml`

## ðŸ“± Responsive Design

O Dashboard Ã© otimizado para:
- âœ… Desktop (1920x1080+)
- âœ… Tablet (iPad)
- âœ… Mobile (via sidebar colapsÃ¡vel - pode ser implementado)

## ðŸ” SeguranÃ§a

### Em Desenvolvimento
- Endpoints de admin estÃ£o **disponÃ­veis sem autenticaÃ§Ã£o**
- Ãštil para desenvolvimento local

### Em ProduÃ§Ã£o
- **IMPORTANTE**: Adicione verificaÃ§Ã£o de autenticaÃ§Ã£o
- Modifique `apps/atendimento-online-api/src/routes/admin.ts` para verificar:
```typescript
app.post('/api/admin/container/:name/restart', async (request, reply) => {
  // Adicione verificaÃ§Ã£o de admin:
  if (!request.user?.isAdmin) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
  // ... resto do cÃ³digo
})
```

- Ou use Fastify hooks para verificaÃ§Ã£o global:
```typescript
app.register(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })
  
  registerAdminRoutes(fastify)
})
```

## ðŸ“Š Docker Compose Dev vs Prod

### docker-compose.dev.yml (Windows Development)
```yaml
# Otimizado para Windows Docker Desktop
API:
  cpus: '2'
  memory: '1.5G'  # Reduzido para nÃ£o travar
  NODE_ENV: development
  volumes: live mount com hot-reload

Web:
  cpus: '2'
  memory: '1G'    # Reduzido para dev
  NODE_ENV: development
```

### docker-compose.prod.yml (Production)
```yaml
# ConfiguraÃ§Ã£o em produÃ§Ã£o
API:
  cpus: '2'
  memory: '2G'    # Mais generoso
  NODE_ENV: production
  restart: always
  health checks strictos

Web:
  cpus: '2'
  memory: '1.5G'
  NODE_ENV: production
```

## ðŸŽ¯ PrÃ³ximos Passos

### Melhorias Opcionais
1. **Socket.io em tempo real** - Substitua polling por push de eventos
2. **GrÃ¡ficos de histÃ³rico** - Use Chart.js ou similar para mostrar tendÃªncias
3. **Alertas automÃ¡ticos** - Notifique quando memÃ³ria > 80%
4. **AutenticaÃ§Ã£o de painel** - Restrinja acesso a usuÃ¡rios admin
5. **Docker stats avanÃ§ado** - Mostrar network I/O, disk usage
6. **Terminal interativo** - Execute comandos no container via UI
7. **Exportar mÃ©tricas** - Prometheus/Grafana integration

### ImplementaÃ§Ã£o RÃ¡pida de Melhorias

#### 1. Real-time com Socket.io
```typescript
// No admin.ts
io.on('admin-subscribe', (socket) => {
  setInterval(() => {
    const stats = getContainerStats()
    socket.emit('container-stats', stats)
  }, 5000)
})

// No componente Vue
onMounted(() => {
  io.emit('admin-subscribe')
  io.on('container-stats', (data) => {
    containers.value = data
  })
})
```

#### 2. GrÃ¡ficos com Chart.js
```bash
npm install chart.js vue-chartjs
```

```vue
<script setup>
import { LineChart } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js'

const cpuHistory = ref([...])
</script>
```

## ðŸ“š Arquivos Modificados

```
ðŸ“¦ apps/
 â”œâ”€â”€ ðŸ”§ api/src/main.ts (ADD: import + register admin routes)
 â”œâ”€â”€ ðŸ“ api/src/routes/admin.ts (NEW: 8 endpoints)
 â””â”€â”€ ðŸ”§ painel-web/
     â”œâ”€â”€ app/components/Admin/ContainerMonitor.vue (NEW)
     â”œâ”€â”€ app/composables/useAdminApi.ts (NEW)
     â””â”€â”€ app/pages/admin/
         â”œâ”€â”€ admin.vue (NEW)
         â”œâ”€â”€ containers.vue (NEW)
         â”œâ”€â”€ logs.vue (NEW)
         â””â”€â”€ health.vue (NEW)

ðŸ³ docker-compose.dev.yml (NEW)
```

## ðŸ’¡ Dicas

1. **Desenvolva mais rÃ¡pido**: Com o dashboard, vocÃª nÃ£o precisa abrir terminal para reiniciar containers
2. **Monitore em tempo real**: Veja imediatamente o impacto de mudanÃ§as no cÃ³digo
3. **DÃ©bug facilitado**: Acesse logs diretamente da UI
4. **Menos context switching**: Tudo dentro da aplicaÃ§Ã£o

## ðŸŽ¬ Quick Start

```bash
# Inicie tudo
docker-compose -f docker-compose.dev.yml up -d

# Navegue para o painel
# http://localhost:3000/admin/containers

# Pronto! Monitore e controle seus containers
```

---

**Desenvolvido para melhorar a experiÃªncia de desenvolvimento local! ðŸš€**
