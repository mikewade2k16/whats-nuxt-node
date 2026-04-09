param(
  [int]$Port = 3010,
  [string]$ApiInternalBase = "http://127.0.0.1:4010",
  [string]$CoreApiInternalBase = "http://127.0.0.1:4110",
  [string]$FilaAtendimentoWebBase = "http://127.0.0.1:3003",
  [string]$FilaAtendimentoApiBase = "http://127.0.0.1:8080",
  [string]$FilaAtendimentoShellBridgeSecret = "fila-atendimento-shell-bridge-dev"
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
$outLog = Join-Path $logsDir "dev-local.out.log"
$errLog = Join-Path $logsDir "dev-local.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Stop-ListenerOnPort -TargetPort $Port

if (-not (Test-Path $outLog)) {
  New-Item -ItemType File -Force -Path $outLog | Out-Null
}
if (-not (Test-Path $errLog)) {
  New-Item -ItemType File -Force -Path $errLog | Out-Null
}

Clear-Content -Path $outLog, $errLog -ErrorAction SilentlyContinue

$env:NUXT_PUBLIC_API_BASE = $ApiInternalBase
$env:NUXT_API_INTERNAL_BASE = $ApiInternalBase
$env:NUXT_CORE_API_INTERNAL_BASE = $CoreApiInternalBase
$env:NUXT_FILA_ATENDIMENTO_API_INTERNAL_BASE = $FilaAtendimentoApiBase
$env:NUXT_FILA_ATENDIMENTO_WEB_INTERNAL_BASE = $FilaAtendimentoWebBase
$env:NUXT_PUBLIC_FILA_ATENDIMENTO_BASE = $FilaAtendimentoWebBase
$env:NUXT_PUBLIC_FILA_ATENDIMENTO_API_BASE = $FilaAtendimentoApiBase
$env:NUXT_FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET = $FilaAtendimentoShellBridgeSecret
$env:NUXT_TRUSTED_PROXY_RANGES = "loopback,private"

$process = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--port", "$Port", "--host", "127.0.0.1" `
  -WorkingDirectory $appDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$ready = $false
for ($index = 0; $index -lt 80; $index++) {
  Start-Sleep -Milliseconds 750

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/admin/login" -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
  }
}

if (-not $ready) {
  throw "O painel-web nao ficou pronto em http://127.0.0.1:$Port/admin/login"
}

Write-Host "painel-web local iniciado."
Write-Host "Porta: $Port"
Write-Host "PID: $($process.Id)"
Write-Host "Login: http://127.0.0.1:$Port/admin/login"
Write-Host "Logs: $outLog"
