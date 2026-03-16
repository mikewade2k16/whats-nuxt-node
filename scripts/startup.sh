#!/bin/bash
# Docker Container Startup Manager - Inicialização otimizada com validação

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configurações
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-omnichannel-mvp}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-300}"  # 5 minutos
ENV_FILE="${ENV_FILE:-.env}"

# Funções de output
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_section() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Verificar pré-requisitos
check_prerequisites() {
    log_section "1️⃣  VERIFICANDO PRÉ-REQUISITOS"
    
    # Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker não está instalado"
        exit 1
    fi
    log_success "Docker encontrado: $(docker --version)"
    
    # Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose não está instalado"
        exit 1
    fi
    log_success "Docker Compose encontrado: $(docker-compose --version)"
    
    # .env file
    if [ ! -f "$ENV_FILE" ]; then
        log_warning "Arquivo $ENV_FILE não encontrado"
        log_info "Criando .env padrão..."
        cp .env.example "$ENV_FILE" 2>/dev/null || {
            log_error "Não foi possível criar .env. Copie .env.example para .env"
            exit 1
        }
    fi
    log_success "Arquivo de configuração encontrado"
    
    # Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon não está rodando"
        exit 1
    fi
    log_success "Docker daemon está rodando"
    
    # Espaço em disco
    local available_space=$(df -h . | tail -1 | awk '{print $4}' | sed 's/G//')
    if (( $(echo "$available_space < 5" | bc -l) )); then
        log_warning "Espaço em disco baixo: ${available_space}GB"
    else
        log_success "Espaço em disco: ${available_space}GB disponível"
    fi
}

# Limpar containers antigos
cleanup_old_containers() {
    log_section "2️⃣  LIMPANDO CONTAINERS ANTIGOS"
    
    if [ "$1" = "--force" ]; then
        log_info "Parando todos os containers..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down -v || true
        log_success "Containers parados e volumes removidos"
    else
        log_info "Removendo containers únicos com erro..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down 2>/dev/null || true
    fi
}

# Preparar volumes
prepare_volumes() {
    log_section "3️⃣  PREPARANDO VOLUMES"
    
    local volumes=(
        "postgres_data"
        "redis_data"
        "api_node_modules"
        "worker_node_modules"
        "retention_worker_node_modules"
        "web_node_modules"
    )
    
    for vol in "${volumes[@]}"; do
        if docker volume inspect "${COMPOSE_PROJECT}_${vol}" &> /dev/null; then
            log_success "Volume ${vol} já existe"
        else
            log_info "Criando volume ${vol}..."
            docker volume create "${COMPOSE_PROJECT}_${vol}"
            log_success "Volume ${vol} criado"
        fi
    done
}

# Validar docker-compose.yml
validate_compose() {
    log_section "4️⃣  VALIDANDO DOCKER-COMPOSE"
    
    if ! docker-compose -f "$COMPOSE_FILE" config &> /dev/null; then
        log_error "docker-compose.yml inválido"
        exit 1
    fi
    log_success "docker-compose.yml é válido"
}

# Build de imagens se necessário
build_images() {
    log_section "5️⃣  BUILDANDO IMAGENS"
    
    log_info "Verificando se é necessário fazer build..."
    
    if [ "$1" = "--rebuild" ]; then
        log_info "Forçando rebuild de todas as imagens..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" build --no-cache
    else
        log_info "Build incremental..."
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" build
    fi
    
    log_success "Imagens prontas"
}

# Iniciar containers
start_containers() {
    log_section "6️⃣  INICIANDO CONTAINERS"
    
    log_info "Iniciando serviços..."
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d
    
    log_success "Containers iniciados"
}

# Aguardar healthchecks
wait_for_health() {
    log_section "7️⃣  AGUARDANDO HEALTH CHECKS"
    
    local containers=(
        "postgres"
        "redis"
        "api"
        "platform-core"
        "worker"
        "retention-worker"
        "web"
    )
    
    local start_time=$(date +%s)
    local timeout=$STARTUP_TIMEOUT
    
    for container in "${containers[@]}"; do
        local container_name="${COMPOSE_PROJECT}-${container}-1"
        
        if ! docker ps --filter "name=$container_name" -q | grep -q . 2>/dev/null; then
            log_warning "Container ${container} não encontrado (pode estar desabilitado com profile)"
            continue
        fi
        
        echo -n "Esperando ${container}... "
        
        local elapsed=0
        while [ $elapsed -lt $timeout ]; do
            local health=$(docker inspect "$container_name" 2>/dev/null | \
                          grep -o '"Health"' -A 5 | grep -o '"Status":"[^"]*"' | \
                          sed 's/"Status":"//;s/"//g' || echo "none")
            
            if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                echo -e "${GREEN}✅ Saudável${NC}"
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
    log_section "8️⃣  TESTANDO CONECTIVIDADE"
    
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
    if docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T api curl -s http://localhost:4000/health &> /dev/null; then
        log_success ""
    else
        log_error ""
    fi
}

# Gerar relatório
generate_startup_report() {
    log_section "📊 RELATÓRIO DE INICIALIZAÇÃO"
    
    echo -e "${BLUE}Containers Rodando:${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" ps
    
    echo -e "\n${BLUE}Uso de Recursos:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "N/A"
    
    echo -e "\n${BLUE}Logs Recentes:${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" logs --tail=5 2>/dev/null | head -20
}

# Exibir instruções
show_instructions() {
    log_section "🚀 PRÓXIMOS PASSOS"
    
    echo -e "${BLUE}Acessar aplicações:${NC}"
    echo "  • Web (Nuxt):     http://localhost:3000"
    echo "  • API (Fastify):  http://localhost:4000"
    echo "  • Core (Go):      http://localhost:4100"
    echo "  • Adminer (DB):   http://localhost:8088"
    echo "  • Redis CLI:      http://localhost:8089"
    echo ""
    echo -e "${BLUE}Comandos úteis:${NC}"
    echo "  • Ver logs:       docker-compose logs -f"
    echo "  • Parar:          docker-compose down"
    echo "  • Reiniciar:      docker-compose restart"
    echo "  • Excluir tudo:   docker-compose down -v"
    echo ""
    echo -e "${BLUE}Scripts de monitoramento:${NC}"
    echo "  • Monitor:        ./scripts/monitor-containers.sh"
    echo "  • Health Check:   ./scripts/health-check.sh"
    echo "  • Métricas:       ./scripts/docker-stats.sh monitor"
}

# Tratamento de erros
handle_error() {
    log_error "Erro durante inicialização"
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
    
    log_success "🎉 Inicialização concluída com sucesso!"
}

# Run main
main "$@"
