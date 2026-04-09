param(
  [int]$Port = 4110,
  [string]$DatabaseUrl = "postgres://lista_da_vez:lista_da_vez_dev@localhost:55432/lista_da_vez?sslmode=disable",
  [string]$DatabaseSchema = "platform_core",
  [string]$JwtSecret = "plataforma-api-local-dev-secret",
  [string]$AllowedOrigins = "http://localhost:3010,http://127.0.0.1:3010,http://localhost:3003,http://127.0.0.1:3003",
  [bool]$RunMigrations = $true
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Stop-ListenerOnPort([int]$TargetPort) {
  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $TargetPort -ErrorAction SilentlyContinue
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
      if ($processId) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Resolve-Path (Join-Path $scriptDir "..")
$logsDir = Join-Path $appDir ".logs"
$outLog = Join-Path $logsDir "server-local.out.log"
$errLog = Join-Path $logsDir "server-local.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Stop-ListenerOnPort -TargetPort $Port

if (-not (Test-Path $outLog)) {
  New-Item -ItemType File -Force -Path $outLog | Out-Null
}
if (-not (Test-Path $errLog)) {
  New-Item -ItemType File -Force -Path $errLog | Out-Null
}

Clear-Content -Path $outLog, $errLog -ErrorAction SilentlyContinue

$env:CORE_DATABASE_URL = $DatabaseUrl
$env:CORE_DB_SCHEMA = $DatabaseSchema
$env:CORE_JWT_SECRET = $JwtSecret
$env:CORE_HTTP_ADDR = ":$Port"
$env:CORE_ALLOWED_ORIGINS = $AllowedOrigins
$env:CORE_AUTO_MIGRATE = "false"
$env:CORE_REDIS_URL = "redis://127.0.0.1:6390/15"
$env:REDIS_URL = "redis://127.0.0.1:6390/15"

if ($RunMigrations) {
  $migrateProcess = Start-Process -FilePath "go" `
    -ArgumentList "run", "./cmd/migrate" `
    -WorkingDirectory $appDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -Wait

  if ($migrateProcess.ExitCode -ne 0) {
    throw "Falha ao aplicar migrations da plataforma-api local."
  }
}

$process = Start-Process -FilePath "go" `
  -ArgumentList "run", "./cmd/server" `
  -WorkingDirectory $appDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$ready = $false
for ($index = 0; $index -lt 40; $index++) {
  Start-Sleep -Milliseconds 500

  try {
    $response = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health"
    if ($response.status -eq "ok") {
      $ready = $true
      break
    }
  } catch {
  }
}

if (-not $ready) {
  throw "A plataforma-api nao ficou pronta em http://127.0.0.1:$Port/health"
}

Write-Host "plataforma-api local iniciada."
Write-Host "Porta: $Port"
Write-Host "PID: $($process.Id)"
Write-Host "Health: http://127.0.0.1:$Port/health"
Write-Host "Schema: $DatabaseSchema"
Write-Host "Logs: $outLog"
