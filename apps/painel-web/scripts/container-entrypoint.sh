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

main() {
  sync_dependencies

  if [ "${WEB_PRODUCTION_MODE:-0}" = "1" ]; then
    npm run build
    exec env NITRO_HOST=0.0.0.0 NITRO_PORT=3000 NODE_ENV=production node .output/server/index.mjs
  fi

  cleanup_artifacts
  exec npm run dev -- --host 0.0.0.0 --port 3000
}

main "$@"