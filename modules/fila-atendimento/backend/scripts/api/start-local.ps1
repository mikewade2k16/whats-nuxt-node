param(
  [int]$Port = 8080,
  [string]$DatabaseUrl = "postgres://lista_da_vez:lista_da_vez_dev@localhost:5432/lista_da_vez?sslmode=disable",
  [string]$CorsAllowedOrigins = "http://localhost:*,http://127.0.0.1:*,http://[::1]:*",
  [bool]$RunMigrations = $true,
  [string]$ShellBridgeSecret = "fila-atendimento-shell-bridge-dev",
  [string]$ShellBridgeTenantSlug = "tenant-demo"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backDir = Resolve-Path (Join-Path $scriptDir "..\\..")
$logsDir = Join-Path $backDir ".logs"
$outLog = Join-Path $logsDir "api-local.out.log"
$errLog = Join-Path $logsDir "api-local.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stopScript = Join-Path $scriptDir "stop-local.ps1"
powershell -ExecutionPolicy Bypass -File $stopScript -Port $Port | Out-Null

$logsPrepared = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    if (-not (Test-Path $outLog)) {
      New-Item -ItemType File -Force -Path $outLog | Out-Null
    }
    if (-not (Test-Path $errLog)) {
      New-Item -ItemType File -Force -Path $errLog | Out-Null
    }

    Clear-Content -Path $outLog, $errLog -ErrorAction Stop
    $logsPrepared = $true
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if (-not $logsPrepared) {
  throw "Nao foi possivel preparar os logs locais da API."
}

$env:DATABASE_URL = $DatabaseUrl
$env:DATABASE_MIN_CONNS = "0"
$env:DATABASE_MAX_CONNS = "10"
$env:CORS_ALLOWED_ORIGINS = $CorsAllowedOrigins
$env:APP_ADDR = ":$Port"
$env:AUTH_SHELL_BRIDGE_SECRET = $ShellBridgeSecret
$env:AUTH_SHELL_BRIDGE_TENANT_SLUG = $ShellBridgeTenantSlug

if ($RunMigrations) {
  Push-Location $backDir
  try {
    & go run ./cmd/migrate up 1>> $outLog 2>> $errLog
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao aplicar migrations da API local."
    }
  } finally {
    Pop-Location
  }
}

$process = Start-Process -FilePath "go" `
  -ArgumentList "run", "./cmd/api" `
  -WorkingDirectory $backDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$ready = $false
for ($index = 0; $index -lt 40; $index++) {
  Start-Sleep -Milliseconds 500

  try {
    $health = Invoke-RestMethod -Method Get -Uri "http://localhost:$Port/healthz"
    if ($health.status -eq "ok") {
      $ready = $true
      break
    }
  } catch {
  }
}

if (-not $ready) {
  throw "A API nao ficou pronta em http://localhost:$Port/healthz"
}

Write-Host "API local iniciada."
Write-Host "Porta: $Port"
Write-Host "PID: $($process.Id)"
Write-Host "Health: http://localhost:$Port/healthz"
Write-Host "RunMigrations: $RunMigrations"
Write-Host "ShellBridgeTenantSlug: $ShellBridgeTenantSlug"
Write-Host "Logs: $outLog"
