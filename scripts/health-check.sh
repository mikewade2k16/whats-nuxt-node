#!/bin/bash
# Health Check - Verifica saúde de todos os endpoints da aplicação

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
API_URL="${API_URL:-http://localhost:4000}"
CORE_URL="${CORE_URL:-http://localhost:4100}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-omnichannel}"
DB_NAME="${DB_NAME:-omnichannel}"
TIMEOUT="${TIMEOUT:-5}"

# Counters
PASSED=0
FAILED=0

# Funções
check_http_endpoint() {
    local name=$1
    local url=$2
    local timeout=$3
    
    echo -n "Checando ${name}... "
    
    if curl -s -f -m "$timeout" "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FALHOU${NC}"
        ((FAILED++))
    fi
}

check_tcp_port() {
    local name=$1
    local host=$2
    local port=$3
    
    echo -n "Checando ${name}... "
    
    if timeout "$TIMEOUT" bash -c "</dev/tcp/${host}/${port}" 2>/dev/null; then
        echo -e "${GREEN}✅ OK${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FALHOU${NC}"
        ((FAILED++))
    fi
}

check_redis() {
    echo -n "Checando Redis... "
    
    local result=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || echo "PONG_FAIL")
    
    if [ "$result" = "PONG" ]; then
        echo -e "${GREEN}✅ OK${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FALHOU${NC}"
        ((FAILED++))
    fi
}

check_postgres() {
    echo -n "Checando PostgreSQL... "
    
    local result=$(PGPASSWORD-$DB_PASS psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" 2>/dev/null || echo "FAIL")
    
    if [ "$result" = *"1 row"* ] || [ "$result" = *"1"* ]; then
        echo -e "${GREEN}✅ OK${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠️  PUXAR (sem psql instalado)${NC}"
    fi
}

get_container_stats() {
    local container=$1
    
    echo -e "\n${BLUE}Recursos: ${container}${NC}"
    docker stats "$container" --no-stream --format "  CPU: {{.CPUPerc}} | Memory: {{.MemUsage}}"
}

# Header
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          HEALTH CHECK - $(date '+%Y-%m-%d %H:%M:%S')              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

# Checar endpoints HTTP
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}HTTP ENDPOINTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

check_http_endpoint "API Health" "$API_URL/health" "$TIMEOUT"
check_http_endpoint "API Ready" "$API_URL/ready" "$TIMEOUT"
check_http_endpoint "Core API" "$CORE_URL/health" "$TIMEOUT"
check_http_endpoint "Web App" "$WEB_URL" "$TIMEOUT"

# Checar portas TCP
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SERVIÇOS TCP${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

check_tcp_port "PostgreSQL" "$DB_HOST" "$DB_PORT"
check_tcp_port "Redis" "$REDIS_HOST" "$REDIS_PORT"

# Checar dados
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SERVIÇOS DATA${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

check_redis
check_postgres

# Estatísticas de containers
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}USO DE RECURSOS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

for container in postgres redis api platform-core worker web; do
    if docker ps --filter "name=omnichannel-mvp-$container" -q | grep -q . 2>/dev/null; then
        get_container_stats "omnichannel-mvp-$container"
    fi
done 2>/dev/null || echo "Docker containers não encontrados"

# Resumo
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}RESUMO${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

TOTAL=$((PASSED + FAILED))

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Todos os serviços estão saudáveis!${NC}"
    echo -e "  Passaram: ${PASSED}/${TOTAL}"
    exit 0
else
    echo -e "${RED}❌ Alguns serviços estão com problemas${NC}"
    echo -e "  Passaram: ${PASSED}/${TOTAL}"
    echo -e "  Falharam: ${RED}${FAILED}${NC}/${TOTAL}"
    exit 1
fi
