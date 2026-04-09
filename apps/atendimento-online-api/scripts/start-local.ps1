param(
  [int]$Port = 4010,
  [string]$DatabaseUrl = "postgresql://lista_da_vez:lista_da_vez_dev@localhost:55432/lista_da_vez?schema=atendimento_online",
  [string]$CoreApiBaseUrl = "http://127.0.0.1:4110",
  [string]$CorsOrigin = "http://localhost:3010,http://127.0.0.1:3010",
  [bool]$RedisDisabled = $true,
  [string]$RedisUrl = "redis://127.0.0.1:6390"
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
$outLog = Join-Path $logsDir "api-local.out.log"
$errLog = Join-Path $logsDir "api-local.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Stop-ListenerOnPort -TargetPort $Port

if (-not (Test-Path $outLog)) {
  New-Item -ItemType File -Force -Path $outLog | Out-Null
}
if (-not (Test-Path $errLog)) {
  New-Item -ItemType File -Force -Path $errLog | Out-Null
}

Clear-Content -Path $outLog, $errLog -ErrorAction SilentlyContinue

$env:DATABASE_URL = $DatabaseUrl
$env:REDIS_URL = $RedisUrl
$env:REDIS_DISABLED = if ($RedisDisabled) { "true" } else { "false" }
$env:PORT = "$Port"
$env:CORS_ORIGIN = $CorsOrigin
$env:CORE_API_BASE_URL = $CoreApiBaseUrl
$env:TRUSTED_PROXY_RANGES = "loopback,private"
$env:WEBHOOK_RECEIVER_BASE_URL = "http://127.0.0.1:$Port"

Push-Location $appDir
try {
  $generateProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "prisma:generate" `
    -WorkingDirectory $appDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -Wait
  if ($generateProcess.ExitCode -ne 0) {
    throw "Falha ao gerar o Prisma Client da atendimento-online-api."
  }

  $pushProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "prisma:push" `
    -WorkingDirectory $appDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -Wait
  if ($pushProcess.ExitCode -ne 0) {
    throw "Falha ao aplicar o schema Prisma da atendimento-online-api."
  }
} finally {
  Pop-Location
}

$process = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev" `
  -WorkingDirectory $appDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$ready = $false
for ($index = 0; $index -lt 50; $index++) {
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
  throw "A atendimento-online-api nao ficou pronta em http://127.0.0.1:$Port/health"
}

Write-Host "atendimento-online-api local iniciada."
Write-Host "Porta: $Port"
Write-Host "PID: $($process.Id)"
Write-Host "Health: http://127.0.0.1:$Port/health"
Write-Host "RedisDisabled: $RedisDisabled"
Write-Host "Logs: $outLog"
