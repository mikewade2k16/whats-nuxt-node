#!/bin/sh
set -eu

cd /opt/omnichannel

core_db_url="$(grep '^CORE_DATABASE_URL=' .env.prod | cut -d= -f2-)"

if [ -z "$core_db_url" ]; then
  echo "CORE_DATABASE_URL ausente em .env.prod" >&2
  exit 1
fi

tmp_file=".env.prod.tmp"
grep -v '^FILA_ATENDIMENTO_DATABASE_URL=' .env.prod > "$tmp_file"
printf '\nFILA_ATENDIMENTO_DATABASE_URL=%s\n' "$core_db_url" >> "$tmp_file"
mv "$tmp_file" .env.prod

grep -E '^(CORE_DATABASE_URL|FILA_ATENDIMENTO_DATABASE_URL)=' .env.prod | cut -d= -f1
