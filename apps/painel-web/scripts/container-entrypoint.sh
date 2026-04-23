#!/bin/sh

set -eu

STATE_FILE="/app/node_modules/.deps-manifest.hash"

compute_manifest_hash() {
  (
    cat package.json
    if [ -f package-lock.json ]; then
      cat package-lock.json
    fi
  ) | sha256sum | awk '{print $1}'
}

sync_dependencies() {
  manifest_hash="$(compute_manifest_hash)"
  install_reason=""

  if [ "${WEB_FORCE_INSTALL:-0}" = "1" ]; then
    install_reason="WEB_FORCE_INSTALL"
  elif [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    install_reason="node_modules vazio"
  elif [ ! -f "$STATE_FILE" ]; then
    install_reason="sem estado de manifests"
  elif [ "$(cat "$STATE_FILE")" != "$manifest_hash" ]; then
    install_reason="package manifests alterados"
  fi

  if [ -n "$install_reason" ]; then
    echo "[painel-web] sincronizando dependencias ($install_reason)"
    if [ -f package-lock.json ]; then
      npm ci --no-audit --no-fund
    else
      npm install --no-audit --no-fund
    fi
    mkdir -p "$(dirname "$STATE_FILE")"
    printf '%s' "$manifest_hash" > "$STATE_FILE"
  fi
}

cleanup_artifacts() {
  mkdir -p .nuxt .output .nitro
  rm -rf .nuxt/* .nuxt/.[!.]* .nuxt/..?* .output/* .output/.[!.]* .output/..?* .nitro/* .nitro/.[!.]* .nitro/..?* 2>/dev/null || true
}

warmup_routes() {
  if [ "${WEB_WARMUP_ROUTES:-1}" != "1" ]; then
    return
  fi

  (
    for _ in $(seq 1 90); do
      if wget --quiet --tries=1 --timeout="${WEB_WARMUP_READY_TIMEOUT:-2}" --spider "http://127.0.0.1:3000/" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    for route in ${WEB_WARMUP_PATHS:-/admin/login /admin/fila-atendimento}; do
      echo "[painel-web] aquecendo rota ${route}"
      wget --quiet --tries=1 --timeout="${WEB_WARMUP_ROUTE_TIMEOUT:-90}" -O /dev/null "http://127.0.0.1:3000${route}" >/dev/null 2>&1 || true
    done
  ) &
}

main() {
  sync_dependencies

  if [ "${WEB_PRODUCTION_MODE:-0}" = "1" ]; then
    npm run build
    exec env NITRO_HOST=0.0.0.0 NITRO_PORT=3000 NODE_ENV=production node .output/server/index.mjs
  fi

  if [ "${WEB_CLEAN_ARTIFACTS:-0}" = "1" ]; then
    echo "[painel-web] limpando artefatos Nuxt por WEB_CLEAN_ARTIFACTS=1"
    cleanup_artifacts
  else
    mkdir -p .nuxt .output .nitro
  fi

  warmup_routes
  exec npm run dev -- --host 0.0.0.0 --port 3000
}

main "$@"
