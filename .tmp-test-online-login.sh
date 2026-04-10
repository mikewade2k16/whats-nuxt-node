#!/bin/sh
set -eu

cd /opt/omnichannel

compose_cmd='docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod'
payload='{"email":"mikewade2k16@gmail.com","password":"123123456"}'

echo '--- CORE DIRECT ---'
$compose_cmd exec -T painel-web sh -lc '
  apk add --no-cache curl >/dev/null 2>&1 || true
  curl -sS -o /tmp/core-login.json -w "%{http_code}" \
    -H "content-type: application/json" \
    -d '"'"'"$payload"'"'"' \
    http://plataforma-api:4100/core/auth/login
  echo
  cat /tmp/core-login.json
'

echo '--- CORE BFF ---'
$compose_cmd exec -T caddy sh -lc '
  apk add --no-cache curl >/dev/null 2>&1 || true
  curl -sS -o /tmp/bff-login.json -w "%{http_code}" \
    -H "content-type: application/json" \
    -d '"'"'"$payload"'"'"' \
    http://painel-web:3000/api/core-bff/core/auth/login
  echo
  cat /tmp/bff-login.json
'
