# 📊 Dashboard de Monitoramento - Guia de Uso

## Visão Geral

O Dashboard de Monitoramento é uma interface integrada no painel Nuxt que permite visualizar e controlar os containers Docker em tempo real, diretamente da aplicação, **sem necessidade de acessar o terminal ou Docker Desktop**.

## ✅ O que foi criado

### 1. **Componentes Nuxt**
- `apps/omni-nuxt-ui/app/components/Admin/ContainerMonitor.vue` - Componente principal com monitoring
- `apps/omni-nuxt-ui/app/pages/admin.vue` - Layout base do painel admin
- `apps/omni-nuxt-ui/app/pages/admin/containers.vue` - Página de containers
- `apps/omni-nuxt-ui/app/pages/admin/logs.vue` - Página de logs consolidados
- `apps/omni-nuxt-ui/app/pages/admin/health.vue` - Página de health check

### 2. **Composable TypeScript**
- `apps/omni-nuxt-ui/app/composables/useAdminApi.ts` - Abstração de APIs de admin

### 3. **API Backend**
- `apps/api/src/routes/admin.ts` - 8 endpoints para monitoramento e controle
- Integrado em `apps/api/src/main.ts`

### 4. **Docker Compose**
- `docker-compose.dev.yml` - Configuração otimizada para Windows

## 🚀 Como colocar no ar

### Passo 1: Construir e iniciar os containers

```bash
# Navegue até a raiz do projeto
cd c:\Users\Mike\Documents\Projects\whats-test

# Inicie com a configuração de desenvolvimento (otimizada para Windows)
docker-compose -f docker-compose.dev.yml up -d

# Ou, se preferir usar produção
docker-compose -f docker-compose.prod.yml up -d
```

### Passo 2: Acessar o Dashboard

1. Abra o navegador em: **http://localhost:3000/admin/containers**
2. Você verá o dashboard com:
   - ✅ Status de todos os containers
   - 📊 Uso de CPU e Memória em tempo real
   - 🎯 Botões de controle (Restart, Stop, Logs)

### Passo 3: Usar as funcionalidades

#### 📊 **Monitoramento de Containers**
- Acesse: `/admin/containers`
- Veja em tempo real:
  - Status (Up, Exited, etc)
  - CPU % de cada container
  - Uso de Memória
  - Status de saúde (Healthy/Unhealthy)

#### 🔄 **Controlar Containers**
- **Restart**: Reinicia o container (útil para recarga de código)
- **Stop**: Para o container
- **Logs**: Visualiza os últimos 100 logs do container

#### 📋 **Logs Consolidados**
- Acesse: `/admin/logs`
- Filtre por container específico
- Ajuste número de linhas (10-1000)
- Auto-refresh a cada 5 segundos
- Copie logs para clipboard

#### ❤️ **Health Check**
- Acesse: `/admin/health`
- Veja saúde de todos os serviços
- Histórico das últimas 20 verificações
- Status geral do sistema

## 📈 Recursos

### Monitoramento em Tempo Real
- **Atualização automática**: A cada 30 segundos
- **Polling via HTTP**: Sem necessidade de WebSocket
- **Métricas por container**:
  - CPU %
  - Memory (formato: `256M / 1G`)
  - Status
  - Health Check

### Sistema Stats
- CPU Cores disponíveis
- Total de RAM
- RAM disponível
- Percentual de uso da RAM
- Platform (Linux/Windows/macOS)
- Uptime do sistema

### Controle de Containers
Todos os endpoints POST requerem autenticação (já integrado via `authPlugin` do Fastify):

```bash
# Exemplos de curl (local, sem autenticação em dev)
curl -X POST http://localhost:4000/api/admin/container/api/restart
curl -X POST http://localhost:4000/api/admin/container/web/stop
curl -X POST http://localhost:4000/api/admin/container/postgres/start
```

## 🔧 Endpoints de API

Todos os endpoints estão sob `/api/admin`:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/containers` | Lista todos os containers + stats do sistema |
| GET | `/api/admin/container/:name/stats` | Stats de um container específico |
| GET | `/api/admin/container/:name/logs?tail=50` | Logs de um container |
| POST | `/api/admin/container/:name/restart` | Reinicia container |
| POST | `/api/admin/container/:name/stop` | Para container |
| POST | `/api/admin/container/:name/start` | Inicia container |
| GET | `/api/admin/system` | Stats do sistema |
| GET | `/health` | Health check básico |

## 🛠️ Troubleshooting

### "Containers não aparecem no dashboard"
1. Certifique-se que os containers estão rodando: `docker ps`
2. Verifique se a API está online: `curl http://localhost:4000/health`
3. Verifique o console do navegador para erros

### "CPU/Memory mostra 0%"
- Em alguns ambientes, `docker stats` pode não estar disponível
- Neste caso, implemente fallback usando `docker inspect`
- Veja opções em `apps/api/src/routes/admin.ts:getContainerStats()`

### "Buttons não funcionam"
1. Verifique logs da API: `docker logs api`
2. Certifique-se que Docker CLI está disponível: `docker --version`
3. Verifique permissões do container para acessar docker socket

### "Docker Desktop continua travando"
- Use `docker-compose.dev.yml` com configuração otimizada
- Reduza memory limits se necessário
- Compare com `docker-compose.prod.yml`

## 📱 Responsive Design

O Dashboard é otimizado para:
- ✅ Desktop (1920x1080+)
- ✅ Tablet (iPad)
- ✅ Mobile (via sidebar colapsável - pode ser implementado)

## 🔐 Segurança

### Em Desenvolvimento
- Endpoints de admin estão **disponíveis sem autenticação**
- Útil para desenvolvimento local

### Em Produção
- **IMPORTANTE**: Adicione verificação de autenticação
- Modifique `apps/api/src/routes/admin.ts` para verificar:
```typescript
app.post('/api/admin/container/:name/restart', async (request, reply) => {
  // Adicione verificação de admin:
  if (!request.user?.isAdmin) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
  // ... resto do código
})
```

- Ou use Fastify hooks para verificação global:
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

## 📊 Docker Compose Dev vs Prod

### docker-compose.dev.yml (Windows Development)
```yaml
# Otimizado para Windows Docker Desktop
API:
  cpus: '2'
  memory: '1.5G'  # Reduzido para não travar
  NODE_ENV: development
  volumes: live mount com hot-reload

Web:
  cpus: '2'
  memory: '1G'    # Reduzido para dev
  NODE_ENV: development
```

### docker-compose.prod.yml (Production)
```yaml
# Configuração em produção
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

## 🎯 Próximos Passos

### Melhorias Opcionais
1. **Socket.io em tempo real** - Substitua polling por push de eventos
2. **Gráficos de histórico** - Use Chart.js ou similar para mostrar tendências
3. **Alertas automáticos** - Notifique quando memória > 80%
4. **Autenticação de painel** - Restrinja acesso a usuários admin
5. **Docker stats avançado** - Mostrar network I/O, disk usage
6. **Terminal interativo** - Execute comandos no container via UI
7. **Exportar métricas** - Prometheus/Grafana integration

### Implementação Rápida de Melhorias

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

#### 2. Gráficos com Chart.js
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

## 📚 Arquivos Modificados

```
📦 apps/
 ├── 🔧 api/src/main.ts (ADD: import + register admin routes)
 ├── 📁 api/src/routes/admin.ts (NEW: 8 endpoints)
 └── 🔧 omni-nuxt-ui/
     ├── app/components/Admin/ContainerMonitor.vue (NEW)
     ├── app/composables/useAdminApi.ts (NEW)
     └── app/pages/admin/
         ├── admin.vue (NEW)
         ├── containers.vue (NEW)
         ├── logs.vue (NEW)
         └── health.vue (NEW)

🐳 docker-compose.dev.yml (NEW)
```

## 💡 Dicas

1. **Desenvolva mais rápido**: Com o dashboard, você não precisa abrir terminal para reiniciar containers
2. **Monitore em tempo real**: Veja imediatamente o impacto de mudanças no código
3. **Débug facilitado**: Acesse logs diretamente da UI
4. **Menos context switching**: Tudo dentro da aplicação

## 🎬 Quick Start

```bash
# Inicie tudo
docker-compose -f docker-compose.dev.yml up -d

# Navegue para o painel
# http://localhost:3000/admin/containers

# Pronto! Monitore e controle seus containers
```

---

**Desenvolvido para melhorar a experiência de desenvolvimento local! 🚀**
