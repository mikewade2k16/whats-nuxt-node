#!/bin/bash
# Monitor Containers & Auto-Restart
# Monitora containers e reinicia automaticamente se estiverem down

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ConfiguraÃ§Ãµes
COMPOSE_FILE="${COMPOSE_FILE:-.docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-omnichannel-mvp}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"  # segundos
LOG_FILE="${LOG_FILE:-./logs/container-monitor.log}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"  # Optional: Slack webhook para alertas

# Criar diretÃ³rio de logs se nÃ£o existir
mkdir -p "$(dirname "$LOG_FILE")"

# FunÃ§Ã£o de logging
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# FunÃ§Ã£o para enviar alerta (Slack/Discord)
send_alert() {
    local message=$1
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"ðŸš¨ ALERT: ${message}\"}" \
            > /dev/null 2>&1 || true
    fi
}

# FunÃ§Ã£o para restart de container
restart_container() {
    local container=$1
    log_message "WARN" "Container ${container} estÃ¡ unhealthy. Reiniciando..."
    
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" restart "$container"
    
    if [ $? -eq 0 ]; then
        log_message "INFO" "âœ… Container ${container} reiniciado com sucesso"
    else
        log_message "ERROR" "âŒ Falha ao reiniciar ${container}"
        send_alert "Falha ao reiniciar container: ${container}"
    fi
}

# FunÃ§Ã£o para verificar saÃºde de um container
check_container_health() {
    local container=$1
    
    # Verificar se container estÃ¡ rodando
    local state=$(docker inspect "$container" 2>/dev/null | \
                  grep -o '"State"' -A 5 | grep -o '"Running":.*' | \
                  head -1 | grep -o 'true\|false')
    
    if [ "$state" != "true" ]; then
        log_message "ERROR" "Container ${container} estÃ¡ DOWN"
        return 1
    fi
    
    # Verificar healthcheck
    local health=$(docker inspect "$container" 2>/dev/null | \
                   grep -o '"Health"' -A 5 | grep -o '"Status":"[^"]*"' | \
                   sed 's/"Status":"\([^"]*\)"/\1/')
    
    if [ "$health" = "unhealthy" ]; then
        log_message "ERROR" "Container ${container} estÃ¡ UNHEALTHY"
        return 1
    fi
    
    return 0
}

# FunÃ§Ã£o para monitorar CPU/Memory
check_resource_usage() {
    local container=$1
    local cpu_limit=$2
    local memory_limit=$3
    
    local stats=$(docker stats "$container" --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" 2>/dev/null)
    
    if [ -n "$stats" ]; then
        echo "$stats"
    fi
}

# FunÃ§Ã£o principal de monitoramento
monitor_containers() {
    echo -e "${BLUE}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
    echo -e "${BLUE}Container Health Monitor - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}\n"
    
    # Lista de containers crÃ­ticos para monitorar
    local containers=("postgres" "redis" "atendimento-online-api" "plataforma-api" "atendimento-online-worker" "atendimento-online-retencao-worker" "painel-web" "whatsapp-evolution-gateway")
    
    for container in "${containers[@]}"; do
        echo -n "Checando ${container}... "
        
        if check_container_health "$container"; then
            echo -e "${GREEN}âœ… SaudÃ¡vel${NC}"
            
            # Mostrar uso de recursos
            local resources=$(check_resource_usage "$container" "1.5" "1G")
            if [ -n "$resources" ]; then
                echo "  â””â”€ "${resources}""
            fi
        else
            echo -e "${RED}âŒ Unhealthy${NC}"
            restart_container "$container"
            sleep 5  # Esperar container reiniciar
        fi
    done
    
    echo ""
}

# FunÃ§Ã£o para gerar relatÃ³rio de saÃºde
generate_health_report() {
    echo -e "\n${BLUE}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
    echo -e "${BLUE}RELATÃ“RIO DE SAÃšDE DOS CONTAINERS${NC}"
    echo -e "${BLUE}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}\n"
    
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" ps
    
    echo -e "\n${BLUE}MÃ‰TRICAS DE RECURSOS${NC}\n"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    
    echo -e "\n${BLUE}LOGS RECENTES${NC}\n"
    tail -n 20 "$LOG_FILE"
}

# Tratamento de sinais
cleanup() {
    log_message "INFO" "Monitor encerrado"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main loop
log_message "INFO" "Iniciando monitoramento de containers..."

if [ "$1" = "once" ]; then
    # Modo uma Ãºnica execuÃ§Ã£o
    monitor_containers
    generate_health_report
else
    # Modo contÃ­nuo
    while true; do
        monitor_containers
        sleep "$CHECK_INTERVAL"
    done
fi
