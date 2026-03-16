# Checklist de Deploy em Produção

**Data**: Para quando estiver pronto para produção
**Ambiente**: VPS/Cloud com Ubuntu 24.04 LTS
**Estimativa**: 2-3 horas

---

## 📋 PRÉ-DEPLOY (Antes de começar)

### Hardware & Rede

- [ ] VPS provisionada com:
  - [ ] **CPU:** 4+ vCores (Intel/AMD)
  - [ ] **RAM:** 8GB mínimo (16GB recomendado)
  - [ ] **Storage:** 100GB SSD mínimo
  - [ ] **Banda:** 1Gbps
  
- [ ] Domínio DNS configurado (se aplicável)
  - [ ] `app.dominio.com` apontando para IP VPS
  - [ ] SSL/TLS preparado ou Let's Encrypt pronto

- [ ] Firewall configurado (UFW/iptables)
  - [ ] Porta 22 SSH aberta (seu IP)
  - [ ] Porta 80 HTTP aberta
  - [ ] Porta 443 HTTPS aberta
  - [ ] Outras portas bloqueadas

- [ ] Backup planejado
  - [ ] Estragégia de backup para volumes PostgreSQL
  - [ ] Backup automático configurado
  - [ ] Teste de restore feito

### Software na VPS

- [ ] Ubuntu 24.04 LTS instalado e atualizado
  ```bash
  sudo apt-get update
  sudo apt-get upgrade -y
  ```

- [ ] Docker instalado
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  ```

- [ ] Docker Compose instalado
  ```bash
  sudo apt-get install docker-compose-plugin
  ```

- [ ] Git instalado
  ```bash
  sudo apt-get install git
  ```

- [ ] Nano/Vim instalado
  ```bash
  sudo apt-get install nano vim
  ```

- [ ] User não-root configurado
  ```bash
  sudo usermod -aG docker $USER
  newgrp docker
  ```

### Segurança

- [ ] SSH key configurada (sem password)
  ```bash
  ssh-copy-id user@vps-ip
  ```

- [ ] Senha sudo configurada para produção
- [ ] Firewall habilitado e configurado
- [ ] Fail2ban instalado (proteção contra brute force)
  ```bash
  sudo apt-get install fail2ban
  ```

- [ ] SSL/TLS certificate obtido
  - [ ] Let's Encrypt + Certbot preparado
  - [ ] Auto-renewal configurado

---

## 🚀 DEPLOY

### Clonar e Preparar Repositório

- [ ] SSH para VPS
  ```bash
  ssh user@vps-ip
  ```

- [ ] Clonar repositório
  ```bash
  git clone https://github.com/seu-user/whats-test.git
  cd whats-test
  ```

- [ ] Checkout da branch de produção
  ```bash
  git checkout main
  git pull origin main
  ```

- [ ] Verificar estrutura
  ```bash
  ls -la
  # Deve ter: docker-compose.prod.yml, .env.example, etc
  ```

### Configurar Ambiente

- [ ] Copiar .env.example para .env
  ```bash
  cp .env.example .env
  ```

- [ ] Editar .env com valores de produção
  ```bash
  nano .env
  ```
  
  **Campos críticos:**
  - [ ] `POSTGRES_DB=omnichannel`
  - [ ] `POSTGRES_USER=omnichannel`
  - [ ] `POSTGRES_PASSWORD=<SENHA-FORTE-ALEATÓRIA>`
  - [ ] `JWT_SECRET=<CHAVE-SECRETA-ALEATÓRIA-40+ chars>`
  - [ ] `CORE_JWT_SECRET=<CHAVE-SECRETA-ALEATÓRIA-40+ chars>`
  - [ ] `DATABASE_URL=postgresql://omnichannel:<SENHA>@postgres:5432/omnichannel`
  - [ ] `REDIS_URL=redis://redis:6379`
  - [ ] `NUXT_PUBLIC_API_BASE=https://api.dominio.com` (ou IP)
  - [ ] `NUXT_API_INTERNAL_BASE=http://api:4000`
  - [ ] `CORE_API_BASE_URL=http://platform-core:4100`
  - [ ] `CORS_ORIGIN=https://app.dominio.com`
  - [ ] `EVOLUTION_API_KEY=<CHAVE-EVOLUTION>`
  - [ ] `EVOLUTION_BASE_URL=https://evolution.dominio.com`

- [ ] Verificar arquivo .env
  ```bash
  cat .env | grep -E "PASSWORD|SECRET|API_KEY"
  # Nenhum valor deve estar vazio ou como "change-this-*"
  ```

### Criar .env-prod.db (Credenciais Seguras)

- [ ] Gerar senhas aleatórias
  ```bash
  openssl rand -base64 32  # Para senhas
  openssl rand -hex 64     # Para secrets
  ```

- [ ] Usar senhas seguras no .env
  - [ ] Mínimo 20 caracteres
  - [ ] Mistura de maiúsculas, minúsculas, números, símbolos
  - [ ] Diferentes para cada variável

### Preparar Volumes

- [ ] Criar volumes docker
  ```bash
  docker volume create omnichannel-mvp_postgres_data
  docker volume create omnichannel-mvp_redis_data
  ```

- [ ] Verificar volumes
  ```bash
  docker volume ls | grep omnichannel
  ```

### Build de Imagens

- [ ] Fazer build das imagens
  ```bash
  # Usa docker-compose.prod.yml
  docker-compose -f docker-compose.prod.yml build
  ```

  **Tempo estimado:** 5-10 minutos

- [ ] Verificar imagens criadas
  ```bash
  docker images | grep "api\|platform-core\|node\|omnichannel"
  ```

### Iniciar Containers

- [ ] Rodar startup script
  ```bash
  chmod +x scripts/startup.sh
  ./scripts/startup.sh
  ```

  **Tempo estimado:** 2-3 minutos

- [ ] Verificar status
  ```bash
  docker-compose -f docker-compose.prod.yml ps
  # Todos devem estar "Up" ou "Up (healthy)"
  ```

- [ ] Ver logs
  ```bash
  docker-compose -f docker-compose.prod.yml logs -f
  # Procurar por erros críticos
  ```

### Testar Conectividade

- [ ] Testar health checks
  ```bash
  chmod +x scripts/health-check.sh
  ./scripts/health-check.sh
  # Todos devem passar
  ```

- [ ] Testar API
  ```bash
  curl http://localhost:4000/health
  # Deve retornar status 200
  ```

- [ ] Testar Web (pode estar carregando ainda)
  ```bash
  curl http://localhost:3000
  # Deve retornar HTML com <title>Omnichannel</title>
  ```

- [ ] Testar Core
  ```bash
  curl http://localhost:4100/health
  ```

---

## 🔧 PÓS-DEPLOY

### Configurar Reverse Proxy (Nginx)

- [ ] Instalar Nginx
  ```bash
  sudo apt-get install nginx
  ```

- [ ] Criar arquivo de configuração
  ```bash
  sudo nano /etc/nginx/sites-available/omnichannel
  ```

  **Conteúdo:**
  ```nginx
  upstream api {
      server localhost:4000;
  }

  upstream core {
      server localhost:4100;
  }

  upstream web {
      server localhost:3000;
  }

  server {
      listen 80;
      server_name api.dominio.com;

      location / {
          proxy_pass http://api;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }

  server {
      listen 80;
      server_name app.dominio.com;

      location / {
          proxy_pass http://web;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

- [ ] Habilitar site
  ```bash
  sudo ln -s /etc/nginx/sites-available/omnichannel \
      /etc/nginx/sites-enabled/
  sudo systemctl reload nginx
  ```

### SSL/TLS com Let's Encrypt

- [ ] Instalar Certbot
  ```bash
  sudo apt-get install certbot python3-certbot-nginx
  ```

- [ ] Obter certificado
  ```bash
  sudo certbot --nginx -d app.dominio.com -d api.dominio.com
  ```

- [ ] Verificar auto-renewal
  ```bash
  sudo systemctl enable certbot.timer
  sudo systemctl start certbot.timer
  ```

### Monitoramento Contínuo

- [ ] Configurar monitor script
  ```bash
  chmod +x scripts/monitor-containers.sh
  
  # Em background
  nohup ./scripts/monitor-containers.sh > logs/monitor.log 2>&1 &
  
  # Ou com systemd
  sudo nano /etc/systemd/system/omni-monitor.service
  ```

- [ ] Ver logs do monitor
  ```bash
  tail -f logs/container-monitor.log
  ```

### Backups Automáticos

- [ ] Criar script de backup
  ```bash
  nano scripts/backup.sh
  ```

  **Conteúdo:**
  ```bash
  #!/bin/bash
  BACKUP_DIR="./backups"
  mkdir -p "$BACKUP_DIR"
  
  # Dump PostgreSQL
  docker-compose exec -T postgres pg_dump \
    -U omnichannel omnichannel > \
    "$BACKUP_DIR/db_$(date +%Y%m%d_%H%M%S).sql"
  
  # Backup .env
  cp .env "$BACKUP_DIR/.env_$(date +%Y%m%d_%H%M%S)"
  ```

- [ ] Tornar executável
  ```bash
  chmod +x scripts/backup.sh
  ```

- [ ] Agendar com cron
  ```bash
  crontab -e
  # Adicionar: 0 2 * * * /path/to/scripts/backup.sh
  # (Roda 2:00 AM diariamente)
  ```

### Logs Centralizados

- [ ] Implementar rotação de logs
  ```bash
  sudo nano /etc/logrotate.d/omnichannel
  ```

  **Conteúdo:**
  ```
  /home/user/whats-test/logs/*.log {
      daily
      rotate 7
      compress
      delaycompress
      notifempty
      create 644 user user
  }
  ```

- [ ] Testar logrotate
  ```bash
  sudo logrotate -f /etc/logrotate.d/omnichannel
  ```

---

## ✅ VALIDAÇÃO PÓS-DEPLOY

### Funcionalidade

- [ ] Acessar Frontend
  - [ ] Go to `https://app.dominio.com`
  - [ ] Verificar que página carrega
  - [ ] Tentar login

- [ ] Testar API
  - [ ] Listar usuários: `curl -H "Authorization: Bearer $TOKEN" http://api.dominio.com/users`
  - [ ] Verificar resposta JSON

- [ ] Testar banco de dados
  - [ ] Inserir dado via API
  - [ ] Verificar em Adminer

### Performance

- [ ] Coletar métricas baseline
  ```bash
  ./scripts/docker-stats.sh collect
  ```

- [ ] Verificar CPU/Memory
  ```bash
  docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
  ```

- [ ] Testar carga
  ```bash
  # Requisições simultâneas
  for i in {1..20}; do
    curl http://api.dominio.com/health &
  done
  wait
  ```

- [ ] Verificar resiliência
  ```bash
  # Matar um container
  docker kill omnichannel-mvp-api-1
  sleep 30
  
  # Deve reiniciar automaticamente
  docker-compose ps
  ```

### Segurança

- [ ] Verificar SSL funcion
  ```bash
  curl -I https://app.dominio.com
  # Deve retornar HTTP/2 200
  ```

- [ ] Verificar headers de segurança
  ```bash
  curl -I https://app.dominio.com | grep -i "strict\|security\|x-frame"
  ```

- [ ] Verificar se .env está privado
  ```bash
  curl https://app.dominio.com/.env
  # Deve retornar 404
  ```

- [ ] Verificar portas não expostas
  ```bash
  nmap -p 1-10000 vps-ip
  # Só 22, 80, 443 devem estar open
  ```

---

## 🎯 CHECKLIST FINAL

### Antes de declarar "Production Ready"

- [ ] Todos containers saudáveis (docker-compose ps)
- [ ] Health check passando (./scripts/health-check.sh)
- [ ] Sem erros nos logs (docker-compose logs | grep -i error)
- [ ] SSL/TLS funcionando
- [ ] Backup automático configurado e testado
- [ ] Monitoramento rodando continuamente
- [ ] Usuários conseguindo fazer login
- [ ] Dados sendo salvos corretamente
- [ ] Performance aceitável (< 500ms API response)
- [ ] Não há anomalias de CPU/Memory

---

## 📞 TROUBLESHOOTING PÓS-DEPLOY

### Container crashing ao iniciar

```bash
docker-compose logs api --tail=50
# Procurar por erro específico
```

**Soluções comuns:**
1. Variáveis de ambiente não definidas
2. Banco de dados não iniciou
3. Porta já em uso

### API respondendo lentamente

```bash
# Verificar carga
docker stats --no-stream

# Verificar se é query lenta
docker-compose exec api curl http://localhost:4000/debug/log?tail=50

# Mais conexões podem ajudar
docker-compose up -d --scale worker=2
```

### Volumes atingindo limite

```bash
# Ver tamanho
du -sh /var/lib/docker/volumes/..._postgres_data

# Limpar backups antigos
rm ./backups/*_30dias.ago

# Fazer vacuum no PostgreSQL
docker-compose exec postgres vacuumdb -U omnichannel omnichannel
```

---

## 🎉 PRÓXIMOS PASSOS EM PRODUÇÃO

1. **Semana 1:** Monitorar métricas, ajustar limites se necessário
2. **Semana 2:** Fazer 1-2 testes de failover
3. **Mês 1:** Estabelecer baseline de performance
4. **Mês 2:** Adicionar Prometheus + Grafana para gráficos
5. **Mês 3:** Planejar escalabilidade para múltiplos servidores

---

## 📚 Documentação Relacionada

- [docs/infra-diagnostico-otimizacao.md](infra-diagnostico-otimizacao.md) - Diagnóstico completo
- [docs/scripts-guia-uso.md](scripts-guia-uso.md) - Scripts de monitoramento
- [docs/troubleshooting-infra.md](troubleshooting-infra.md) - Troubleshooting detalhado

