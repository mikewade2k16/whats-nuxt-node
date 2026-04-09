#!/bin/bash
# Docker Container Startup Manager - InicializaÃ§Ã£o otimizada com validaÃ§Ã£o

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ConfiguraÃ§Ãµes
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-omnichannel-mvp}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-300}"  # 5 minutos
ENV_FILE="${ENV_FILE:-.env}"

# FunÃ§Ãµes de output
log_info() {
    echo -e "${BLUE}â„¹ï¸  $1${NC}"
}

log_success() {
    echo -e "${GREEN}âœ… $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}âš ï¸  $1${NC}"
}

log_error() {
    echo -e "${RED}âŒ $1${NC}"
}

log_section() {
    echo ""
    echo -e "${BLUE}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${NC}"
    echo -e "${BLUE}â•‘ $1${NC}"
    echo -e "${BLUE}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
    echo ""
}

# Verificar prÃ©-requisitos
check_prerequisites() {
    log_section "1ï¸âƒ£  VERIFICANDO PRÃ‰-REQUISITOS"
    
    # Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker nÃ£o estÃ¡ instalado"
        exit 1
    fi
    log_success "Docker encontrado: $(docker --version)"
    
    # Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose nÃ£o estÃ¡ instalado"
        exit 1
    fi
    log_success "Docker Compose encontrado: $(docker-compose --version)"
    
    # .env file
    if [ ! -f "$ENV_FILE" ]; then
        log_warning "Arquivo $ENV_FILE nÃ£o encontrado"
        log_info "Criando .env padrÃ£o..."
        cp .env.example "$ENV_FILE" 2>/dev/null || {
            log_error "NÃ£o foi possÃ­vel criar .env. Copie .env.example para .env"
            exit 1
        }
    fi
    log_success "Arquivo de configuraÃ§Ã£o encontrado"
    
    # Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon nÃ£o estÃ¡ rodando"
        exit 1
    fi
    log_success "Docker daemon estÃ¡ rodando"
    
    # EspaÃ§o em disco
    local available_space=$(df -h . | tail -1 | awk '{print $4}' | sed 's/G//')
    if (( $(echo "$available_space < 5" | bc -l) )); then
        log_warning "EspaÃ§o em disco baixo: ${available_space}GB"
    else
        log_success "EspaÃ§o em disco: ${available_space}GB disponÃ­vel"
    fi
}

# Limpar containers antigos
cleanup_old_containers() {
    log_section "2ï¸âƒ£  LIMPANDO CONTAINERS ANTIGOS"
    
    if [ "$1" = "--force" ]; then
        log_info "Parando todos os containers..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down -v || true
        log_success "Containers parados e volumes removidos"
    else
        log_info "Removendo containers Ãºnicos com erro..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down 2>/dev/null || true
    fi
}

# Preparar volumes
prepare_volumes() {
    log_section "3ï¸âƒ£  PREPARANDO VOLUMES"
    
    local volumes=(
        "postgres_data"
        "redis_data"
        "atendimento_online_api_node_modules"
        "atendimento_online_worker_node_modules"
        "atendimento_online_retencao_worker_node_modules"
        "painel_web_node_modules"
        "whatsapp_evolution_instances"
    )
    
    for vol in "${volumes[@]}"; do
        if docker volume inspect "${COMPOSE_PROJECT}_${vol}" &> /dev/null; then
            log_success "Volume ${vol} jÃ¡ existe"
        else
            log_info "Criando volume ${vol}..."
            docker volume create "${COMPOSE_PROJECT}_${vol}"
            log_success "Volume ${vol} criado"
        fi
    done
}

# Validar docker-compose.yml
validate_compose() {
    log_section "4ï¸âƒ£  VALIDANDO DOCKER-COMPOSE"
    
    if ! docker-compose -f "$COMPOSE_FILE" config &> /dev/null; then
        log_error "docker-compose.yml invÃ¡lido"
        exit 1
    fi
    log_success "docker-compose.yml Ã© vÃ¡lido"
}

# Build de imagens se necessÃ¡rio
build_images() {
    log_section "5ï¸âƒ£  BUILDANDO IMAGENS"
    
    log_info "Verificando se Ã© necessÃ¡rio fazer build..."
    
    if [ "$1" = "--rebuild" ]; then
        log_info "ForÃ§ando rebuild de todas as imagens..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" build --no-cache
    else
        log_info "Build incremental..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" build
    fi
    
    log_success "Imagens prontas"
}

# Iniciar containers
start_containers() {
    log_section "6ï¸âƒ£  INICIANDO CONTAINERS"
    
    log_info "Iniciando serviÃ§os..."
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d
    
    log_success "Containers iniciados"
}

# Aguardar healthchecks
wait_for_health() {
    log_section "7ï¸âƒ£  AGUARDANDO HEALTH CHECKS"
    
    local containers=(
        "postgres"
        "redis"
        "atendimento-online-api"
        "plataforma-api"
        "atendimento-online-worker"
        "atendimento-online-retencao-worker"
        "painel-web"
        "whatsapp-evolution-gateway"
    )
    
    local start_time=$(date +%s)
    local timeout=$STARTUP_TIMEOUT
    
    for container in "${containers[@]}"; do
        local container_name="${COMPOSE_PROJECT}-${container}-1"
        
        if ! docker ps --filter "name=$container_name" -q | grep -q . 2>/dev/null; then
            log_warning "Container ${container} nÃ£o encontrado (pode estar desabilitado com profile)"
            continue
        fi
        
        echo -n "Esperando ${container}... "
        
        local elapsed=0
        while [ $elapsed -lt $timeout ]; do
            local health=$(docker inspect "$container_name" 2>/dev/null | \
                          grep -o '"Health"' -A 5 | grep -o '"Status":"[^"]*"' | \
                          sed 's/"Status":"//;s/"//g' || echo "none")
            
            if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                echo -e "${GREEN}âœ… SaudÃ¡vel${NC}"
                break
            fi
            
            sleep 5
            elapsed=$(($(date +%s) - start_time))
            
            if [ $((elapsed % 30)) -eq 0 ]; then
                echo -n "."
            fi
        done
        
        if [ $elapsed -ge $timeout ]; then
            log_error "Timeout aguardando ${container}"
        fi
    done
}

# Testar conectividade
test_connectivity() {
    log_section "8ï¸âƒ£  TESTANDO CONECTIVIDADE"
    
    # PostgreSQL
    echo -n "PostgreSQL... "
    if docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T postgres pg_isready -U omnichannel 2>/dev/null | grep -q "accepting"; then
        log_success ""
    else
        log_error ""
    fi
    
    # Redis
    echo -n "Redis... "
    if docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        log_success ""
    else
        log_error ""
    fi
    
    # API
    echo -n "API... "
    if docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T atendimento-online-api curl -s http://localhost:4000/health &> /dev/null; then
        log_success ""
    else
        log_error ""
    fi
}

# Gerar relatÃ³rio
generate_startup_report() {
    log_section "ðŸ“Š RELATÃ“RIO DE INICIALIZAÃ‡ÃƒO"
    
    echo -e "${BLUE}Containers Rodando:${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" ps
    
    echo -e "\n${BLUE}Uso de Recursos:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "N/A"
    
    echo -e "\n${BLUE}Logs Recentes:${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" logs --tail=5 2>/dev/null | head -20
}

# Exibir instruÃ§Ãµes
show_instructions() {
    log_section "ðŸš€ PRÃ“XIMOS PASSOS"
    
    echo -e "${BLUE}Acessar aplicaÃ§Ãµes:${NC}"
    echo "  â€¢ Painel Web:           http://localhost:3000"
    echo "  â€¢ Atendimento API:      http://localhost:4000"
    echo "  â€¢ Plataforma API:       http://localhost:4100"
    echo "  â€¢ Adminer (DB):   http://localhost:8088"
    echo "  â€¢ Redis CLI:      http://localhost:8089"
    echo ""
    echo -e "${BLUE}Comandos Ãºteis:${NC}"
    echo "  â€¢ Ver logs:       docker-compose logs -f"
    echo "  â€¢ Parar:          docker-compose down"
    echo "  â€¢ Reiniciar:      docker-compose restart"
    echo "  â€¢ Excluir tudo:   docker-compose down -v"
    echo ""
    echo -e "${BLUE}Scripts de monitoramento:${NC}"
    echo "  â€¢ Monitor:        ./scripts/monitor-containers.sh"
    echo "  â€¢ Health Check:   ./scripts/health-check.sh"
    echo "  â€¢ MÃ©tricas:       ./scripts/docker-stats.sh monitor"
}

# Tratamento de erros
handle_error() {
    log_error "Erro durante inicializaÃ§Ã£o"
    log_info "Verifique os logs com: docker-compose logs -f"
    exit 1
}

trap handle_error ERR

# Main
main() {
    local force=false
    local rebuild=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force=true
                shift
                ;;
            --rebuild)
                rebuild=true
                shift
                ;;
            *)
                log_error "Argumento desconhecido: $1"
                exit 1
                ;;
        esac
    done
    
    # Executar steps
    check_prerequisites
    cleanup_old_containers $([ "$force" = true ] && echo "--force")
    prepare_volumes
    validate_compose
    build_images $([ "$rebuild" = true ] && echo "--rebuild")
    start_containers
    wait_for_health
    test_connectivity
    generate_startup_report
    show_instructions
    
    log_success "ðŸŽ‰ InicializaÃ§Ã£o concluÃ­da com sucesso!"
}

# Run main
main "$@"
