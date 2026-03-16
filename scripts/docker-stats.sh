#!/bin/bash
# Docker Stats - Monitora e registra métricas de recursos

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configurações
COMPOSE_PROJECT="${COMPOSE_PROJECT:-omnichannel-mvp}"
STATS_DIR="${STATS_DIR:-./logs/metrics}"
INTERVAL="${INTERVAL:-5}"  # segundos entre updates
DURATION="${DURATION:-300}"  # duração total em segundos
OUTPUT_FORMAT="${OUTPUT_FORMAT:-console}"  # console, json, csv

# Criar diretório se não existir
mkdir -p "$STATS_DIR"

# Timestamp para arquivo
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# Funções
print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                 DOCKER RESOURCES MONITOR                          ║${NC}"
    echo -e "${BLUE}║                 $(date '+%Y-%m-%d %H:%M:%S')                       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
}

print_info() {
    local message=$1
    echo -e "${CYAN}ℹ️  ${message}${NC}"
}

print_warning() {
    local message=$1
    local value=$2
    echo -e "${YELLOW}⚠️  ${message}: ${value}${NC}"
}

print_error() {
    local message=$1
    echo -e "${RED}❌ ${message}${NC}"
}

# Monitorar em tempo real
monitor_realtime() {
    print_header
    print_info "Iniciando monitoramento em tempo real..."
    print_info "Intervalo: ${INTERVAL}s | Duração: ${DURATION}s"
    echo ""
    
    local start_time=$(date +%s)
    local end_time=$((start_time + DURATION))
    
    while [ $(date +%s) -lt $end_time ]; do
        clear
        print_header
        
        echo -e "\n${BLUE}╔ CONTAINERS RODANDO ════════════════════════════════════════════════╗${NC}"
        docker-compose -p "$COMPOSE_PROJECT" ps 2>/dev/null || print_error "Docker compose não encontrado"
        
        echo -e "\n${BLUE}╔ MÉTRICAS DE RECURSOS ══════════════════════════════════════════════╗${NC}"
        echo -e ""
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" 2>/dev/null || print_error "Erro ao obter stats"
        
        # Listar containers com limites
        echo -e "\n${BLUE}╔ LIMITES CONFIGURADOS ══════════════════════════════════════════════╗${NC}"
        echo -e ""
        docker inspect $(docker ps -q) 2>/dev/null | \
            grep -E '"Name"|"CpuQuota"|"MemoryLimit"' | \
            paste -d' ' - - - | \
            sed 's/"Name": "\/\(.*\)",/Container: \1 |/' | \
            sed 's/"CpuQuota": \("[^"]*"\),/CPU: \1 |/' | \
            sed 's/"MemoryLimit": \([0-9]*\),/Memory: \1 bytes/' || print_error "Erro ao obter limites"
        
        # Espaço em disco
        echo -e "\n${BLUE}╔ ESPAÇO EM DISCO ═══════════════════════════════════════════════════╗${NC}"
        echo -e ""
        docker system df || print_error "Erro ao obter info de disco"
        
        local elapsed=$(($(date +%s) - start_time))
        echo -e "\n${CYAN}Monitorando por ${elapsed}/${DURATION}s - Pressione CTRL+C para parar${NC}\n"
        
        sleep "$INTERVAL"
    done
}

# Coletar métricas e salvar em arquivo
collect_metrics() {
    local output_file="$STATS_DIR/metrics_${TIMESTAMP}.json"
    
    print_info "Coletando métricas..."
    print_info "Salvando em: $output_file"
    
    # Coletar dados em JSON
    {
        echo "{"
        echo '  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
        echo '  "containers": ['
        
        local first=true
        for container in $(docker ps -q); do
            if [ "$first" = false ]; then echo ","; fi
            first=false
            
            local stats=$(docker stats "$container" --no-stream --format "{{json .}}")
            echo "    $stats"
        done
        
        echo "  ],"
        echo '  "system": '
        docker system df --format "{{json .}}" || echo "{}"
        echo "}"
    } > "$output_file"
    
    print_info "Métricas salvas com sucesso!"
}

# Gerar relatório
generate_report() {
    local report_file="$STATS_DIR/report_${TIMESTAMP}.txt"
    
    print_info "Gerando relatório..."
    
    {
        echo "╔═══════════════════════════════════════════════════════╗"
        echo "║            RELATÓRIO DE RECURSOS DOCKER               ║"
        echo "║            $(date '+%Y-%m-%d %H:%M:%S')                ║"
        echo "╚═══════════════════════════════════════════════════════╝"
        echo ""
        echo "CONTAINERS RODANDO:"
        echo "──────────────────"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "ÚLTIMAS MÉTRICAS:"
        echo "────────────────"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
        echo ""
        echo "VOLUMES:"
        echo "───────"
        docker volume ls
        echo ""
        echo "ESPAÇO EM DISCO:"
        echo "───────────────"
        docker system df
        echo ""
        echo "LOGS RECENTES:"
        echo "──────────────"
        docker-compose -p "$COMPOSE_PROJECT" logs --tail=20 2>/dev/null || echo "N/A"
        
    } | tee "$report_file"
    
    print_info "Relatório salvo em: $report_file"
}

# Alertas de recursos críticos
check_critical_resources() {
    local cpu_threshold=80
    local memory_threshold=80
    
    print_header
    print_info "Verificando recursos críticos..."
    echo ""
    
    local has_errors=false
    
    while IFS= read -r line; do
        local container=$(echo "$line" | awk '{print $1}')
        local cpu=$(echo "$line" | awk '{print $2}' | sed 's/%//')
        local memory=$(echo "$line" | awk '{print $3}' | sed 's/%//')
        
        if (( $(echo "$cpu > $cpu_threshold" | bc -l) )); then
            print_warning "CPU crítica em $container" "${cpu}%"
            has_errors=true
        fi
        
        if (( $(echo "$memory > $memory_threshold" | bc -l) )); then
            print_warning "Memória crítica em $container" "${memory}%"
            has_errors=true
        fi
    done < <(docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemPerc}}" | tail -n +2)
    
    if [ "$has_errors" = false ]; then
        echo -e "${GREEN}✅ Nenhum recurso crítico detectado${NC}"
    fi
}

# Main
case "${1:-monitor}" in
    monitor)
        monitor_realtime
        ;;
    collect)
        collect_metrics
        ;;
    report)
        generate_report
        ;;
    critical)
        check_critical_resources
        ;;
    *)
        echo -e "${BLUE}Docker Stats Monitor${NC}"
        echo ""
        echo "Uso: $0 [comando]"
        echo ""
        echo "Comandos:"
        echo "  monitor   - Monitorar em tempo real (padrão)"
        echo "  collect   - Coletar métricas em JSON"
        echo "  report    - Gerar relatório completo"
        echo "  critical  - Verificar recursos críticos"
        echo ""
        echo "Variáveis de ambiente:"
        echo "  INTERVAL      - Intervalo em segundos (padrão: 5)"
        echo "  DURATION      - Duração em segundos (padrão: 300)"
        echo "  STATS_DIR     - Diretório para métricas (padrão: ./logs/metrics)"
        ;;
esac
